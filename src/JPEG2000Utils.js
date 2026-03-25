/**
 * JPEG2000Utils.js - Decode standalone JPEG 2000 files (.jp2, .j2k, .jpx, .jpc, .j2c)
 *
 * The jpeg2000 library handles both JP2 containers (box structure with metadata)
 * and raw J2K codestreams. Decoded pixel data is rendered to a canvas and
 * returned as an HTMLImageElement (PNG).
 */

import {JpxImage} from "jpeg2000";
import {createImageFromArrayBuffer} from "./FileUtils";

/**
 * Decode a JPEG 2000 buffer to a canvas.
 * @param {ArrayBuffer} arrayBuffer - Raw JP2/J2K file data
 * @returns {{canvas: HTMLCanvasElement, width: number, height: number}}
 */
function decodeJPEG2000ToCanvas(arrayBuffer) {
    const data = Buffer.from(new Uint8Array(arrayBuffer));

    const jpx = new JpxImage();
    jpx.parse(data);

    const width = jpx.width;
    const height = jpx.height;
    const nc = jpx.componentsCount;

    console.log(`JPEG2000Utils: Decoded ${width}×${height}, ${nc} components, ${jpx.tiles.length} tile(s)`);

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
