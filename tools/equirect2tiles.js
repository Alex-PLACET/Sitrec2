#!/usr/bin/env node
/**
 * equirect2tiles.js — Convert an equirectangular image to a z/x/y Web Mercator tileset
 *
 * Tiles use the standard "slippy map" numbering (same as OSM, Mapbox, etc.)
 * and are reprojected from plate carrée (equirectangular) to Web Mercator.
 *
 * The max zoom level is auto-calculated from the image height:
 *   maxZoom = floor(log2(height / 256))
 *
 * Output structure: <output_dir>/z/x/y.jpg  (or .png with --format png)
 *
 * Usage:
 *   node equirect2tiles.js <source_image> <output_dir> [--format jpg|png] [--quality 90]
 *
 * Examples:
 *   node equirect2tiles.js data/images/2_no_clouds_4k.jpg data/maps/no_clouds_4k
 *   node equirect2tiles.js blue_marble_21k.png tiles/ --format png
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const TILE_SIZE = 256;

// Convert tile Y index (can be fractional) to latitude in degrees
function tileToLat(y, z) {
    const n = Math.PI - 2 * Math.PI * y / Math.pow(2, z);
    return Math.atan(Math.sinh(n)) * 180 / Math.PI;
}

// Convert tile X index (can be fractional) to longitude in degrees
function tileToLon(x, z) {
    return x / Math.pow(2, z) * 360 - 180;
}

// Bilinear interpolation sample from source buffer
function sampleBilinear(data, width, height, channels, px, py) {
    const x0 = Math.floor(px);
    const y0 = Math.floor(py);
    const x1 = Math.min(x0 + 1, width - 1);
    const y1 = Math.min(y0 + 1, height - 1);
    const fx = px - x0;
    const fy = py - y0;

    const i00 = (y0 * width + x0) * channels;
    const i10 = (y0 * width + x1) * channels;
    const i01 = (y1 * width + x0) * channels;
    const i11 = (y1 * width + x1) * channels;

    const w00 = (1 - fx) * (1 - fy);
    const w10 = fx * (1 - fy);
    const w01 = (1 - fx) * fy;
    const w11 = fx * fy;

    const result = new Array(channels);
    for (let c = 0; c < channels; c++) {
        result[c] = data[i00 + c] * w00 + data[i10 + c] * w10
                  + data[i01 + c] * w01 + data[i11 + c] * w11;
    }
    return result;
}

async function main() {
    const args = process.argv.slice(2);

    // Parse arguments
    let format = 'jpg', quality = 90;
    const positional = [];
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--format') format = args[++i];
        else if (args[i] === '--quality') quality = parseInt(args[++i]);
        else positional.push(args[i]);
    }

    if (positional.length < 2) {
        console.log('Usage: node equirect2tiles.js <source_image> <output_dir> [--format jpg|png] [--quality 90]');
        process.exit(1);
    }

    const srcPath = positional[0];
    const outDir = positional[1];
    const ext = format === 'png' ? 'png' : 'jpg';

    console.log(`Loading ${srcPath}...`);

    // Load source image as raw RGB
    const { data, info } = await sharp(srcPath)
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    const srcWidth = info.width;
    const srcHeight = info.height;
    const channels = 3;

    const maxZoom = Math.floor(Math.log2(srcHeight / TILE_SIZE));

    let totalTiles = 0;
    for (let z = 0; z <= maxZoom; z++) totalTiles += Math.pow(4, z);

    console.log(`Source: ${srcWidth}x${srcHeight}`);
    console.log(`Max zoom: ${maxZoom} (levels 0–${maxZoom})`);
    console.log(`Total tiles: ${totalTiles}`);
    console.log(`Format: ${ext}, quality: ${quality}`);

    let tileCount = 0;

    for (let z = 0; z <= maxZoom; z++) {
        const numTiles = Math.pow(2, z);

        for (let x = 0; x < numTiles; x++) {
            const tileDir = path.join(outDir, String(z), String(x));
            fs.mkdirSync(tileDir, { recursive: true });

            for (let y = 0; y < numTiles; y++) {
                const tileBuffer = Buffer.alloc(TILE_SIZE * TILE_SIZE * channels);

                for (let ty = 0; ty < TILE_SIZE; ty++) {
                    // Mercator Y position (fractional tile coordinate)
                    const mercY = y + (ty + 0.5) / TILE_SIZE;
                    const lat = tileToLat(mercY, z);

                    // Equirectangular: latitude maps linearly to source Y
                    const srcY = (90 - lat) / 180 * srcHeight;
                    const clampedY = Math.max(0, Math.min(srcY, srcHeight - 1));

                    for (let tx = 0; tx < TILE_SIZE; tx++) {
                        // Mercator X position (fractional tile coordinate)
                        const mercX = x + (tx + 0.5) / TILE_SIZE;
                        const lon = tileToLon(mercX, z);

                        // Equirectangular: longitude maps linearly to source X
                        let srcX = (lon + 180) / 360 * srcWidth;
                        if (srcX < 0) srcX += srcWidth;
                        if (srcX >= srcWidth) srcX -= srcWidth;

                        const pixel = sampleBilinear(data, srcWidth, srcHeight, channels, srcX, clampedY);

                        const dstIdx = (ty * TILE_SIZE + tx) * channels;
                        tileBuffer[dstIdx]     = Math.round(pixel[0]);
                        tileBuffer[dstIdx + 1] = Math.round(pixel[1]);
                        tileBuffer[dstIdx + 2] = Math.round(pixel[2]);
                    }
                }

                const tilePath = path.join(tileDir, `${y}.${ext}`);

                const pipeline = sharp(tileBuffer, {
                    raw: { width: TILE_SIZE, height: TILE_SIZE, channels }
                });

                if (format === 'png') {
                    await pipeline.png().toFile(tilePath);
                } else {
                    await pipeline.jpeg({ quality }).toFile(tilePath);
                }

                tileCount++;
                if (tileCount % 10 === 0 || tileCount === totalTiles) {
                    process.stdout.write(`\r  [${tileCount}/${totalTiles}] tiles`);
                }
            }
        }
    }

    console.log(`\nDone! ${tileCount} tiles saved to ${outDir}/`);
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
