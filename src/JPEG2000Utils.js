/**
 * JPEG2000Utils.js - Decode JPEG 2000 files using OpenJPEG WebAssembly
 *
 * Uses @cornerstonejs/codec-openjpeg (WASM port of OpenJPEG) for robust decoding.
 *
 * OpenJPEG handles:
 *  - Inverse MCT (RCT/ICT) when codestream has MCT=1
 *  - cdef box component reordering (JP2 containers)
 *
 * OpenJPEG does NOT handle:
 *  - sYCC→RGB color conversion (colr box EnumCS=18)
 *  - That's the application's responsibility (per the JPEG 2000 spec)
 *
 * So we detect sYCC from either:
 *  - JP2 colr box (EnumCS=18) — for standalone JP2 files
 *  - NITF IREP field (YCbCr601) — for NITF-wrapped J2K codestreams
 * and apply the conversion ourselves, with a Cb-mean heuristic to catch
 * mislabeled files that declare sYCC but actually contain RGB data.
 *
 * The WASM module is loaded lazily on first use and cached.
 * The .wasm file is copied to libs/openjpeg/ by webpackCopyPatterns.js.
 */

import {createImageFromArrayBuffer} from "./FileUtils";

let _openjpegModule = null;

/**
 * Lazily load and cache the OpenJPEG WASM module.
 * The Emscripten-generated JS is IIFE/UMD, loaded via script tag.
 */
async function getOpenJPEGModule() {
    if (_openjpegModule) return _openjpegModule;

    if (typeof window.OpenJPEGWASM === 'undefined') {
        await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = './libs/openjpeg/openjpegwasm_decode.js';
            script.onload = resolve;
            script.onerror = () => reject(new Error('Failed to load OpenJPEG WASM'));
            document.head.appendChild(script);
        });
    }

    _openjpegModule = await window.OpenJPEGWASM({
        locateFile: (filename) => `./libs/openjpeg/${filename}`,
    });

    return _openjpegModule;
}

/**
 * Parse JP2 container colr box to detect sYCC color space.
 * Returns EnumCS (16=sRGB, 18=sYCC, etc.) or null for raw J2K codestreams.
 */
function getJP2EnumCS(bytes) {
    if (bytes.length < 12 || bytes[4] !== 0x6A || bytes[5] !== 0x50) return null; // not JP2

    let pos = 0;
    const limit = Math.min(bytes.length, 1024);
    while (pos < limit - 8) {
        const boxLen = (bytes[pos] << 24) | (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3];
        const boxType = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);
        if (boxLen < 8 || boxLen > bytes.length - pos) break;

        if (boxType === 'colr' && boxLen >= 15 && bytes[pos + 8] === 1) {
            return (bytes[pos + 11] << 24) | (bytes[pos + 12] << 16) |
                   (bytes[pos + 13] << 8) | bytes[pos + 14];
        }

        pos += (boxType === 'jp2h') ? 8 : boxLen;
    }
    return null;
}

/**
 * Convert sYCC (YCbCr) pixel data to RGB in-place.
 * componentMap: [indexOfY, indexOfCb, indexOfCr] or null for default [0,1,2].
 */
function convertSYCCtoRGB(items, nc, pixelCount, componentMap) {
    const yIdx  = componentMap ? componentMap[0] : 0;
    const cbIdx = componentMap ? componentMap[1] : 1;
    const crIdx = componentMap ? componentMap[2] : 2;

    for (let i = 0; i < pixelCount; i++) {
        const off = i * nc;
        const y  = items[off + yIdx];
        const cb = items[off + cbIdx] - 128;
        const cr = items[off + crIdx] - 128;
        items[off]     = Math.max(0, Math.min(255, Math.round(y + 1.402 * cr)));
        items[off + 1] = Math.max(0, Math.min(255, Math.round(y - 0.34414 * cb - 0.71414 * cr)));
        items[off + 2] = Math.max(0, Math.min(255, Math.round(y + 1.772 * cb)));
    }
}

/**
 * Check if decoded data actually contains YCbCr by examining the Cb channel.
 * Real sYCC has Cb centered near 128 (neutral chrominance). RGB data
 * mislabeled as sYCC will have Cb mean far from 128.
 * Returns true if the data appears to be genuine YCbCr.
 */
function looksLikeYCbCr(decoded, nc, pixelCount, cbIdx) {
    // Sample uniformly across the image (not just the start, which may be
    // biased by sky/ground regions with non-neutral chrominance).
    const sampleCount = Math.min(pixelCount, 10000);
    const step = Math.max(1, Math.floor(pixelCount / sampleCount));
    let cbSum = 0;
    let n = 0;
    for (let i = 0; i < pixelCount; i += step) {
        cbSum += decoded[i * nc + cbIdx];
        n++;
    }
    const cbMean = cbSum / n;
    const offset = Math.abs(cbMean - 128);
    return {isYCbCr: offset < 15, cbMean, offset};
}

