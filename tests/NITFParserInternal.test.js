/**
 * @jest-environment jsdom
 */
import fs from 'fs';
import path from 'path';
import {NITFParser} from '../src/NITFParser';

jest.mock('../src/FileUtils', () => ({createImageFromArrayBuffer: jest.fn()}));
jest.mock('../src/JPEG2000Utils', () => ({
    decodeJPEG2000ToBlobURL: jest.fn(),
    decodeJ2KTiledToCanvas: jest.fn()
}));
jest.mock('../src/CProgressIndicator', () => ({
    initProgress: jest.fn(), updateProgress: jest.fn(), hideProgress: jest.fn()
}));

const NITF_DIR = path.resolve(__dirname, '../../nitf-test-files');
const NITF21_DIR = path.join(NITF_DIR, 'JitcNitf21Samples');
const J2K_DIR = path.join(NITF_DIR, 'JitcJpeg2000');
const hasTestFiles = fs.existsSync(NITF_DIR);
const describeWithFiles = hasTestFiles ? describe : describe.skip;

function loadBytes(filePath) {
    const buf = fs.readFileSync(filePath);
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

function loadNITF(filePath) {
    const buf = fs.readFileSync(filePath);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

// ─── Synthetic NITF Builder ───────────────────────────────────
// Builds minimal valid NITF 2.1 files for pixel-level testing
function buildSyntheticNITF({nrows, ncols, nbands = 1, abpp = 8, imode = 'B',
                              nbpr = 1, nbpc = 1, nppbh = 0, nppbv = 0,
                              irep = 'MONO', ic = 'NC', pixelData}) {
    if (nppbh === 0) nppbh = ncols;
    if (nppbv === 0) nppbv = nrows;

    const bpp = Math.ceil(abpp / 8);
    const dataLength = pixelData ? pixelData.length : nrows * ncols * nbands * bpp;

    // Build image subheader
    const sub = [];
    const pushStr = (s, len) => { sub.push(s.padEnd(len, ' ').substring(0, len)); };
    const pushInt = (v, len) => { sub.push(String(v).padStart(len, '0')); };

    pushStr('IM', 2);           // IM
    pushStr('', 10);            // IID1
    pushStr('20200615120000', 14); // IDATIM
    pushStr('', 17);            // TGTID
    pushStr('Synthetic Test', 80); // IID2
    pushStr('U', 1);            // ISCLAS
    pushStr('', 166);           // Security fields (v2.1)
    pushStr('0', 1);            // ENCRYP
    pushStr('', 42);            // ISORCE
    pushInt(nrows, 8);          // NROWS
    pushInt(ncols, 8);          // NCOLS
    pushStr('INT', 3);          // PVTYPE
    pushStr(irep, 8);           // IREP
    pushStr('VIS', 8);          // ICAT
    pushInt(abpp, 2);           // ABPP
    pushStr('R', 1);            // PJUST
    pushStr(' ', 1);            // ICORDS (no geolocation)
    pushInt(0, 1);              // NICOM
    pushStr(ic, 2);             // IC

    // Bands
    if (nbands < 10) {
        pushInt(nbands, 1);     // NBANDS
    } else {
        pushInt(0, 1);          // NBANDS=0 → use XBANDS
        pushInt(nbands, 5);     // XBANDS
    }
    for (let b = 0; b < nbands; b++) {
        const bandLabel = nbands === 1 ? 'M ' :
                          nbands === 3 ? ['R ', 'G ', 'B '][b] : '  ';
        pushStr(bandLabel, 2);  // IREPBAND
        pushStr('', 6);         // ISUBCAT
        pushStr('N', 1);        // IFC
        pushStr('', 3);         // IMFLT
        pushInt(0, 1);          // NLUTS
    }

    pushStr('0', 1);            // ISYNC
    pushStr(imode, 1);          // IMODE
    pushInt(nbpr, 4);           // NBPR
    pushInt(nbpc, 4);           // NBPC
    pushInt(nppbh, 4);          // NPPBH
    pushInt(nppbv, 4);          // NPPBV
    pushInt(abpp, 2);           // NBPP
    pushStr('', 20);            // IDLVL+IALVL+ILOC+IMAG
    pushInt(0, 5);              // UDIDL
    pushInt(0, 5);              // IXSHDL

    const subheaderStr = sub.join('');
    const subheaderLength = subheaderStr.length;

    // Build file header
    const hdr = [];
    pushStr.call = null; // reset closure
    const hPush = (s, len) => { hdr.push(s.padEnd(len, ' ').substring(0, len)); };
    const hInt = (v, len) => { hdr.push(String(v).padStart(len, '0')); };

    hPush('NITF', 4);          // FHDR
    hPush('02.10', 5);         // FVER
    hInt(3, 2);                 // CLEVEL
    hPush('BF01', 4);          // STYPE
    hPush('TEST', 10);         // OSTAID
    hPush('20200615120000', 14); // FDT
    hPush('Synthetic NITF', 80); // FTITLE
    hPush('U', 1);             // FSCLAS
    hPush('', 166);            // Security fields
    hInt(0, 5);                 // FSCOP
    hInt(0, 5);                 // FSCPYS
    hPush('0', 1);             // ENCRYP
    hPush('', 3);               // FBKGC
    hPush('', 24);              // ONAME
    hPush('', 18);              // OPHONE

    // Calculate header length (everything so far + FL(12) + HL(6) + NUMI(3) + segment lengths + remaining counts)
    const headerSoFar = hdr.join('').length;
    const segmentCountsLength = 12 + 6 + 3 + 16 + 3 + 3 + 3 + 3 + 3 + 5 + 5; // FL+HL+NUMI+LISH+LI+NUMS+NUMX+NUMT+NUMDES+NUMRES+UDHDL+XHDL
    const headerLength = headerSoFar + segmentCountsLength;
    const fileLength = headerLength + subheaderLength + dataLength;

    hInt(fileLength, 12);       // FL
    hInt(headerLength, 6);      // HL

    // Image segments
    hInt(1, 3);                 // NUMI
    hInt(subheaderLength, 6);   // LISH
    hInt(dataLength, 10);       // LI

    // Other segment counts (all zero)
    hInt(0, 3);                 // NUMS
    hInt(0, 3);                 // NUMX (reserved)
    hInt(0, 3);                 // NUMT
    hInt(0, 3);                 // NUMDES
    hInt(0, 3);                 // NUMRES
    hInt(0, 5);                 // UDHDL
    hInt(0, 5);                 // XHDL

    const headerStr = hdr.join('');

    // Combine into final buffer
    const totalLength = headerStr.length + subheaderStr.length + dataLength;
    const buffer = new ArrayBuffer(totalLength);
    const bytes = new Uint8Array(buffer);

    // Write header
    for (let i = 0; i < headerStr.length; i++) bytes[i] = headerStr.charCodeAt(i);
    // Write subheader
    for (let i = 0; i < subheaderStr.length; i++) bytes[headerStr.length + i] = subheaderStr.charCodeAt(i);
    // Write pixel data
    if (pixelData) {
        bytes.set(pixelData, headerStr.length + subheaderStr.length);
    }

    return buffer;
}

// ─── _deblockData Tests ───────────────────────────────────────
describe('NITFParser._deblockData', () => {
    let logSpy, warnSpy;
    beforeAll(() => {
        logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterAll(() => { logSpy.mockRestore(); warnSpy.mockRestore(); });

    test('IMODE=P single band, 2x2 blocks of 2x2 pixels', () => {
        // 4x4 image, 2x2 blocks, each block 2x2 pixels, 1 band
        // Block order: B(0,0) B(0,1) B(1,0) B(1,1)
        // B(0,0) = [1,2,3,4], B(0,1) = [5,6,7,8], B(1,0) = [9,10,11,12], B(1,1) = [13,14,15,16]
        const blocked = new Uint8Array([
            1, 2, 3, 4,     // Block(0,0): rows [1,2],[3,4]
            5, 6, 7, 8,     // Block(0,1): rows [5,6],[7,8]
            9, 10, 11, 12,  // Block(1,0): rows [9,10],[11,12]
            13, 14, 15, 16, // Block(1,1): rows [13,14],[15,16]
        ]);
        const result = NITFParser._deblockData(blocked, 4, 4, 2, 2, 2, 2, 1, 8, 'P');
        // Expected raster order:
        // Row 0: 1,2,5,6  (top of block(0,0) + top of block(0,1))
        // Row 1: 3,4,7,8
        // Row 2: 9,10,13,14
        // Row 3: 11,12,15,16
        expect(Array.from(result)).toEqual([
            1, 2, 5, 6,
            3, 4, 7, 8,
            9, 10, 13, 14,
            11, 12, 15, 16,
        ]);
    });

    test('IMODE=S 3 bands, 2x1 blocks of 2x2 pixels', () => {
        // 2x4 image (2 rows, 4 cols), 2 blocks horizontally, each 2x2
        // 3 bands, band sequential within each block
        // Block layout: B(0,0) then B(0,1)
        // Each block: band0 plane (4 bytes) + band1 plane (4 bytes) + band2 plane (4 bytes)
        const blocked = new Uint8Array([
            // Block(0,0): R plane, G plane, B plane
            10, 20, 30, 40,   // R for 2x2
            11, 21, 31, 41,   // G for 2x2
            12, 22, 32, 42,   // B for 2x2
            // Block(0,1): R plane, G plane, B plane
            50, 60, 70, 80,
            51, 61, 71, 81,
            52, 62, 72, 82,
        ]);
        const result = NITFParser._deblockData(blocked, 2, 4, 2, 1, 2, 2, 3, 8, 'S');
        // Band sequential output: full R plane, full G plane, full B plane
        // R plane (raster order): row0=[10,20,50,60], row1=[30,40,70,80]
        // G plane: row0=[11,21,51,61], row1=[31,41,71,81]
        // B plane: row0=[12,22,52,62], row1=[32,42,72,82]
        expect(Array.from(result)).toEqual([
            10, 20, 50, 60, 30, 40, 70, 80,  // R plane
            11, 21, 51, 61, 31, 41, 71, 81,  // G plane
            12, 22, 52, 62, 32, 42, 72, 82,  // B plane
        ]);
    });

    test('handles edge blocks (image not divisible by block size)', () => {
        // 3x3 image, 2x2 blocks (2 blocks per row, 2 blocks per col)
        // nppbh=2, nppbv=2, but image is 3x3 so edge blocks are partial
        // Block(0,0)=2x2, Block(0,1)=1x2(width clipped), Block(1,0)=2x1(height clipped), Block(1,1)=1x1
        const blocked = new Uint8Array([
            1, 2, 3, 4,   // Block(0,0): full 2x2
            5, 0, 6, 0,   // Block(0,1): only col 0 matters per row (width=1), padded
            7, 8, 0, 0,   // Block(1,0): only row 0 matters (height=1), padded
            9, 0, 0, 0,   // Block(1,1): only (0,0) matters
        ]);
        const result = NITFParser._deblockData(blocked, 3, 3, 2, 2, 2, 2, 1, 8, 'P');
        // Expected raster:
        // Row 0: 1,2,5  (block(0,0) row0 + block(0,1) row0 col0)
        // Row 1: 3,4,6  (block(0,0) row1 + block(0,1) row1 col0)
        // Row 2: 7,8,9  (block(1,0) row0 + block(1,1) row0 col0)
        expect(result[0]).toBe(1); expect(result[1]).toBe(2); expect(result[2]).toBe(5);
        expect(result[3]).toBe(3); expect(result[4]).toBe(4); expect(result[5]).toBe(6);
        expect(result[6]).toBe(7); expect(result[7]).toBe(8); expect(result[8]).toBe(9);
    });
});

// ─── Synthetic NITF Parsing ──────────────────────────────────
describe('Synthetic NITF parsing', () => {
    let logSpy, warnSpy;
    beforeAll(() => {
        logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterAll(() => { logSpy.mockRestore(); warnSpy.mockRestore(); });

    test('parses synthetic mono 8-bit uncompressed', () => {
        const pixels = new Uint8Array(64 * 64);
        for (let i = 0; i < pixels.length; i++) pixels[i] = i % 256;

        const buffer = buildSyntheticNITF({nrows: 64, ncols: 64, pixelData: pixels});
        const result = NITFParser.parseNITF(buffer);

        expect(result).not.toBeNull();
        expect(result.images[0].nrows).toBe(64);
        expect(result.images[0].ncols).toBe(64);
        expect(result.images[0].abpp).toBe(8);
        expect(result.images[0].ic).toBe('NC');
        expect(result.images[0].irep).toBe('MONO');
        expect(result.images[0].rawData.length).toBe(64 * 64);
    });

    test('parses synthetic RGB 3-band', () => {
        const pixels = new Uint8Array(32 * 32 * 3);
        const buffer = buildSyntheticNITF({
            nrows: 32, ncols: 32, nbands: 3, irep: 'RGB',
            imode: 'P', pixelData: pixels
        });
        const result = NITFParser.parseNITF(buffer);

        expect(result.images[0].nbands).toBe(3);
        expect(result.images[0].irep).toBe('RGB');
        expect(result.images[0].imode).toBe('P');
    });

    test('parses synthetic blocked image', () => {
        const pixels = new Uint8Array(64 * 64);
        const buffer = buildSyntheticNITF({
            nrows: 64, ncols: 64,
            nbpr: 2, nbpc: 2, nppbh: 32, nppbv: 32,
            pixelData: pixels
        });
        const result = NITFParser.parseNITF(buffer);

        expect(result.images[0].nbpr).toBe(2);
        expect(result.images[0].nbpc).toBe(2);
        expect(result.images[0].nppbh).toBe(32);
        expect(result.images[0].nppbv).toBe(32);
    });

    test('parses synthetic 16-bit image', () => {
        const pixels = new Uint8Array(32 * 32 * 2); // 2 bytes per pixel
        const buffer = buildSyntheticNITF({
            nrows: 32, ncols: 32, abpp: 12, // 12 bits stored in 16-bit
            pixelData: pixels
        });
        const result = NITFParser.parseNITF(buffer);

        expect(result.images[0].abpp).toBe(12);
        expect(result.images[0].nbpp).toBe(12);
    });

    test('round-trips pixel data through deblocking', () => {
        // Create a 4x4 image with 2x2 blocks, fill in blocked order
        // Then deblock and verify the raster output
        const nrows = 4, ncols = 4, nbpr = 2, nbpc = 2, nppbh = 2, nppbv = 2;
        // Blocked data: each block stores its pixels row-by-row
        const blocked = new Uint8Array([
            // Block(0,0): rows [A,B],[C,D]
            0xA0, 0xB0, 0xC0, 0xD0,
            // Block(0,1)
            0xA1, 0xB1, 0xC1, 0xD1,
            // Block(1,0)
            0xA2, 0xB2, 0xC2, 0xD2,
            // Block(1,1)
            0xA3, 0xB3, 0xC3, 0xD3,
        ]);
        const raster = NITFParser._deblockData(blocked, nrows, ncols, nbpr, nbpc, nppbh, nppbv, 1, 8, 'P');

        // Raster row 0: block(0,0) top + block(0,1) top
        expect(raster[0]).toBe(0xA0);
        expect(raster[1]).toBe(0xB0);
        expect(raster[2]).toBe(0xA1);
        expect(raster[3]).toBe(0xB1);
        // Raster row 2: block(1,0) top + block(1,1) top
        expect(raster[8]).toBe(0xA2);
        expect(raster[9]).toBe(0xB2);
        expect(raster[10]).toBe(0xA3);
        expect(raster[11]).toBe(0xB3);
    });
});

// ─── _findJP2Signature ───────────────────────────────────────
describe('NITFParser._findJP2Signature', () => {
    test('finds JP2 signature at offset 0', () => {
        const data = new Uint8Array([
            0x00, 0x00, 0x00, 0x0C, 0x6A, 0x50, 0x20, 0x20,
            0x0D, 0x0A, 0x87, 0x0A, 0x00, 0x00, 0x00, 0x00
        ]);
        expect(NITFParser._findJP2Signature(data)).toBe(0);
    });

    test('finds JP2 signature with padding', () => {
        const data = new Uint8Array(32);
        // Put JP2 signature at offset 8
        data.set([0x00, 0x00, 0x00, 0x0C, 0x6A, 0x50, 0x20, 0x20], 8);
        expect(NITFParser._findJP2Signature(data)).toBe(8);
    });

    test('returns -1 for raw J2K codestream (no JP2)', () => {
        const data = new Uint8Array([0xFF, 0x4F, 0xFF, 0x51, 0x00, 0x00]);
        expect(NITFParser._findJP2Signature(data)).toBe(-1);
    });

    test('returns -1 for empty data', () => {
        expect(NITFParser._findJP2Signature(new Uint8Array(4))).toBe(-1);
    });
});

// ─── _scanJ2KBlocks ──────────────────────────────────────────
describe('NITFParser._scanJ2KBlocks', () => {
    test('finds one J2K block (SOC...EOC)', () => {
        const data = new Uint8Array([
            0xFF, 0x4F, // SOC
            0x00, 0x00, // some data
            0xFF, 0xD9, // EOC
        ]);
        const ranges = NITFParser._scanJ2KBlocks(data, 1);
        expect(ranges.length).toBe(1);
        expect(ranges[0].start).toBe(0);
        expect(ranges[0].length).toBe(6);
    });

    test('finds two J2K blocks', () => {
        const data = new Uint8Array([
            0xFF, 0x4F, 0xAA, 0xFF, 0xD9,  // block 1
            0xFF, 0x4F, 0xBB, 0xFF, 0xD9,  // block 2
        ]);
        const ranges = NITFParser._scanJ2KBlocks(data, 2);
        expect(ranges.length).toBe(2);
        expect(ranges[0].start).toBe(0);
        expect(ranges[1].start).toBe(5);
    });

    test('pads with null for missing blocks', () => {
        const data = new Uint8Array([0xFF, 0x4F, 0xFF, 0xD9]);
        const ranges = NITFParser._scanJ2KBlocks(data, 3);
        expect(ranges.length).toBe(3);
        expect(ranges[0]).not.toBeNull();
        expect(ranges[1]).toBeNull();
        expect(ranges[2]).toBeNull();
    });

    test('handles block without EOC (rest of data)', () => {
        const data = new Uint8Array([0xFF, 0x4F, 0xAA, 0xBB, 0xCC]);
        const ranges = NITFParser._scanJ2KBlocks(data, 1);
        expect(ranges[0].start).toBe(0);
        expect(ranges[0].length).toBe(5); // entire remaining data
    });
});

// ─── _findJP2Signature with real files ────────────────────────
describeWithFiles('NITFParser._findJP2Signature with real JP2 files', () => {
    test('detects JP2 container in file1.jp2', () => {
        const bytes = loadBytes(path.join(J2K_DIR, 'file1.jp2'));
        const offset = NITFParser._findJP2Signature(bytes);
        expect(offset).toBeGreaterThanOrEqual(0);
    });

    test('returns -1 for raw J2K codestream p0_01.j2k', () => {
        const bytes = loadBytes(path.join(J2K_DIR, 'p0_01.j2k'));
        const offset = NITFParser._findJP2Signature(bytes);
        expect(offset).toBe(-1);
    });
});

// ─── _scanJ2KBlocks with real NITF image data ────────────────
describeWithFiles('NITFParser._scanJ2KBlocks with real C8 image data', () => {
    test('finds J2K codestream in p0_01a.ntf image data', () => {
        const buffer = loadNITF(path.join(J2K_DIR, 'p0_01a.ntf'));
        const nitf = NITFParser.parseNITF(buffer);
        const img = nitf.images[0];
        expect(img.ic).toBe('C8');

        const ranges = NITFParser._scanJ2KBlocks(img.rawData, 1);
        expect(ranges[0]).not.toBeNull();
        expect(ranges[0].start).toBeGreaterThanOrEqual(0);
        expect(ranges[0].length).toBeGreaterThan(100);
    });
});

// ─── Multi-image segment selection ────────────────────────────
describeWithFiles('Multi-image segment handling', () => {
    let logSpy, warnSpy;
    beforeAll(() => {
        logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterAll(() => { logSpy.mockRestore(); warnSpy.mockRestore(); });

    test('i_3113g.ntf parses all image segments', () => {
        const buffer = loadNITF(path.join(NITF21_DIR, 'i_3113g.ntf'));
        const nitf = NITFParser.parseNITF(buffer);
        expect(nitf.images.length).toBeGreaterThanOrEqual(1);
        // Each segment should have valid dimensions
        for (const img of nitf.images) {
            expect(img.nrows).toBeGreaterThan(0);
            expect(img.ncols).toBeGreaterThan(0);
        }
    });
});
