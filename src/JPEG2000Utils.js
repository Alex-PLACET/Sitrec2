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
 * Extract TRC (Tone Reproduction Curve) LUTs from an ICC profile embedded
 * in a JP2 colr box (method=2). Returns an array of 3 LUTs [rTRC, gTRC, bTRC],
 * each a Uint16Array of values 0-65535, or null if no ICC profile / no curves.
 */
function extractICCTRCs(bytes) {
    if (bytes.length < 12 || bytes[4] !== 0x6A || bytes[5] !== 0x50) return null;

    // Find colr box with method=2 (ICC profile)
    let pos = 0;
    let profileStart = -1, profileLen = 0;
    const limit = Math.min(bytes.length, 50000); // ICC profiles can be large
    while (pos < limit - 8) {
        const boxLen = (bytes[pos] << 24) | (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3];
        const boxType = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);
        if (boxLen < 8 || boxLen > bytes.length - pos) break;

        if (boxType === 'colr' && bytes[pos + 8] === 2) {
            profileStart = pos + 11; // skip box header(8) + method(1) + prec(1) + approx(1)
            profileLen = boxLen - 11;
            break;
        }
        pos += (boxType === 'jp2h') ? 8 : boxLen;
    }
    if (profileStart < 0) return null;

    const p = bytes.subarray(profileStart, profileStart + profileLen);
    if (p.length < 132) return null;

    const read32 = (off) => (p[off] << 24) | (p[off + 1] << 16) | (p[off + 2] << 8) | p[off + 3];
    const read16 = (off) => (p[off] << 8) | p[off + 1];

    const tagCount = read32(128);
    const tags = {};
    for (let i = 0; i < tagCount; i++) {
        const off = 132 + i * 12;
        const sig = String.fromCharCode(p[off], p[off + 1], p[off + 2], p[off + 3]);
        tags[sig] = {offset: read32(off + 4), length: read32(off + 8)};
    }

    function parseTRC(tag) {
        if (!tag || tag.offset + 12 > p.length) return null;
        const type = String.fromCharCode(p[tag.offset], p[tag.offset + 1], p[tag.offset + 2], p[tag.offset + 3]);
        if (type !== 'curv') return null;
        const count = read32(tag.offset + 8);
        if (count === 0) return null; // identity
        if (count === 1) {
            // Single gamma value (fixed 8.8)
            const gamma = read16(tag.offset + 12) / 256;
            const lut = new Uint16Array(256);
            for (let i = 0; i < 256; i++) lut[i] = Math.round(Math.pow(i / 255, gamma) * 65535);
            return lut;
        }
        // Full LUT
        const lut = new Uint16Array(count);
        for (let i = 0; i < count; i++) lut[i] = read16(tag.offset + 12 + i * 2);
        return lut;
    }

    const rTRC = parseTRC(tags['rTRC']);
    const gTRC = parseTRC(tags['gTRC']);
    const bTRC = parseTRC(tags['bTRC']);
    if (!rTRC) return null;

    return [rTRC, gTRC || rTRC, bTRC || rTRC];
}

/** Linear light (0-1) to sRGB nonlinear (0-1) */
function linearToSRGB(v) {
    if (v <= 0.0031308) return 12.92 * v;
    return 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
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
        // Convert to 8-bit, applying ICC TRC curves if present for correct tonality.
        let decoded;
        if (bps > 8) {
            const maxVal = (1 << bps) - 1;
            const trcs = nc >= 3 ? extractICCTRCs(inputData) : null;
            decoded = new Uint8Array(pixelCount * nc);

            if (trcs) {
                // Apply ICC TRC LUT → linear light → sRGB gamma
                for (let i = 0; i < pixelCount; i++) {
                    for (let c = 0; c < nc; c++) {
                        const idx = (i * nc + c) * 2;
                        const v16 = rawDecoded[idx] | (rawDecoded[idx + 1] << 8);
                        const trc = trcs[Math.min(c, 2)];
                        // Interpolate in TRC LUT
                        const lutIdx = v16 * (trc.length - 1) / maxVal;
                        const lo = Math.floor(lutIdx);
                        const hi = Math.min(lo + 1, trc.length - 1);
                        const frac = lutIdx - lo;
                        const linear = (trc[lo] * (1 - frac) + trc[hi] * frac) / 65535;
                        decoded[i * nc + c] = Math.max(0, Math.min(255, Math.round(linearToSRGB(linear) * 255)));
                    }
                }
                console.log(`JPEG2000Utils: OpenJPEG decoded ${width}×${height}, ${nc} components, ${bps}-bit, ICC TRC applied`);
            } else {
                // Simple linear scale
                for (let i = 0; i < pixelCount * nc; i++) {
                    const lo = rawDecoded[i * 2];
                    const hi = rawDecoded[i * 2 + 1];
                    decoded[i] = Math.round((lo | (hi << 8)) * 255 / maxVal);
                }
                console.log(`JPEG2000Utils: OpenJPEG decoded ${width}×${height}, ${nc} components, ${bps}-bit → 8-bit`);
            }
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
