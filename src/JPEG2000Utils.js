/**
 * JPEG2000Utils.js - Decode standalone JPEG 2000 files (.jp2, .j2k, .jpx, .jpc, .j2c)
 *
 * The jpeg2000 library handles both JP2 containers (box structure with metadata)
 * and raw J2K codestreams. Decoded pixel data is rendered to a canvas and
 * returned as an HTMLImageElement (PNG).
 *
 * Note: the jpeg2000 library only applies the inverse MCT (YCbCr→RGB) when the
 * codestream's COD marker has MCT=1. Some JP2 files declare sYCC color space in
 * the container's colr box but set MCT=0 in the codestream, leaving the library
 * to output raw YCbCr. We detect this case via the colr box and convert manually.
 */

import {JpxImage} from "jpeg2000";
import {createImageFromArrayBuffer} from "./FileUtils";

/**
 * Check if a JP2 container declares sYCC (EnumCS=18) color space.
 * Parses the minimal JP2 box structure to find the colr box.
 * Returns true if sYCC, false otherwise (including for raw J2K codestreams).
 */
function isJP2sYCC(bytes) {
    // JP2 files start with a 12-byte signature box: [0x0000000C][jP  ][0x0D0A870A]
    if (bytes.length < 12 || bytes[4] !== 0x6A || bytes[5] !== 0x50) return false; // 'jP'

    let pos = 0;
    const len = Math.min(bytes.length, 512); // colr box is always near the start
    while (pos < len - 8) {
        const boxLen = (bytes[pos] << 24) | (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3];
        const boxType = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);

        if (boxLen < 8 || boxLen > bytes.length - pos) break;

        if (boxType === 'colr' && boxLen >= 15) {
            const meth = bytes[pos + 8]; // 1 = enumerated CS
            if (meth === 1) {
                const enumCS = (bytes[pos + 11] << 24) | (bytes[pos + 12] << 16) |
                               (bytes[pos + 13] << 8) | bytes[pos + 14];
                return enumCS === 18; // 18 = sYCC
            }
            return false;
        }

        // Enter superboxes (jp2h) to find colr inside
        if (boxType === 'jp2h') {
            pos += 8;
        } else {
            pos += boxLen;
        }
    }
    return false;
}

/**
 * Convert sYCC (YCbCr) pixel data to RGB in-place.
 * Standard ICT inverse: R = Y + 1.402·Cr, G = Y − 0.344·Cb − 0.714·Cr, B = Y + 1.772·Cb
 */
function convertSYCCtoRGB(items, nc, pixelCount) {
    for (let i = 0; i < pixelCount; i++) {
        const off = i * nc;
        const y  = items[off];
        const cb = items[off + 1] - 128;
        const cr = items[off + 2] - 128;
        items[off]     = Math.max(0, Math.min(255, Math.round(y + 1.402 * cr)));
        items[off + 1] = Math.max(0, Math.min(255, Math.round(y - 0.34414 * cb - 0.71414 * cr)));
        items[off + 2] = Math.max(0, Math.min(255, Math.round(y + 1.772 * cb)));
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

    // Detect sYCC color space from JP2 container colr box.
    // The jpeg2000 library only applies YCbCr→RGB when the codestream MCT flag
    // is set; JP2 files that declare sYCC in the container but omit MCT need
    // manual conversion.
    const needsYCbCrConvert = nc >= 3 && isJP2sYCC(bytes);
    console.log(`JPEG2000Utils: Decoded ${width}×${height}, ${nc} components, ${jpx.tiles.length} tile(s)${needsYCbCrConvert ? ', sYCC→RGB' : ''}`);

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
            convertSYCCtoRGB(items, nc, pixelCount);
        }

        if (nc >= 3) {
            for (let i = 0; i < pixelCount; i++) {
                rgba[i * 4]     = items[i * nc];
                rgba[i * 4 + 1] = items[i * nc + 1];
                rgba[i * 4 + 2] = items[i * nc + 2];
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

        // Multi-tile: draw each tile at its offset
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
