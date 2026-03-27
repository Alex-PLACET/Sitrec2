/**
 * @jest-environment jsdom
 */
import fs from 'fs';
import path from 'path';
import {CTrackFileNITF} from '../src/TrackFiles/CTrackFileNITF';
import {MISB, MISBFields} from '../src/MISBFields';

// Mock browser-dependent modules that NITFParser imports
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

const NITF_DIR = path.resolve(__dirname, '../../nitf-test-files');
const NITF21_DIR = path.join(NITF_DIR, 'JitcNitf21Samples');
const hasTestFiles = fs.existsSync(NITF_DIR);

// ── Tests with synthetic corner data ──────────────────────────
describe('CTrackFileNITF', () => {
    let logSpy, warnSpy;

    beforeAll(() => {
        logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterAll(() => {
        logSpy.mockRestore();
        warnSpy.mockRestore();
    });

    describe('canHandle', () => {
        test('returns true for .nitftrack', () => {
            expect(CTrackFileNITF.canHandle('test.nitftrack', {})).toBe(true);
        });

        test('returns true case-insensitive', () => {
            expect(CTrackFileNITF.canHandle('test.NiTfTraCk', {})).toBe(true);
        });

        test('returns false for .ntf', () => {
            expect(CTrackFileNITF.canHandle('test.ntf', {})).toBe(false);
        });

        test('returns false for .kml', () => {
            expect(CTrackFileNITF.canHandle('test.kml', {})).toBe(false);
        });
    });

    describe('constructor with synthetic data', () => {
        let trackFile;

        beforeAll(() => {
            trackFile = new CTrackFileNITF({
                corners: [
                    {lat: 40.01, lon: -104.01}, // UL
                    {lat: 40.01, lon: -103.99}, // UR
                    {lat: 39.99, lon: -103.99}, // LR
                    {lat: 39.99, lon: -104.01}, // LL
                ],
                datetime: new Date('2020-06-15T12:00:00Z'),
                title: 'Test Image',
                tres: {},
                width: 1024,
                height: 1024
            });
        });

        test('calculates center from corner averages', () => {
            expect(trackFile.centerLat).toBeCloseTo(40.0, 4);
            expect(trackFile.centerLon).toBeCloseTo(-104.0, 4);
        });

        test('calculates positive ground dimensions', () => {
            expect(trackFile.groundWidth).toBeGreaterThan(0);
            expect(trackFile.groundHeight).toBeGreaterThan(0);
        });

        test('calculates GSD', () => {
            expect(trackFile.gsdX).toBeGreaterThan(0);
            expect(trackFile.gsdY).toBeGreaterThan(0);
        });

        test('calculates valid image heading', () => {
            expect(trackFile.imageHeading).toBeGreaterThanOrEqual(0);
            expect(trackFile.imageHeading).toBeLessThan(360);
        });

        test('uses satellite fallback without ENGRDA', () => {
            expect(trackFile.sensorAltitude).toBe(500000);
            expect(trackFile.sensorElevation).toBe(-90);
            expect(trackFile.sensorLat).toBeCloseTo(trackFile.centerLat, 4);
            expect(trackFile.sensorLon).toBeCloseTo(trackFile.centerLon, 4);
        });

        test('computes FOV from altitude', () => {
            expect(trackFile.hFOV).toBeGreaterThan(0);
            expect(trackFile.vFOV).toBeGreaterThan(0);
            expect(trackFile.sensorFOV).toBeGreaterThan(0);
        });
    });

    describe('doesContainTrack', () => {
        test('returns true with 4 corners', () => {
            const tf = new CTrackFileNITF({
                corners: [
                    {lat: 40, lon: -104}, {lat: 40, lon: -103},
                    {lat: 39, lon: -103}, {lat: 39, lon: -104}
                ],
                datetime: null, title: '', tres: {}, width: 100, height: 100
            });
            expect(tf.doesContainTrack()).toBe(true);
        });

        test('returns false with null corners', () => {
            const tf = new CTrackFileNITF({
                corners: null,
                datetime: null, title: '', tres: {}, width: 100, height: 100
            });
            expect(tf.doesContainTrack()).toBe(false);
        });

        test('returns false with 3 corners', () => {
            const tf = new CTrackFileNITF({
                corners: [{lat: 0, lon: 0}, {lat: 0, lon: 1}, {lat: 1, lon: 0}],
                datetime: null, title: '', tres: {}, width: 100, height: 100
            });
            expect(tf.doesContainTrack()).toBe(false);
        });
    });

    describe('toMISB', () => {
        let trackFile;

        beforeAll(() => {
            trackFile = new CTrackFileNITF({
                corners: [
                    {lat: 40.01, lon: -104.01}, {lat: 40.01, lon: -103.99},
                    {lat: 39.99, lon: -103.99}, {lat: 39.99, lon: -104.01}
                ],
                datetime: new Date('2020-06-15T12:00:00Z'),
                title: 'Test', tres: {}, width: 512, height: 512
            });
        });

        test('returns array of 2 rows', () => {
            const misb = trackFile.toMISB(0);
            expect(Array.isArray(misb)).toBe(true);
            expect(misb.length).toBe(2);
        });

        test('rows are 30 seconds apart', () => {
            const misb = trackFile.toMISB(0);
            const dt = misb[1][MISB.UnixTimeStamp] - misb[0][MISB.UnixTimeStamp];
            expect(dt).toBe(30000);
        });

        test('rows have valid sensor positions', () => {
            const misb = trackFile.toMISB(0);
            const row = misb[0];
            expect(typeof row[MISB.SensorLatitude]).toBe('number');
            expect(typeof row[MISB.SensorLongitude]).toBe('number');
            expect(typeof row[MISB.SensorTrueAltitude]).toBe('number');
            expect(row[MISB.SensorTrueAltitude]).toBeGreaterThan(0);
        });

        test('rows have platform heading', () => {
            const misb = trackFile.toMISB(0);
            expect(typeof misb[0][MISB.PlatformHeadingAngle]).toBe('number');
        });

        test('rows have FOV', () => {
            const misb = trackFile.toMISB(0);
            expect(misb[0][MISB.SensorHorizontalFieldofView]).toBeGreaterThan(0);
            expect(misb[0][MISB.SensorVerticalFieldofView]).toBeGreaterThan(0);
        });

        test('rows have corner coordinates', () => {
            const misb = trackFile.toMISB(0);
            const row = misb[0];
            expect(row[MISB.CornerLatitudePoint1]).toBeCloseTo(40.01, 2);
            expect(row[MISB.CornerLongitudePoint1]).toBeCloseTo(-104.01, 2);
            expect(row[MISB.CornerLatitudePoint3]).toBeCloseTo(39.99, 2);
            expect(row[MISB.CornerLongitudePoint3]).toBeCloseTo(-103.99, 2);
        });

        test('rows have frame center', () => {
            const misb = trackFile.toMISB(0);
            expect(misb[0][MISB.FrameCenterLatitude]).toBeCloseTo(40.0, 2);
            expect(misb[0][MISB.FrameCenterLongitude]).toBeCloseTo(-104.0, 2);
        });

        test('returns false for invalid track index', () => {
            expect(trackFile.toMISB(1)).toBe(false);
            expect(trackFile.toMISB(-1)).toBe(false);
        });
    });

    describe('toMISB datetime handling', () => {
        test('uses valid datetime directly', () => {
            const dt = new Date('2020-06-15T14:30:00Z');
            const tf = new CTrackFileNITF({
                corners: [
                    {lat: 40, lon: -104}, {lat: 40, lon: -103},
                    {lat: 39, lon: -103}, {lat: 39, lon: -104}
                ],
                datetime: dt, title: '', tres: {}, width: 100, height: 100
            });
            const misb = tf.toMISB(0);
            expect(misb[0][MISB.UnixTimeStamp]).toBe(dt.getTime());
        });

        test('synthesizes fallback for null datetime', () => {
            const tf = new CTrackFileNITF({
                corners: [
                    {lat: 40, lon: -104}, {lat: 40, lon: -103},
                    {lat: 39, lon: -103}, {lat: 39, lon: -104}
                ],
                datetime: null, title: '', tres: {}, width: 100, height: 100
            });
            const misb = tf.toMISB(0);
            expect(misb[0][MISB.UnixTimeStamp]).toBeGreaterThan(0);
        });

        test('synthesizes fallback for pre-epoch datetime', () => {
            const tf = new CTrackFileNITF({
                corners: [
                    {lat: 40, lon: -104}, {lat: 40, lon: -103},
                    {lat: 39, lon: -103}, {lat: 39, lon: -104}
                ],
                datetime: new Date('1950-01-01T00:00:00Z'),
                title: '', tres: {}, width: 100, height: 100
            });
            const misb = tf.toMISB(0);
            // Should use 2026-03-30 fallback, not the negative timestamp
            expect(misb[0][MISB.UnixTimeStamp]).toBeGreaterThan(0);
        });
    });

    describe('getShortName', () => {
        test('returns title when short enough', () => {
            const tf = new CTrackFileNITF({
                corners: [{lat: 0, lon: 0}, {lat: 0, lon: 1}, {lat: 1, lon: 1}, {lat: 1, lon: 0}],
                datetime: null, title: 'Airfield', tres: {}, width: 100, height: 100
            });
            expect(tf.getShortName(0, 'file.ntf')).toBe('Airfield');
        });

        test('falls back to filename when title is too long', () => {
            const tf = new CTrackFileNITF({
                corners: [{lat: 0, lon: 0}, {lat: 0, lon: 1}, {lat: 1, lon: 1}, {lat: 1, lon: 0}],
                datetime: null,
                title: 'This is a very long title that exceeds forty characters easily',
                tres: {}, width: 100, height: 100
            });
            expect(tf.getShortName(0, 'image.ntf')).toBe('image');
        });

        test('returns default title when no title and no filename', () => {
            // Constructor sets title to 'NITF' when empty string passed
            const tf = new CTrackFileNITF({
                corners: [{lat: 0, lon: 0}, {lat: 0, lon: 1}, {lat: 1, lon: 1}, {lat: 1, lon: 0}],
                datetime: null, title: '', tres: {}, width: 100, height: 100
            });
            expect(tf.getShortName(0, '')).toBe('NITF');
        });
    });

    describe('hasMoreTracks / getTrackCount', () => {
        test('always returns false for hasMoreTracks', () => {
            const tf = new CTrackFileNITF({
                corners: [{lat: 0, lon: 0}, {lat: 0, lon: 1}, {lat: 1, lon: 1}, {lat: 1, lon: 0}],
                datetime: null, title: '', tres: {}, width: 100, height: 100
            });
            expect(tf.hasMoreTracks(0)).toBe(false);
        });

        test('always returns 1 for getTrackCount', () => {
            const tf = new CTrackFileNITF({
                corners: [{lat: 0, lon: 0}, {lat: 0, lon: 1}, {lat: 1, lon: 1}, {lat: 1, lon: 0}],
                datetime: null, title: '', tres: {}, width: 100, height: 100
            });
            expect(tf.getTrackCount()).toBe(1);
        });
    });

    describe('autoSelectAsCamera', () => {
        test('returns true', () => {
            const tf = new CTrackFileNITF({
                corners: [{lat: 0, lon: 0}, {lat: 0, lon: 1}, {lat: 1, lon: 1}, {lat: 1, lon: 0}],
                datetime: null, title: '', tres: {}, width: 100, height: 100
            });
            expect(tf.autoSelectAsCamera).toBe(true);
        });
    });
});

// ── Tests with real NITF file data ────────────────────────────
const describeWithFiles = hasTestFiles ? describe : describe.skip;

describeWithFiles('CTrackFileNITF with real NITF data', () => {
    let logSpy, warnSpy;

    beforeAll(() => {
        logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterAll(() => {
        logSpy.mockRestore();
        warnSpy.mockRestore();
    });

    test('geometry from i_3001a.ntf corners', () => {
        const buf = fs.readFileSync(path.join(NITF21_DIR, 'i_3001a.ntf'));
        const arrayBuf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        const nitf = NITFParser.parseNITF(arrayBuf);
        const img = nitf.images[0];

        if (!img.corners) return; // skip if no geolocation

        const tf = new CTrackFileNITF({
            corners: img.corners,
            datetime: img.datetime || nitf.fileHeader.datetime,
            title: img.iid2 || img.iid1 || '',
            tres: img.tres,
            width: img.ncols,
            height: img.nrows
        });

        // Center should be between corner extremes
        const lats = img.corners.map(c => c.lat);
        const lons = img.corners.map(c => c.lon);
        expect(tf.centerLat).toBeGreaterThanOrEqual(Math.min(...lats));
        expect(tf.centerLat).toBeLessThanOrEqual(Math.max(...lats));
        expect(tf.centerLon).toBeGreaterThanOrEqual(Math.min(...lons));
        expect(tf.centerLon).toBeLessThanOrEqual(Math.max(...lons));

        // Ground dimensions should be positive
        expect(tf.groundWidth).toBeGreaterThan(0);
        expect(tf.groundHeight).toBeGreaterThan(0);

        // GSD should be positive
        expect(tf.gsdX).toBeGreaterThan(0);
        expect(tf.gsdY).toBeGreaterThan(0);

        // MISB output should work
        const misb = tf.toMISB(0);
        expect(misb).not.toBe(false);
        expect(misb.length).toBe(2);
        expect(misb[0][MISB.SensorLatitude]).toBeDefined();
    });
});
