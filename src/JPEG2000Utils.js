/**
 * JPEG2000Utils.js - Decode standalone JPEG 2000 files (.jp2, .j2k, .jpx, .jpc, .j2c)
 *
 * The jpeg2000 library handles both JP2 containers (box structure with metadata)
 * and raw J2K codestreams. Decoded pixel data is rendered to a canvas and
 * returned as an HTMLImageElement (PNG).
 *
 * The jpeg2000 library ignores two JP2 container metadata boxes that affect color:
 *  - colr box: declares the output color space (e.g. sYCC = YCbCr)
 *  - cdef box: can reorder which codestream component maps to which color channel
 * We parse both and apply the necessary conversion after decoding.
 */

import {JpxImage} from "jpeg2000";
import {createImageFromArrayBuffer} from "./FileUtils";

/**
 * Parse JP2 container metadata relevant to color handling.
 * Returns {enumCS, componentMap} or null for raw J2K codestreams.
 *
 * componentMap: array where componentMap[association-1] = codestream index.
 * For sYCC: association 1=Y, 2=Cb, 3=Cr.
 * So componentMap = [indexOfY, indexOfCb, indexOfCr].
 */
function parseJP2ColorInfo(bytes) {
    // JP2 files start with a 12-byte signature box containing 'jP'
    if (bytes.length < 12 || bytes[4] !== 0x6A || bytes[5] !== 0x50) return null;

    let enumCS = null;
    let componentMap = null;

    let pos = 0;
    const limit = Math.min(bytes.length, 1024);
    while (pos < limit - 8) {
        const boxLen = (bytes[pos] << 24) | (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3];
        const boxType = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);

        if (boxLen < 8 || boxLen > bytes.length - pos) break;

        if (boxType === 'colr' && boxLen >= 15) {
            const meth = bytes[pos + 8];
            if (meth === 1) {
                enumCS = (bytes[pos + 11] << 24) | (bytes[pos + 12] << 16) |
                         (bytes[pos + 13] << 8) | bytes[pos + 14];
            }
        }

        if (boxType === 'cdef' && boxLen >= 14) {
            // cdef: N(2) then N entries of [index(2), type(2), association(2)]
            const n = (bytes[pos + 8] << 8) | bytes[pos + 9];
            const map = [];
            for (let i = 0; i < n; i++) {
                const off = pos + 10 + i * 6;
                if (off + 6 > pos + boxLen) break;
                const idx = (bytes[off] << 8) | bytes[off + 1];
                const assoc = (bytes[off + 4] << 8) | bytes[off + 5];
                if (assoc >= 1 && assoc <= n) {
                    map[assoc - 1] = idx; // association 1→slot 0, 2→slot 1, 3→slot 2
                }
            }
            if (map.length >= 3) componentMap = map;
        }

        // Enter superboxes to find colr/cdef inside
        if (boxType === 'jp2h') {
            pos += 8;
        } else {
            pos += boxLen;
        }
    }

    if (enumCS === null) return null;
    return {enumCS, componentMap};
}

/**
 * Convert sYCC (YCbCr) pixel data to RGB in-place, respecting component reordering.
 * componentMap[0] = codestream index of Y, [1] = Cb, [2] = Cr.
 * If null, assumes standard [Y, Cb, Cr] order.
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
        const r = Math.max(0, Math.min(255, Math.round(y + 1.402 * cr)));
        const g = Math.max(0, Math.min(255, Math.round(y - 0.34414 * cb - 0.71414 * cr)));
        const b = Math.max(0, Math.min(255, Math.round(y + 1.772 * cb)));
        items[off]     = r;
        items[off + 1] = g;
        items[off + 2] = b;
    }
}

/**
 * Decode a JPEG 2000 buffer to a canvas.
 * @param {ArrayBuffer} arrayBuffer - Raw JP2/J2K file data
 * @returns {{canvas: HTMLCanvasElement, width: number, height: number}}
 */
