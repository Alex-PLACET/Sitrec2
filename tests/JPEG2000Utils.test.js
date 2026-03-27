/**
 * @jest-environment jsdom
 */
import fs from 'fs';
import path from 'path';

// Mock browser-dependent module
jest.mock('../src/FileUtils', () => ({
    createImageFromArrayBuffer: jest.fn()
}));

import {linearToSRGB, convertSYCCtoRGB, looksLikeYCbCr, parseJ2KCodestream} from '../src/JPEG2000Utils';

const NITF_DIR = path.resolve(__dirname, '../../nitf-test-files');
const J2K_DIR = path.join(NITF_DIR, 'JitcJpeg2000');
const hasTestFiles = fs.existsSync(NITF_DIR);
const describeWithFiles = hasTestFiles ? describe : describe.skip;

// ─── linearToSRGB ─────────────────────────────────────────────
describe('linearToSRGB', () => {
    test('maps 0.0 to 0.0', () => {
        expect(linearToSRGB(0)).toBe(0);
    });

    test('maps 1.0 to 1.0', () => {
        expect(linearToSRGB(1)).toBeCloseTo(1, 5);
    });

    test('maps 0.5 to ~0.735 (sRGB gamma)', () => {
        // sRGB: 1.055 * 0.5^(1/2.4) - 0.055 ≈ 0.7354
        expect(linearToSRGB(0.5)).toBeCloseTo(0.7354, 3);
    });

    test('uses linear segment below knee (0.0031308)', () => {
        const v = 0.001;
        expect(linearToSRGB(v)).toBeCloseTo(12.92 * v, 6);
    });

    test('uses power curve above knee', () => {
        const v = 0.01;
        const expected = 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
        expect(linearToSRGB(v)).toBeCloseTo(expected, 6);
    });

    test('monotonically increasing', () => {
        let prev = -1;
        for (let v = 0; v <= 1.0; v += 0.01) {
            const result = linearToSRGB(v);
            expect(result).toBeGreaterThanOrEqual(prev);
            prev = result;
        }
    });
});

// ─── convertSYCCtoRGB ─────────────────────────────────────────
describe('convertSYCCtoRGB', () => {
    test('converts neutral gray (Y=128, Cb=128, Cr=128) to gray', () => {
        // Neutral: cb=0, cr=0 after offset → R=G=B=Y
        const items = new Float32Array([128, 128, 128]);
        convertSYCCtoRGB(items, 3, 1, null);
        expect(items[0]).toBeCloseTo(128, 0); // R
        expect(items[1]).toBeCloseTo(128, 0); // G
        expect(items[2]).toBeCloseTo(128, 0); // B
    });

    test('converts white (Y=255, Cb=128, Cr=128) to white', () => {
        const items = new Float32Array([255, 128, 128]);
        convertSYCCtoRGB(items, 3, 1, null);
        expect(items[0]).toBeCloseTo(255, 0); // R
        expect(items[1]).toBeCloseTo(255, 0); // G
        expect(items[2]).toBeCloseTo(255, 0); // B
    });

    test('converts black (Y=0, Cb=128, Cr=128) to black', () => {
        const items = new Float32Array([0, 128, 128]);
        convertSYCCtoRGB(items, 3, 1, null);
        expect(items[0]).toBeCloseTo(0, 0); // R
        expect(items[1]).toBeCloseTo(0, 0); // G
        expect(items[2]).toBeCloseTo(0, 0); // B
    });

    test('converts pure red (Y≈76, Cb≈84, Cr=255)', () => {
        // BT.601: R=255,G=0,B=0 → Y≈76.245, Cb≈84.972, Cr=255
        const items = new Float32Array([76, 85, 255]);
        convertSYCCtoRGB(items, 3, 1, null);
        expect(items[0]).toBeGreaterThan(200); // R should be high
        expect(items[1]).toBeLessThan(30);     // G should be low
        expect(items[2]).toBeLessThan(30);     // B should be low
    });

    test('handles multiple pixels', () => {
        const items = new Float32Array([
            128, 128, 128,  // gray
            255, 128, 128,  // white
        ]);
        convertSYCCtoRGB(items, 3, 2, null);
        expect(items[0]).toBeCloseTo(128, 0); // pixel 0 R
        expect(items[3]).toBeCloseTo(255, 0); // pixel 1 R
    });

    test('respects componentMap for reordered bands', () => {
        // Band order: [Cr, Cb, Y] → componentMap = [2, 1, 0]
        const items = new Float32Array([128, 128, 128]); // Cr=128, Cb=128, Y=128
        convertSYCCtoRGB(items, 3, 1, [2, 1, 0]);
        expect(items[0]).toBeCloseTo(128, 0); // R
        expect(items[1]).toBeCloseTo(128, 0); // G
        expect(items[2]).toBeCloseTo(128, 0); // B
    });

    test('clamps values to 0-255 range', () => {
        // Extreme values that would produce out-of-range RGB
        const items = new Float32Array([255, 0, 255]); // max Y, min Cb, max Cr
        convertSYCCtoRGB(items, 3, 1, null);
        expect(items[0]).toBeLessThanOrEqual(255);
        expect(items[0]).toBeGreaterThanOrEqual(0);
        expect(items[1]).toBeLessThanOrEqual(255);
        expect(items[1]).toBeGreaterThanOrEqual(0);
        expect(items[2]).toBeLessThanOrEqual(255);
        expect(items[2]).toBeGreaterThanOrEqual(0);
    });
});

