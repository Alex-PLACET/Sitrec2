import {CanvasTexture, Texture} from "three";
import {createTerrainDayNightMaterial} from "./TerrainDayNightMaterial";
import {TileUsageTracker} from "../../../TileUsageTracker";
import {ServiceAvailability} from "../../../ServiceAvailability";

function logNetwork(url, status) {
    // if (Globals.regression) {
    //     console.log(`[NET:${url}:${status}]`);
    // }
}


// Queue to hold pending requests
const requestQueue = [];
let activeRequests = 0;
const MAX_CONCURRENT_REQUESTS = 5;

function processQueue() {
  // Process the next request if we have capacity
  if (activeRequests < MAX_CONCURRENT_REQUESTS && requestQueue.length > 0) {
    const nextRequest = requestQueue.shift();
    activeRequests++;
    nextRequest();
  }
}

// Function to load a texture with retries and delay on error
export function loadTextureWithRetries(url, maxRetries = 0, delay = 100, currentAttempt = 0, urlIndex = 0, abortSignal = null) {
  // we expect url to be an array of 1 or more urls which we try in sequence until one works
  // if we are passed in a single string, convert it to an array
  if (typeof url === 'string') {
    url = [url];
  }

  return new Promise((resolve, reject) => {
    // Check if already aborted
    if (abortSignal?.aborted) {
      reject(new Error('Aborted'));
      return;
    }

    // Pre-flight: reject immediately if the service is known to be unavailable
    if (!ServiceAvailability.isAvailableByUrl(url[0])) {
      reject(new Error('ServiceUnavailable'));
      return;
    }

    const attemptLoad = () => {
      // Check abort signal before each attempt
      if (abortSignal?.aborted) {
        activeRequests--;
        processQueue();
        reject(new Error('Aborted'));
        return;
      }

      const currentUrl = url[urlIndex];
      logNetwork(currentUrl, 'pending');

      fetch(currentUrl, {signal: abortSignal ?? undefined})
        .then(response => {
          if (abortSignal?.aborted) throw new Error('Aborted');

          if (!response.ok) {
            // We have the actual HTTP status code — only count server errors
            // (5xx) as service failures. 404/403 are expected for missing tiles.
            const status = response.status;
            logNetwork(currentUrl, status);
            if (status >= 500) {
              ServiceAvailability.recordFailureByUrl(currentUrl);
            }
            throw new Error(`HTTP ${status}`);
          }
          return response.blob();
        })
        .then(blob => {
          // Create an Image element (same as Three.js TextureLoader) rather than
          // ImageBitmap, because Texture.flipY has no effect on ImageBitmap.
          return new Promise((resolveImg, rejectImg) => {
            const objectUrl = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = () => { URL.revokeObjectURL(objectUrl); resolveImg(img); };
            img.onerror = () => { URL.revokeObjectURL(objectUrl); rejectImg(new Error('Image decode failed')); };
            img.src = objectUrl;
          });
        })
        .then(img => {
          if (abortSignal?.aborted) {
            throw new Error('Aborted');
          }

          const texture = new Texture(img);
          texture.needsUpdate = true;

          TileUsageTracker.trackTile(currentUrl);
          ServiceAvailability.recordSuccessByUrl(currentUrl);
          logNetwork(currentUrl, 200);
          resolve(texture);
          activeRequests--;
          processQueue();
        })
        .catch(err => {
          activeRequests--;

          if (err.message === 'Aborted' || abortSignal?.aborted) {
            processQueue();
            reject(new Error('Aborted'));
            return;
          }

          // Network errors (fetch failed entirely) count as service failures
          if (err.name === 'TypeError') {
            ServiceAvailability.recordFailureByUrl(currentUrl);
          }

          // Try next URL in the list
          if (urlIndex < url.length - 1) {
            urlIndex++;
            activeRequests++;
            attemptLoad();
          } else if (currentAttempt < maxRetries) {
            console.log(`Retry ${currentAttempt + 1}/${maxRetries} for ${currentUrl} after delay`);
            setTimeout(() => {
              if (abortSignal?.aborted) {
                reject(new Error('Aborted'));
                return;
              }
              loadTextureWithRetries(url, maxRetries, delay, currentAttempt + 1, urlIndex, abortSignal)
                  .then(resolve)
                  .catch(reject);
            }, delay);
          } else {
            console.log(`Failed to load ${currentUrl} after ${maxRetries} attempts`);
            logNetwork(currentUrl, 'failed');
            reject(err);
            processQueue();
          }
        });
    };

    // Set up abort listener
    if (abortSignal) {
      abortSignal.addEventListener('abort', () => {
        reject(new Error('Aborted'));
      });
    }

    if (activeRequests < MAX_CONCURRENT_REQUESTS) {
      activeRequests++;
      attemptLoad();
    } else {
      // Add to queue
      requestQueue.push(attemptLoad);
    }
  });
}


const QuadTextureMaterial = (urls) => {
  return Promise.all(urls.map(url => loadTextureWithRetries(url))).then(maps => {
    // Combine the 4 texture tiles into a single double resolution texture
    // Maps are arranged as: [SW, NW, SE, NE]
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    canvas.width = maps[0].image.width * 2
    canvas.height = maps[0].image.height * 2
    ctx.drawImage(maps[0].image, 0, 0)  // SW - bottom left
    ctx.drawImage(maps[1].image, 0, maps[0].image.height)  // NW - top left
    ctx.drawImage(maps[2].image, maps[0].image.width, 0)  // SE - bottom right
    ctx.drawImage(maps[3].image, maps[0].image.width, maps[0].image.height)  // NE - top right
    
    const texture = new CanvasTexture(canvas)
    // NOTE: NOT setting SRGBColorSpace here — terrain shader does lighting
    // in sRGB space (Phase 4 will convert it to linear workflow)
    texture.needsUpdate = true
    
    // Clean up temporary resources
    canvas.remove()
    maps.forEach(map => map.dispose())

    // Use custom terrain shader with day/night lighting and terrain shading
    return createTerrainDayNightMaterial(texture, 0.3);
  })
}

export default QuadTextureMaterial