function decodeJPEG2000ToCanvas(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const data = Buffer.from(bytes);

    const jpx = new JpxImage();
    jpx.parse(data);

    const width = jpx.width;
    const height = jpx.height;
    const nc = jpx.componentsCount;

    // Parse JP2 container for color space and component mapping.
    const colorInfo = parseJP2ColorInfo(bytes);
    const needsYCbCrConvert = nc >= 3 && colorInfo && colorInfo.enumCS === 18;
    const componentMap = colorInfo ? colorInfo.componentMap : null;

    // If no sYCC but cdef reorders components for sRGB, apply reorder
    const needsReorder = !needsYCbCrConvert && componentMap &&
        (componentMap[0] !== 0 || componentMap[1] !== 1 || componentMap[2] !== 2);

    console.log(`JPEG2000Utils: Decoded ${width}×${height}, ${nc} components, ${jpx.tiles.length} tile(s)` +
        (needsYCbCrConvert ? ', sYCC→RGB' : '') +
        (componentMap ? ` cdef=[${componentMap}]` : ''));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    for (const tile of jpx.tiles) {
        const tw = tile.width;
        const th = tile.height;
        const imageData = ctx.createImageData(tw, th);
        const rgba = imageData.data;
        const items = tile.items;
        const pixelCount = tw * th;

        if (needsYCbCrConvert) {
            convertSYCCtoRGB(items, nc, pixelCount, componentMap);
        }

        if (nc >= 3) {
            // After sYCC conversion, items are in RGB order.
            // For non-sYCC with cdef reorder, apply the mapping.
            const r = needsReorder ? componentMap[0] : 0;
            const g = needsReorder ? componentMap[1] : 1;
            const b = needsReorder ? componentMap[2] : 2;
            for (let i = 0; i < pixelCount; i++) {
                rgba[i * 4]     = items[i * nc + r];
                rgba[i * 4 + 1] = items[i * nc + g];
                rgba[i * 4 + 2] = items[i * nc + b];
                rgba[i * 4 + 3] = nc >= 4 ? items[i * nc + 3] : 255;
            }
        } else {
            for (let i = 0; i < pixelCount; i++) {
                const v = items[i];
                rgba[i * 4] = v;
                rgba[i * 4 + 1] = v;
                rgba[i * 4 + 2] = v;
                rgba[i * 4 + 3] = 255;
            }
        }

        if (tile.left === 0 && tile.top === 0 && tw === width && th === height) {
            ctx.putImageData(imageData, 0, 0);
        } else {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = tw;
            tempCanvas.height = th;
            tempCanvas.getContext('2d').putImageData(imageData, 0, 0);
            ctx.drawImage(tempCanvas, tile.left, tile.top);
        }
    }

    return {canvas, width, height};
}

/**
 * Decode a JPEG 2000 buffer and return an HTMLImageElement.
 * Note: the blob URL backing the image is revoked after load.
 * @param {ArrayBuffer} arrayBuffer - Raw JP2/J2K file data
 * @returns {Promise<HTMLImageElement>}
 */
export async function decodeJPEG2000ToImage(arrayBuffer) {
    const {canvas} = decodeJPEG2000ToCanvas(arrayBuffer);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const pngBuffer = await blob.arrayBuffer();
    return createImageFromArrayBuffer(pngBuffer, 'image/png');
}

/**
 * Decode a JPEG 2000 buffer and return a persistent blob URL.
 * The caller is responsible for revoking the URL when done.
 * @param {ArrayBuffer} arrayBuffer - Raw JP2/J2K file data
 * @returns {Promise<string>} Blob URL for the decoded PNG
 */
export async function decodeJPEG2000ToBlobURL(arrayBuffer) {
    const {canvas} = decodeJPEG2000ToCanvas(arrayBuffer);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    return URL.createObjectURL(blob);
}
