/**
 * @jest-environment jsdom
 */
import fs from 'fs';
import path from 'path';

// Mock browser-dependent modules before importing NITFParser
jest.mock('../src/FileUtils', () => ({
    createImageFromArrayBuffer: jest.fn()
}));
jest.mock('../src/JPEG2000Utils', () => ({
    decodeJPEG2000ToBlobURL: jest.fn(),
    decodeJ2KTiledToCanvas: jest.fn()
}));
jest.mock('../src/CProgressIndicator', () => ({
    initProgress: jest.fn(),
    updateProgress: jest.fn(),
    hideProgress: jest.fn()
}));

import {NITFParser} from '../src/NITFParser';

// Test files are outside the repo in sitrec-dev/
const NITF_DIR = path.resolve(__dirname, '../../nitf-test-files');
const NITF21_DIR = path.join(NITF_DIR, 'JitcNitf21Samples');
const NITF20_DIR = path.join(NITF_DIR, 'JitcNitf20Samples');
const J2K_DIR = path.join(NITF_DIR, 'JitcJpeg2000');

const hasTestFiles = fs.existsSync(NITF_DIR);

function loadNITF(filePath) {
    const buf = fs.readFileSync(filePath);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

// Convenience: load and parse in one step
function parseFile(filePath) {
    return NITFParser.parseNITF(loadNITF(filePath));
}

const describeWithFiles = hasTestFiles ? describe : describe.skip;

// ─── isNITF ───────────────────────────────────────────────────
describe('NITFParser.isNITF', () => {
    test('returns false for buffer shorter than 9 bytes', () => {
        expect(NITFParser.isNITF(new ArrayBuffer(4))).toBe(false);
    });

    test('returns false for non-NITF buffer', () => {
        const buf = new ArrayBuffer(16);
        const view = new Uint8Array(buf);
        view.set([0x89, 0x50, 0x4E, 0x47]); // PNG magic
        expect(NITFParser.isNITF(buf)).toBe(false);
    });

    test('returns true for NITF magic bytes', () => {
        const buf = new ArrayBuffer(16);
        const view = new Uint8Array(buf);
        view.set([0x4E, 0x49, 0x54, 0x46, 0x30, 0x32, 0x2E, 0x31, 0x30]); // NITF02.10
        expect(NITFParser.isNITF(buf)).toBe(true);
    });

    test('returns true for NSIF magic bytes', () => {
        const buf = new ArrayBuffer(16);
        const view = new Uint8Array(buf);
        view.set([0x4E, 0x53, 0x49, 0x46, 0x30, 0x31, 0x2E, 0x30, 0x30]); // NSIF01.00
        expect(NITFParser.isNITF(buf)).toBe(true);
    });
});

// ─── parseDMSLat / parseDMSLon ─────────────────────────────────
describe('NITFParser coordinate parsing', () => {
    describe('parseDMSLat', () => {
        test('parses northern latitude', () => {
            expect(NITFParser.parseDMSLat('325900N')).toBeCloseTo(32 + 59/60, 4);
        });

        test('parses southern latitude (negative)', () => {
            expect(NITFParser.parseDMSLat('325900S')).toBeCloseTo(-(32 + 59/60), 4);
        });

        test('parses zero latitude', () => {
            expect(NITFParser.parseDMSLat('000000N')).toBe(0);
        });

        test('parses latitude with seconds', () => {
            // 33°45'30"N = 33 + 45/60 + 30/3600 = 33.7583333...
            expect(NITFParser.parseDMSLat('334530N')).toBeCloseTo(33.758333, 4);
        });
    });

    describe('parseDMSLon', () => {
        test('parses eastern longitude', () => {
            // Format: dddmmssX (8 chars)
            expect(NITFParser.parseDMSLon('0850000E')).toBeCloseTo(85, 4);
        });

        test('parses western longitude (negative)', () => {
            expect(NITFParser.parseDMSLon('0850000W')).toBeCloseTo(-85, 4);
        });

        test('parses 180 degrees', () => {
            expect(NITFParser.parseDMSLon('1800000E')).toBeCloseTo(180, 4);
        });

        test('parses longitude with minutes and seconds', () => {
            // 104°51'30"W = -(104 + 51/60 + 30/3600) = -104.858333...
            expect(NITFParser.parseDMSLon('1045130W')).toBeCloseTo(-104.858333, 4);
        });
    });

    describe('parseIGEOLO', () => {
        test('parses Geographic DMS (ICORDS=G)', () => {
            // 4 corners × 15 chars = 60 chars
            // Corner: 7 chars lat + 8 chars lon
            const igeolo = '325900N0850000E' +
                           '325900N0860000E' +
                           '315900N0860000E' +
                           '315900N0850000E';
            const corners = NITFParser.parseIGEOLO(igeolo, 'G');
            expect(corners).toHaveLength(4);
            expect(corners[0].lat).toBeCloseTo(32 + 59/60, 4);
            expect(corners[0].lon).toBeCloseTo(85, 4);
            expect(corners[2].lat).toBeCloseTo(31 + 59/60, 4);
            expect(corners[2].lon).toBeCloseTo(86, 4);
        });

        test('parses Decimal Degrees (ICORDS=D)', () => {
            const igeolo = '+40.000-104.000' +
                           '+40.000-103.000' +
                           '+39.000-103.000' +
                           '+39.000-104.000';
            const corners = NITFParser.parseIGEOLO(igeolo, 'D');
            expect(corners).toHaveLength(4);
            expect(corners[0].lat).toBeCloseTo(40, 2);
            expect(corners[0].lon).toBeCloseTo(-104, 2);
        });

        test('returns null for unsupported ICORDS', () => {
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
            const result = NITFParser.parseIGEOLO('x'.repeat(60), 'Z');
            expect(result).toBeNull();
            warnSpy.mockRestore();
        });
    });

    describe('_utmToLatLon', () => {
        test('converts UTM Northern Hemisphere', () => {
            // Zone 17, easting 630000, northing 4833500 ≈ roughly 43.6°N, 79.3°W (Toronto area)
            const result = NITFParser._utmToLatLon(17, 630000, 4833500, true);
            expect(result.lat).toBeGreaterThan(43);
            expect(result.lat).toBeLessThan(44);
            expect(result.lon).toBeGreaterThan(-80);
            expect(result.lon).toBeLessThan(-79);
        });

        test('converts UTM Southern Hemisphere', () => {
            // Zone 56, easting 334000, northing 6252000 ≈ roughly 33.8°S (Sydney area)
            const result = NITFParser._utmToLatLon(56, 334000, 6252000, false);
            expect(result.lat).toBeLessThan(-33);
            expect(result.lat).toBeGreaterThan(-35);
        });
    });
});

// ─── parseDatetime ────────────────────────────────────────────
describe('NITFParser.parseDatetime', () => {
    test('parses NITF 2.1 format (CCYYMMDDhhmmss)', () => {
        const dt = NITFParser.parseDatetime('19971217102630');
        expect(dt).toBeInstanceOf(Date);
        expect(dt.getUTCFullYear()).toBe(1997);
        expect(dt.getUTCMonth()).toBe(11); // December = 11
        expect(dt.getUTCDate()).toBe(17);
    });

    test('parses another 2.1 datetime', () => {
        const dt = NITFParser.parseDatetime('20091021203858');
        expect(dt).toBeInstanceOf(Date);
        expect(dt.getUTCFullYear()).toBe(2009);
        expect(dt.getUTCMonth()).toBe(9); // October = 9
        expect(dt.getUTCDate()).toBe(21);
    });

    test('returns null for empty string', () => {
        expect(NITFParser.parseDatetime('')).toBeNull();
    });

    test('returns null for too-short string', () => {
        expect(NITFParser.parseDatetime('1997')).toBeNull();
    });

    test('returns null for null', () => {
        expect(NITFParser.parseDatetime(null)).toBeNull();
    });
});

// ─── File header parsing with real NITF files ─────────────────
describeWithFiles('NITFParser.parseNITF with JITC files', () => {
    let logSpy, warnSpy;

    beforeAll(() => {
        logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterAll(() => {
        logSpy.mockRestore();
        warnSpy.mockRestore();
    });

    // ── NITF 2.1 basic file header ──
    describe('NITF 2.1 file header (i_3001a.ntf)', () => {
        let result;
        beforeAll(() => {
            result = parseFile(path.join(NITF21_DIR, 'i_3001a.ntf'));
        });

        test('parses successfully', () => {
            expect(result).not.toBeNull();
            expect(result.fileHeader).toBeDefined();
            expect(result.images).toBeDefined();
        });

        test('has correct version', () => {
            expect(result.fileHeader.version).toBe('02.10');
        });

        test('has valid datetime', () => {
            expect(result.fileHeader.datetime).toBeInstanceOf(Date);
        });

        test('has one image segment', () => {
            expect(result.images.length).toBeGreaterThanOrEqual(1);
        });

        test('image has correct dimensions', () => {
            const img = result.images[0];
            expect(img.nrows).toBe(1024);
            expect(img.ncols).toBe(1024);
        });

        test('image has correct pixel properties', () => {
            const img = result.images[0];
            expect(img.abpp).toBe(8);
            expect(img.nbands).toBe(1);
            expect(img.irep).toBe('MONO');
        });

        test('image has IC=NC (uncompressed)', () => {
            expect(result.images[0].ic).toBe('NC');
        });

        test('image has parsed corner coordinates', () => {
            const img = result.images[0];
            expect(img.corners).not.toBeNull();
            expect(img.corners).toHaveLength(4);
            expect(typeof img.corners[0].lat).toBe('number');
            expect(typeof img.corners[0].lon).toBe('number');
        });
    });

    // ── NITF 2.0 backward compatibility ──
    describe('NITF 2.0 file header (U_1001A.NTF)', () => {
        let result;
        beforeAll(() => {
            result = parseFile(path.join(NITF20_DIR, 'U_1001A.NTF'));
        });

        test('parses successfully', () => {
            expect(result).not.toBeNull();
        });

        test('has correct version', () => {
            expect(result.fileHeader.version).toBe('02.00');
        });

        test('has image segments', () => {
            expect(result.images.length).toBeGreaterThanOrEqual(1);
        });

        test('image has correct dimensions', () => {
            const img = result.images[0];
            expect(img.nrows).toBe(1024);
            expect(img.ncols).toBe(1024);
        });
    });

    // ── NSIF compatibility ──
    // NSIF 1.0 is structurally identical to NITF 2.1, just with "NSIF" magic
    describe('NSIF 1.0 (ns3004f.nsf)', () => {
        let result;
        beforeAll(() => {
            result = parseFile(path.join(NITF21_DIR, 'ns3004f.nsf'));
        });

        test('parses successfully', () => {
            expect(result).not.toBeNull();
        });

        test('is treated as NITF 2.1', () => {
            expect(result.fileHeader.version).toBe('01.00');
        });

        test('has image segments', () => {
            expect(result.images.length).toBeGreaterThanOrEqual(1);
        });
    });

    // ── IC type detection ──
    describe('IC type detection', () => {
        test('NC (uncompressed) - i_3001a.ntf', () => {
            const result = parseFile(path.join(NITF21_DIR, 'i_3001a.ntf'));
            expect(result.images[0].ic).toBe('NC');
        });

        test('C3 (JPEG) - i_3008a.ntf', () => {
            const filePath = path.join(NITF_DIR, 'i_3008a.ntf');
            if (!fs.existsSync(filePath)) return; // from Wayback download, may not exist
            const result = parseFile(filePath);
            expect(result.images[0].ic).toBe('C3');
        });

        test('C8 (JPEG 2000) - p0_01a.ntf', () => {
            const result = parseFile(path.join(J2K_DIR, 'p0_01a.ntf'));
            expect(result.images[0].ic).toBe('C8');
        });

        test('C1 (CCITT) - i_3041a.ntf', () => {
            const result = parseFile(path.join(NITF21_DIR, 'i_3041a.ntf'));
            expect(result.images[0].ic).toBe('C1');
        });
    });

    // ── IREP (image representation) variants ──
    describe('IREP variants', () => {
        test('MONO - i_3001a.ntf', () => {
            const result = parseFile(path.join(NITF21_DIR, 'i_3001a.ntf'));
            expect(result.images[0].irep).toBe('MONO');
        });

        test('RGB - i_3301a.ntf', () => {
            const result = parseFile(path.join(NITF21_DIR, 'i_3301a.ntf'));
            expect(result.images[0].irep).toBe('RGB');
        });

        test('RGB/LUT - i_3034c.ntf', () => {
            const result = parseFile(path.join(NITF21_DIR, 'i_3034c.ntf'));
            expect(result.images[0].irep).toBe('RGB/LUT');
        });

        test('YCbCr601 - 053_512x512_s_8_3_ycbcr_j2c.ntf', () => {
            const result = parseFile(path.join(J2K_DIR, '053_512x512_s_8_3_ycbcr_j2c.ntf'));
            expect(result.images[0].irep.trim()).toMatch(/YCbCr/);
        });
    });

    // ── IMODE (pixel organization) variants ──
    describe('IMODE variants', () => {
        test('IMODE=S (band sequential) - i_3301a.ntf', () => {
            const result = parseFile(path.join(NITF21_DIR, 'i_3301a.ntf'));
            expect(result.images[0].imode).toBe('S');
        });

        test('IMODE=R (row interleaved) - i_3201c.ntf', () => {
            const result = parseFile(path.join(NITF21_DIR, 'i_3201c.ntf'));
            expect(result.images[0].imode).toBe('R');
        });

        test('IMODE=P (pixel interleaved) - i_3228c.ntf', () => {
            const result = parseFile(path.join(NITF21_DIR, 'i_3228c.ntf'));
            expect(result.images[0].imode).toBe('P');
        });

        test('IMODE=B (block) - i_3309a.ntf', () => {
            const result = parseFile(path.join(NITF21_DIR, 'i_3309a.ntf'));
            expect(result.images[0].imode).toBe('B');
        });
    });

    // ── Bit depth variations ──
    describe('Bit depth (ABPP)', () => {
        test('8-bit - i_3001a.ntf', () => {
            const result = parseFile(path.join(NITF21_DIR, 'i_3001a.ntf'));
            expect(result.images[0].abpp).toBe(8);
            expect(result.images[0].nbpp).toBe(8);
        });

        test('11-bit - i_3405a.ntf', () => {
            const result = parseFile(path.join(NITF21_DIR, 'i_3405a.ntf'));
            expect(result.images[0].abpp).toBe(11);
        });

        test('12-bit - i_3430a.ntf', () => {
            const result = parseFile(path.join(NITF21_DIR, 'i_3430a.ntf'));
            expect(result.images[0].abpp).toBe(12);
        });

        test('13-bit (NITF 2.0) - U_4002A.NTF', () => {
            const result = parseFile(path.join(NITF20_DIR, 'U_4002A.NTF'));
            expect(result.images[0].abpp).toBe(13);
            expect(result.images[0].nbpp).toBe(16); // stored in 16-bit
        });
    });

    // ── Blocking parameters ──
    describe('Blocking parameters', () => {
        test('single block - i_3001a.ntf', () => {
            const result = parseFile(path.join(NITF21_DIR, 'i_3001a.ntf'));
            const img = result.images[0];
            expect(img.nbpr).toBe(1);
            expect(img.nbpc).toBe(1);
        });

        test('4x4 blocks (256px) - i_3301a.ntf', () => {
            const result = parseFile(path.join(NITF21_DIR, 'i_3301a.ntf'));
            const img = result.images[0];
            expect(img.nbpr).toBeGreaterThan(1);
            expect(img.nbpc).toBeGreaterThan(1);
            expect(img.nppbh).toBeGreaterThan(0);
            expect(img.nppbv).toBeGreaterThan(0);
        });

        test('2x2 blocks (1024px) - i_3303a.ntf', () => {
            const result = parseFile(path.join(NITF21_DIR, 'i_3303a.ntf'));
            const img = result.images[0];
            expect(img.nbpr).toBe(2);
            expect(img.nbpc).toBe(2);
        });
    });

    // ── LUT (Look-Up Table) band info ──
    describe('LUT-based images', () => {
        test('binary palette (2 entries) - i_3034c.ntf', () => {
            const result = parseFile(path.join(NITF21_DIR, 'i_3034c.ntf'));
            const img = result.images[0];
            expect(img.irep).toBe('RGB/LUT');
            expect(img.nbands).toBe(1);
            expect(img.bands[0].nluts).toBeGreaterThan(0);
        });

        test('full palette (256 entries) - file9_nc.ntf', () => {
            const result = parseFile(path.join(J2K_DIR, 'file9_nc.ntf'));
            const img = result.images[0];
            expect(img.nbands).toBe(1);
            expect(img.bands[0].nluts).toBeGreaterThan(0);
            expect(img.bands[0].luts.length).toBeGreaterThanOrEqual(3);
        });
    });

    // ── Coordinate parsing from real files ──
    describe('Coordinate parsing from real files', () => {
        test('ICORDS=G DMS corners - i_3001a.ntf', () => {
            const result = parseFile(path.join(NITF21_DIR, 'i_3001a.ntf'));
            const img = result.images[0];
            expect(img.icords).toBe('G');
            expect(img.corners).toHaveLength(4);
            // All corners should have reasonable lat/lon values
            for (const corner of img.corners) {
                expect(corner.lat).toBeGreaterThan(-90);
                expect(corner.lat).toBeLessThan(90);
                expect(corner.lon).toBeGreaterThan(-180);
                expect(corner.lon).toBeLessThan(180);
            }
        });

        test('corners span a reasonable area', () => {
            const result = parseFile(path.join(NITF21_DIR, 'i_3001a.ntf'));
            const corners = result.images[0].corners;
            // UL and UR should differ in longitude
            expect(Math.abs(corners[0].lon - corners[1].lon)).toBeGreaterThan(0);
            // UL and LL should differ in latitude
            expect(Math.abs(corners[0].lat - corners[3].lat)).toBeGreaterThan(0);
        });
    });

    // ── Multi-image segments ──
    describe('Multi-image files', () => {
        test('i_3113g.ntf has image segments', () => {
            const result = parseFile(path.join(NITF21_DIR, 'i_3113g.ntf'));
            expect(result.images.length).toBeGreaterThanOrEqual(1);
        });
    });

    // ── TRE parsing ──
    describe('TRE parsing', () => {
        test('extracts TREs when present', () => {
            const result = parseFile(path.join(NITF21_DIR, 'i_3128b.ntf'));
            const img = result.images[0];
            // i_3128b should have some TREs
            expect(img.tres).toBeDefined();
            if (Object.keys(img.tres).length > 0) {
                const firstTre = Object.values(img.tres)[0];
                expect(firstTre.raw).toBeInstanceOf(Uint8Array);
                expect(firstTre.length).toBeGreaterThan(0);
            }
        });
    });

    // ── JPEG 2000 image metadata ──
    describe('JPEG 2000 metadata', () => {
        test('J2K codestream - p0_01a.ntf', () => {
            const result = parseFile(path.join(J2K_DIR, 'p0_01a.ntf'));
            const img = result.images[0];
            expect(img.ic).toBe('C8');
            expect(img.nrows).toBeGreaterThan(0);
            expect(img.ncols).toBeGreaterThan(0);
        });

        test('11-bit RGB JP2 - 066_389x298_s_11_3_rgb_jp2.ntf', () => {
            const result = parseFile(path.join(J2K_DIR, '066_389x298_s_11_3_rgb_jp2.ntf'));
            const img = result.images[0];
            expect(img.ic).toBe('C8');
            expect(img.abpp).toBe(11);
            expect(img.nbands).toBe(3);
        });

        test('4-band multispectral - 056_512x512_s_8_4_ms_j2c.ntf', () => {
            const result = parseFile(path.join(J2K_DIR, '056_512x512_s_8_4_ms_j2c.ntf'));
            const img = result.images[0];
            expect(img.ic).toBe('C8');
            expect(img.nbands).toBe(4);
        });
    });

    // ── NITF 2.0 specific parsing ──
    describe('NITF 2.0 specific', () => {
        test('parses uncompressed mono correctly - U_1001A.NTF', () => {
            const result = parseFile(path.join(NITF20_DIR, 'U_1001A.NTF'));
            const img = result.images[0];
            expect(img.ic).toBe('NC');
            expect(img.irep).toBe('MONO');
            expect(img.nrows).toBe(1024);
            expect(img.ncols).toBe(1024);
        });

        test('parses RGB with LUT - U_2001A.NTF', () => {
            const result = parseFile(path.join(NITF20_DIR, 'U_2001A.NTF'));
            const img = result.images[0];
            expect(img.nbands).toBeGreaterThanOrEqual(1);
        });

        test('parses multi-block RGB - U_3002A.NTF', () => {
            const result = parseFile(path.join(NITF20_DIR, 'U_3002A.NTF'));
            const img = result.images[0];
            expect(img.nrows).toBeGreaterThan(0);
            expect(img.ncols).toBeGreaterThan(0);
            expect(img.nbpr).toBeGreaterThan(0);
        });
    });

    // ── Data integrity checks ──
    describe('Data integrity', () => {
        test('image has raw data reference', () => {
            const result = parseFile(path.join(NITF21_DIR, 'i_3001a.ntf'));
            const img = result.images[0];
            expect(img.rawData).toBeInstanceOf(Uint8Array);
            expect(img.rawData.length).toBeGreaterThan(0);
            expect(img.dataOffset).toBeGreaterThan(0);
            expect(img.dataLength).toBeGreaterThan(0);
        });

        test('uncompressed data length matches expected pixel count', () => {
            const result = parseFile(path.join(NITF21_DIR, 'i_3001a.ntf'));
            const img = result.images[0];
            if (img.ic === 'NC') {
                const bpp = Math.ceil(img.abpp / 8);
                const expectedBytes = img.nrows * img.ncols * img.nbands * bpp;
                expect(img.dataLength).toBe(expectedBytes);
            }
        });
    });
});
