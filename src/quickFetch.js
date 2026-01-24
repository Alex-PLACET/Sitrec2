import {indexedDBManager} from "./IndexedDBManager";
import {LoadingManager} from "./CLoadingManager";

const INITIAL_CHUNK_SIZE = 3 * 1024 * 1024; // 3MB initial request
const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB subsequent chunks
const CONCURRENCY = 4;
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

let quickFetchEnabled = true;
let cacheEnabled = true;

export function setQuickFetchEnabled(enabled) {
    quickFetchEnabled = enabled;
}

export function setCacheEnabled(enabled) {
    cacheEnabled = enabled;
}

function isS3Url(url) {
    return url.includes('.s3.') || url.includes('.s3-');
}

function getCacheKey(url) {
    return `quickfetch:${url}`;
}

async function downloadChunk(url, start, end, signal) {
    const response = await fetch(url, {
        headers: { 'Range': `bytes=${start}-${end}` },
        signal,
    });
    
    if (!response.ok && response.status !== 206) {
        throw new Error(`Chunk download failed: ${response.status}`);
    }
    
    return response.arrayBuffer();
}

async function fetchRemainingChunks(url, remainingStart, totalSize, signal, loadingId) {
    const remainingChunks = [];
    let pos = remainingStart;
    while (pos < totalSize) {
        const end = Math.min(pos + CHUNK_SIZE - 1, totalSize - 1);
        remainingChunks.push({ start: pos, end, index: remainingChunks.length });
        pos = end + 1;
    }
    
    if (remainingChunks.length === 0) return [];
    
    const chunkBuffers = new Array(remainingChunks.length);
    let activeDownloads = 0;
    let nextIdx = 0;
    let completedBytes = remainingStart;
    
    return new Promise((resolve, reject) => {
        const startNext = () => {
            if (signal?.aborted) {
                reject(new DOMException('Aborted', 'AbortError'));
                return;
            }
            
            while (activeDownloads < CONCURRENCY && nextIdx < remainingChunks.length) {
                const chunk = remainingChunks[nextIdx++];
                activeDownloads++;
                downloadChunk(url, chunk.start, chunk.end, signal)
                    .then(buf => {
                        chunkBuffers[chunk.index] = buf;
                        completedBytes += buf.byteLength;
                        activeDownloads--;
                        
                        if (loadingId) {
                            LoadingManager.updateProgress(loadingId, (completedBytes / totalSize) * 100);
                        }
                        
                        if (nextIdx >= remainingChunks.length && activeDownloads === 0) {
                            resolve(chunkBuffers);
                        } else {
                            startNext();
                        }
                    })
                    .catch(reject);
            }
        };
        startNext();
    });
}

export async function quickFetch(url, options = {}) {
    const {
        useCache = cacheEnabled,
        showLoading = false,
        loadingCategory = "Download",
        signal,
        ...fetchOptions
    } = options;
    
    if (!quickFetchEnabled) {
        return fetch(url, { signal, ...fetchOptions });
    }
    
    if (useCache) {
        try {
            const cached = await indexedDBManager.getCachedData(getCacheKey(url));
            if (cached) {
                console.log(`[quickFetch] Cache hit: ${url}`);
                return new Response(cached, {
                    status: 200,
                    headers: new Headers({ 'Content-Type': 'application/octet-stream' }),
                });
            }
        } catch (e) {
        }
    }
    
    if (!isS3Url(url)) {
        return fetch(url, { signal, ...fetchOptions });
    }
    
    let loadingId = null;
    if (showLoading) {
        loadingId = `quickfetch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        LoadingManager.registerLoading(loadingId, url, loadingCategory);
    }
    
    try {
        const initialResponse = await fetch(url, {
            headers: { 'Range': `bytes=0-${INITIAL_CHUNK_SIZE - 1}` },
            signal,
        });
        
        if (initialResponse.status === 200) {
            const buffer = await initialResponse.arrayBuffer();
            if (loadingId) LoadingManager.completeLoading(loadingId);
            if (useCache) {
                try {
                    await indexedDBManager.cacheData(getCacheKey(url), buffer, CACHE_TTL);
                } catch (e) {}
            }
            return new Response(buffer, {
                status: 200,
                headers: new Headers({
                    'Content-Type': initialResponse.headers.get('Content-Type') || 'application/octet-stream',
                    'Content-Length': buffer.byteLength.toString(),
                }),
            });
        }
        
        if (initialResponse.status !== 206) {
            if (loadingId) LoadingManager.completeLoading(loadingId);
            return initialResponse;
        }
        
        const contentRange = initialResponse.headers.get('Content-Range');
        const match = contentRange?.match(/bytes \d+-\d+\/(\d+)/);
        if (!match) {
            if (loadingId) LoadingManager.completeLoading(loadingId);
            const buffer = await initialResponse.arrayBuffer();
            return new Response(buffer, { status: 200, headers: initialResponse.headers });
        }
        
        const totalSize = parseInt(match[1], 10);
        const initialBuffer = await initialResponse.arrayBuffer();
        const contentType = initialResponse.headers.get('Content-Type') || 'application/octet-stream';
        
        if (loadingId) {
            LoadingManager.updateProgress(loadingId, (initialBuffer.byteLength / totalSize) * 100);
        }
        
        if (initialBuffer.byteLength >= totalSize) {
            if (loadingId) LoadingManager.completeLoading(loadingId);
            if (useCache) {
                try {
                    await indexedDBManager.cacheData(getCacheKey(url), initialBuffer, CACHE_TTL);
                } catch (e) {}
            }
            return new Response(initialBuffer, {
                status: 200,
                headers: new Headers({
                    'Content-Type': contentType,
                    'Content-Length': totalSize.toString(),
                }),
            });
        }
        
        console.log(`[quickFetch] Parallel download: ${url} (${(totalSize / 1024 / 1024).toFixed(2)} MB)`);
        
        const chunkBuffers = await fetchRemainingChunks(url, initialBuffer.byteLength, totalSize, signal, loadingId);
        
        const combined = new Uint8Array(totalSize);
        combined.set(new Uint8Array(initialBuffer), 0);
        let offset = initialBuffer.byteLength;
        for (const buf of chunkBuffers) {
            combined.set(new Uint8Array(buf), offset);
            offset += buf.byteLength;
        }
        
        if (loadingId) LoadingManager.completeLoading(loadingId);
        
        if (useCache) {
            try {
                await indexedDBManager.cacheData(getCacheKey(url), combined.buffer, CACHE_TTL);
                console.log(`[quickFetch] Cached: ${url}`);
            } catch (e) {
                console.warn(`[quickFetch] Cache write failed:`, e);
            }
        }
        
        return new Response(combined.buffer, {
            status: 200,
            headers: new Headers({
                'Content-Type': contentType,
                'Content-Length': totalSize.toString(),
            }),
        });
        
    } catch (err) {
        if (loadingId) LoadingManager.completeLoading(loadingId);
        
        if (err.name === 'AbortError') {
            throw err;
        }
        
        console.warn(`[quickFetch] Parallel download failed, falling back to regular fetch:`, err);
        return fetch(url, { signal, ...fetchOptions });
    }
}

export async function clearQuickFetchCache() {
    try {
        await indexedDBManager.clearCache();
        console.log('[quickFetch] Cache cleared');
    } catch (e) {
        console.error('[quickFetch] Failed to clear cache:', e);
    }
}

export default quickFetch;
