"use strict";

/**
 * Web Worker for parallel JPEG 2000 tile decoding.
 * Loads OpenJPEG WASM and decodes individual J2K tiles.
 *
 * Protocol:
 *   init → {type:'init', wasmScriptUrl, wasmLocateBase, mainHeader, sizOffset, sizParams}
 *   ready ← {type:'ready'}
 *   decodeTile → {type:'decodeTile', tileIndex, tileData, tileCol, tileRow}
 *   tileResult ← {type:'tileResult', tileIndex, rgba, width, height} (rgba is transferred)
 *   tileError ← {type:'tileError', tileIndex, error}
 *
 * NOTE: buildSingleTileJ2K is duplicated from JPEG2000Utils.js (pure byte manipulation).
 * If you change the logic there, update it here too.
 */

let Module = null;
let mainHeader = null;
let sizOffset = 0;
let sizParams = null;
let reduceLevel = 0;

/**
 * Build a single-tile J2K codestream from the main header + one tile's data.
 * Rewrites SIZ marker for a 1-tile image and patches all SOT tile indices to 0.
 * (Duplicated from JPEG2000Utils.js — keep in sync.)
 */
function buildSingleTileJ2K(mainHeaderBytes, tileData, sizOff, siz, tileCol, tileRow) {
    const {Xsiz, Ysiz, XTsiz, YTsiz, XTOsiz, YTOsiz} = siz;

    const tileX0 = XTOsiz + tileCol * XTsiz;
    const tileY0 = YTOsiz + tileRow * YTsiz;
    const tileW = Math.min(XTsiz, Xsiz - tileX0);
    const tileH = Math.min(YTsiz, Ysiz - tileY0);

    const header = new Uint8Array(mainHeaderBytes);
    const write32 = (arr, off, val) => {
        arr[off] = (val >>> 24) & 0xFF;
        arr[off + 1] = (val >>> 16) & 0xFF;
        arr[off + 2] = (val >>> 8) & 0xFF;
        arr[off + 3] = val & 0xFF;
    };
    write32(header, sizOff + 6, tileW);
    write32(header, sizOff + 10, tileH);
    write32(header, sizOff + 14, 0);
    write32(header, sizOff + 18, 0);
    write32(header, sizOff + 22, tileW);
    write32(header, sizOff + 26, tileH);
    write32(header, sizOff + 30, 0);
    write32(header, sizOff + 34, 0);

    const tile = new Uint8Array(tileData);
    for (let i = 0; i < tile.length - 5; i++) {
        if (tile[i] === 0xFF && tile[i + 1] === 0x90) {
            tile[i + 4] = 0;
            tile[i + 5] = 0;
            i += 11;
        }
    }

    const eoc = new Uint8Array([0xFF, 0xD9]);
    const result = new Uint8Array(header.length + tile.length + eoc.length);
    result.set(header, 0);
    result.set(tile, header.length);
    result.set(eoc, header.length + tile.length);
    return result;
}

function decodeTile(tileIndex, tileData, tileCol, tileRow) {
    const miniJ2K = buildSingleTileJ2K(mainHeader, tileData, sizOffset, sizParams, tileCol, tileRow);

    const decoder = new Module.J2KDecoder();
    try {
        const encodedBuffer = decoder.getEncodedBuffer(miniJ2K.length);
        encodedBuffer.set(miniJ2K);

        if (reduceLevel > 0 && typeof decoder.decodeSubResolution === 'function') {
            decoder.decodeSubResolution(reduceLevel, 0);
        } else {
            decoder.decode();
        }

        const fi = decoder.getFrameInfo();
        // decodeSubResolution does NOT update frameInfo — always use calculated dims
        const width = reduceLevel > 0 ? Math.ceil(sizParams.XTsiz / (1 << reduceLevel)) : fi.width;
        const height = reduceLevel > 0 ? Math.ceil(sizParams.YTsiz / (1 << reduceLevel)) : fi.height;
        if (!width || !height) throw new Error('0×0 decode');

        const rawDecoded = decoder.getDecodedBuffer();
        const bps = fi.bitsPerSample;
        const nc = fi.componentCount;
        const pixelCount = width * height;

        const rgba = new Uint8Array(pixelCount * 4);

        if (bps > 8) {
            const maxVal = (1 << bps) - 1;
            for (let i = 0; i < pixelCount; i++) {
                const lo = rawDecoded[i * 2];
                const hi = rawDecoded[i * 2 + 1];
                const val = Math.round((lo | (hi << 8)) * 255 / maxVal);
                rgba[i * 4] = val;
                rgba[i * 4 + 1] = val;
                rgba[i * 4 + 2] = val;
                rgba[i * 4 + 3] = 255;
            }
        } else if (nc >= 3) {
            for (let i = 0; i < pixelCount; i++) {
                rgba[i * 4] = rawDecoded[i * nc];
                rgba[i * 4 + 1] = rawDecoded[i * nc + 1];
                rgba[i * 4 + 2] = rawDecoded[i * nc + 2];
                rgba[i * 4 + 3] = 255;
            }
        } else {
            for (let i = 0; i < pixelCount; i++) {
                rgba[i * 4] = rawDecoded[i];
                rgba[i * 4 + 1] = rawDecoded[i];
                rgba[i * 4 + 2] = rawDecoded[i];
                rgba[i * 4 + 3] = 255;
            }
        }

        return {rgba, width, height};
    } finally {
        decoder.delete();
    }
}

self.onmessage = async (e) => {
    const msg = e.data;

    if (msg.type === 'init') {
        try {
            importScripts(msg.wasmScriptUrl);
            Module = await self.OpenJPEGWASM({
                locateFile: (filename) => msg.wasmLocateBase + filename,
                print: () => {},
                printErr: () => {},
            });
            mainHeader = new Uint8Array(msg.mainHeader);
            sizOffset = msg.sizOffset;
            sizParams = msg.sizParams;
            reduceLevel = msg.reduceLevel || 0;
            self.postMessage({type: 'ready'});
        } catch (err) {
            self.postMessage({type: 'initError', error: err.message});
        }
    } else if (msg.type === 'decodeTile') {
        try {
            const result = decodeTile(msg.tileIndex, msg.tileData, msg.tileCol, msg.tileRow);
            self.postMessage(
                {type: 'tileResult', tileIndex: msg.tileIndex,
                 rgba: result.rgba, width: result.width, height: result.height},
                [result.rgba.buffer] // transfer
            );
        } catch (err) {
            self.postMessage({type: 'tileError', tileIndex: msg.tileIndex, error: err.message});
        }
    }
};
