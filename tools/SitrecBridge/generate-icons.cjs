#!/usr/bin/env node
/**
 * Generate placeholder PNG icons for the SitrecBridge Chrome extension.
 * Run: node generate-icons.js
 * For production, replace with properly designed icons.
 */

const fs = require("fs");
const zlib = require("zlib");
const path = require("path");

function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
        crc ^= buf[i];
        for (let j = 0; j < 8; j++) {
            crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeB = Buffer.from(type, "ascii");
    const crcInput = Buffer.concat([typeB, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(crcInput), 0);
    return Buffer.concat([len, typeB, data, crc]);
}

function createPNG(size, r, g, b) {
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0);
    ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8;  // bit depth
    ihdr[9] = 2;  // RGB
    ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

    const rowSize = 1 + size * 3;
    const raw = Buffer.alloc(rowSize * size);
    for (let y = 0; y < size; y++) {
        const off = y * rowSize;
        raw[off] = 0; // no filter
        for (let x = 0; x < size; x++) {
            const px = off + 1 + x * 3;
            const edge = Math.min(x, y, size - 1 - x, size - 1 - y);
            const f = Math.min(1, edge / (size * 0.2) + 0.5);
            raw[px]     = Math.round(r * f);
            raw[px + 1] = Math.round(g * f);
            raw[px + 2] = Math.round(b * f);
        }
    }

    const compressed = zlib.deflateSync(raw);
    return Buffer.concat([
        sig,
        makeChunk("IHDR", ihdr),
        makeChunk("IDAT", compressed),
        makeChunk("IEND", Buffer.alloc(0)),
    ]);
}

const outDir = path.join(__dirname, "extension", "icons");
fs.mkdirSync(outDir, { recursive: true });

for (const size of [16, 48, 128]) {
    const png = createPNG(size, 30, 80, 140);
    fs.writeFileSync(path.join(outDir, `icon${size}.png`), png);
    console.log(`Created icon${size}.png (${size}x${size})`);
}