/**
 * Decode a JPEG 2000 buffer to a canvas using OpenJPEG WASM.
 *
 * @param {ArrayBuffer} arrayBuffer - Raw JP2/J2K file data
 * @param {Object} [options] - Color space overrides for raw J2K codestreams
 *   (NITF IREP/IREPBAND). Not needed for JP2 containers — colr box is read.
 * @param {boolean} [options.isYCbCr] - Data is in YCbCr color space
 * @param {number[]} [options.componentMap] - [Y, Cb, Cr] → codestream indices
 * @returns {Promise<{canvas: HTMLCanvasElement, width: number, height: number}>}
 */
async function decodeJPEG2000ToCanvas(arrayBuffer, options) {
    const Module = await getOpenJPEGModule();
    const inputData = new Uint8Array(arrayBuffer);

    const decoder = new Module.J2KDecoder();
    try {
        const encodedBuffer = decoder.getEncodedBuffer(inputData.length);
        encodedBuffer.set(inputData);
        decoder.decode();

        const frameInfo = decoder.getFrameInfo();
        const width = frameInfo.width;
        const height = frameInfo.height;
        const nc = frameInfo.componentCount;
        const bps = frameInfo.bitsPerSample;
        const rawDecoded = decoder.getDecodedBuffer();
        const pixelCount = width * height;

        // For >8-bit images, OpenJPEG stores each sample in 2 bytes (little-endian).
        // Convert to 8-bit by scaling to 0-255.
        let decoded;
        if (bps > 8) {
            const maxVal = (1 << bps) - 1;
            decoded = new Uint8Array(pixelCount * nc);
            for (let i = 0; i < pixelCount * nc; i++) {
                const lo = rawDecoded[i * 2];
                const hi = rawDecoded[i * 2 + 1];
                decoded[i] = Math.round((lo | (hi << 8)) * 255 / maxVal);
            }
            console.log(`JPEG2000Utils: OpenJPEG decoded ${width}×${height}, ${nc} components, ${bps}-bit → 8-bit`);
        } else {
            decoded = rawDecoded;
            console.log(`JPEG2000Utils: OpenJPEG decoded ${width}×${height}, ${nc} components`);
        }

        // Determine if sYCC→RGB conversion is needed.
        // Source 1: caller-provided options (NITF IREP)
        // Source 2: JP2 colr box (EnumCS=18 = sYCC)
        let needsConvert = false;
        let componentMap = null;

        if (options && options.isYCbCr) {
            needsConvert = true;
            componentMap = options.componentMap || null;
        } else if (nc >= 3) {
            const enumCS = getJP2EnumCS(inputData);
            if (enumCS === 18) {
                needsConvert = true;
                // OpenJPEG already applied cdef reordering, so components
                // are in standard [Y, Cb, Cr] order after decoding.
            }
        }

        if (needsConvert && nc >= 3) {
            const cbIdx = componentMap ? componentMap[1] : 1;
            const check = looksLikeYCbCr(decoded, nc, pixelCount, cbIdx);
            if (check.isYCbCr) {
                convertSYCCtoRGB(decoded, nc, pixelCount, componentMap);
                console.log(`JPEG2000Utils: sYCC→RGB (Cb mean=${check.cbMean.toFixed(1)})`);
            } else {
                console.log(`JPEG2000Utils: Skipped sYCC→RGB — data is RGB despite metadata (Cb mean=${check.cbMean.toFixed(1)})`);
            }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(width, height);
        const rgba = imageData.data;

        if (nc >= 3) {
            for (let i = 0; i < pixelCount; i++) {
                rgba[i * 4]     = decoded[i * nc];
                rgba[i * 4 + 1] = decoded[i * nc + 1];
                rgba[i * 4 + 2] = decoded[i * nc + 2];
                rgba[i * 4 + 3] = nc >= 4 ? decoded[i * nc + 3] : 255;
            }
        } else {
            for (let i = 0; i < pixelCount; i++) {
                const v = decoded[i];
                rgba[i * 4] = v;
                rgba[i * 4 + 1] = v;
                rgba[i * 4 + 2] = v;
                rgba[i * 4 + 3] = 255;
            }
        }

        ctx.putImageData(imageData, 0, 0);
        return {canvas, width, height};
    } finally {
        decoder.delete();
    }
}

/**
 * Decode a JPEG 2000 buffer and return an HTMLImageElement.
 */
export async function decodeJPEG2000ToImage(arrayBuffer, options) {
    const {canvas} = await decodeJPEG2000ToCanvas(arrayBuffer, options);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const pngBuffer = await blob.arrayBuffer();
    return createImageFromArrayBuffer(pngBuffer, 'image/png');
}

/**
 * Decode a JPEG 2000 buffer and return a persistent blob URL.
 */
export async function decodeJPEG2000ToBlobURL(arrayBuffer, options) {
    const {canvas} = await decodeJPEG2000ToCanvas(arrayBuffer, options);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    return URL.createObjectURL(blob);
}