// ─── looksLikeYCbCr ──────────────────────────────────────────
describe('looksLikeYCbCr', () => {
    test('detects genuine YCbCr (Cb centered at 128)', () => {
        // Create data with Cb channel ≈ 128
        const nc = 3;
        const pixelCount = 100;
        const data = new Float32Array(nc * pixelCount);
        for (let i = 0; i < pixelCount; i++) {
            data[i * nc + 0] = 100 + Math.random() * 50;  // Y
            data[i * nc + 1] = 125 + Math.random() * 6;   // Cb near 128
            data[i * nc + 2] = 125 + Math.random() * 6;   // Cr near 128
        }
        const result = looksLikeYCbCr(data, nc, pixelCount, 1);
        expect(result.isYCbCr).toBe(true);
        expect(result.offset).toBeLessThan(15);
    });

    test('rejects RGB mislabeled as YCbCr (Cb far from 128)', () => {
        // RGB data has green channel (where Cb would be) with arbitrary values
        const nc = 3;
        const pixelCount = 100;
        const data = new Float32Array(nc * pixelCount);
        for (let i = 0; i < pixelCount; i++) {
            data[i * nc + 0] = 200;  // R
            data[i * nc + 1] = 50;   // G (treated as Cb, mean=50 far from 128)
            data[i * nc + 2] = 100;  // B
        }
        const result = looksLikeYCbCr(data, nc, pixelCount, 1);
        expect(result.isYCbCr).toBe(false);
        expect(result.offset).toBeGreaterThan(15);
    });

    test('returns cbMean and offset', () => {
        const nc = 3;
        const pixelCount = 10;
        const data = new Float32Array(nc * pixelCount);
        for (let i = 0; i < pixelCount; i++) {
            data[i * nc + 1] = 130; // Cb = 130 for all pixels
        }
        const result = looksLikeYCbCr(data, nc, pixelCount, 1);
        expect(result.cbMean).toBeCloseTo(130, 1);
        expect(result.offset).toBeCloseTo(2, 1);
    });

    test('handles single pixel', () => {
        const data = new Float32Array([100, 128, 128]);
        const result = looksLikeYCbCr(data, 3, 1, 1);
        expect(result.isYCbCr).toBe(true);
    });
});

// ─── parseJ2KCodestream ──────────────────────────────────────
describe('parseJ2KCodestream', () => {
    test('returns null for non-J2K data', () => {
        const data = new Uint8Array([0x89, 0x50, 0x4E, 0x47]); // PNG magic
        expect(parseJ2KCodestream(data)).toBeNull();
    });

    test('returns null for too-short data', () => {
        expect(parseJ2KCodestream(new Uint8Array([0xFF]))).toBeNull();
        expect(parseJ2KCodestream(new Uint8Array([]))).toBeNull();
    });

    test('returns null for SOC without SIZ marker', () => {
        // SOC (FF 4F) followed by EOC (FF D9) — no SIZ
        const data = new Uint8Array([0xFF, 0x4F, 0xFF, 0xD9]);
        expect(parseJ2KCodestream(data)).toBeNull();
    });
});

describeWithFiles('parseJ2KCodestream with real J2K files', () => {
    test('parses p0_01.j2k codestream', () => {
        const buf = fs.readFileSync(path.join(J2K_DIR, 'p0_01.j2k'));
        const data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
        const result = parseJ2KCodestream(data);

        expect(result).not.toBeNull();
        expect(result.mainHeader).toBeInstanceOf(Uint8Array);
        expect(result.mainHeader.length).toBeGreaterThan(0);
        expect(result.sizOffset).toBeGreaterThanOrEqual(0);

        // SIZ params should have valid dimensions
        expect(result.sizParams.Xsiz).toBeGreaterThan(0);
        expect(result.sizParams.Ysiz).toBeGreaterThan(0);
        expect(result.sizParams.Csiz).toBeGreaterThanOrEqual(1); // at least 1 component

        // Should have at least one tile
        expect(result.tiles.length).toBeGreaterThanOrEqual(1);
    });

    test('parses p0_04b J2K (larger, multi-component)', () => {
        // p0_04.j2k is a 480x640 RGB file
        const buf = fs.readFileSync(path.join(J2K_DIR, 'p0_04.j2k'));
        const data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
        const result = parseJ2KCodestream(data);

        expect(result).not.toBeNull();
        expect(result.sizParams.Xsiz).toBeGreaterThan(0);
        expect(result.sizParams.Ysiz).toBeGreaterThan(0);
    });

    test('tile dimensions match SIZ parameters', () => {
        const buf = fs.readFileSync(path.join(J2K_DIR, 'p0_01.j2k'));
        const data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
        const result = parseJ2KCodestream(data);

        const {Xsiz, Ysiz, XTsiz, YTsiz, XTOsiz, YTOsiz} = result.sizParams;
        const expectedTileCols = Math.ceil((Xsiz - XTOsiz) / XTsiz);
        const expectedTileRows = Math.ceil((Ysiz - YTOsiz) / YTsiz);
        const expectedTileCount = expectedTileCols * expectedTileRows;

        // Tile count should match (tiles may have multiple parts per tile though)
        expect(result.tiles.length).toBeGreaterThanOrEqual(expectedTileCount);
    });

    test('all tiles have positive length', () => {
        const buf = fs.readFileSync(path.join(J2K_DIR, 'p0_01.j2k'));
        const data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
        const result = parseJ2KCodestream(data);

        for (const tile of result.tiles) {
            expect(tile.length).toBeGreaterThan(0);
            expect(tile.start).toBeGreaterThanOrEqual(0);
            expect(tile.tileIndex).toBeGreaterThanOrEqual(0);
        }
    });
});
