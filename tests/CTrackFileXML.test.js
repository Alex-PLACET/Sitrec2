/**
 * @jest-environment jsdom
 */
import fs from 'fs';
import path from 'path';
import {CTrackFileXML} from '../src/TrackFiles/CTrackFileXML';
import {parseXml} from '../src/parseXml';
import {MISB} from '../src/MISBFields';

const testXMLPath = path.join(__dirname, '../data/test/elevated_track.xml');

describe('CTrackFileXML', () => {
    let xmlData;
    let parsedXml;
    let trackFile;

    beforeAll(() => {
        xmlData = fs.readFileSync(testXMLPath, 'utf-8');
        parsedXml = parseXml(xmlData);
        trackFile = new CTrackFileXML(parsedXml);
    });

    describe('doesContainTrack', () => {
        test('returns true for valid XML data', () => {
            expect(trackFile.doesContainTrack()).toBe(true);
        });

        test('returns false for empty object', () => {
            const emptyTrack = new CTrackFileXML({});
            expect(emptyTrack.doesContainTrack()).toBe(false);
        });

        test('returns false for invalid data', () => {
            const invalidTrack = new CTrackFileXML({nitsRoot: {}});
            expect(invalidTrack.doesContainTrack()).toBe(false);
        });

        test('returns false for null data', () => {
            const nullTrack = new CTrackFileXML(null);
            expect(nullTrack.doesContainTrack()).toBe(false);
        });

        test('returns false for string data', () => {
            const stringTrack = new CTrackFileXML('not an object');
            expect(stringTrack.doesContainTrack()).toBe(false);
        });
    });

    describe('toMISB', () => {
        test('returns MISB array for valid XML data', () => {
            const misb = trackFile.toMISB();
            expect(Array.isArray(misb)).toBe(true);
            expect(misb.length).toBeGreaterThan(0);
        });

        test('returns 11 track points from test file', () => {
            const misb = trackFile.toMISB();
            expect(misb.length).toBe(11);
        });

        test('first entry has correct latitude from test file', () => {
            const misb = trackFile.toMISB();
            expect(misb[0][MISB.SensorLatitude]).toBeCloseTo(40.448281922640632, 6);
        });

        test('first entry has correct longitude from test file', () => {
            const misb = trackFile.toMISB();
            expect(misb[0][MISB.SensorLongitude]).toBeCloseTo(-104.877919707133, 6);
        });

        test('first entry has correct altitude from test file', () => {
            const misb = trackFile.toMISB();
            expect(misb[0][MISB.SensorTrueAltitude]).toBeCloseTo(1744.3974248617887, 2);
        });

        test('first entry has timestamp', () => {
            const misb = trackFile.toMISB();
            expect(misb[0][MISB.UnixTimeStamp]).toBeDefined();
            expect(typeof misb[0][MISB.UnixTimeStamp]).toBe('number');
        });

        test('timestamps increase through track points', () => {
            const misb = trackFile.toMISB();
            for (let i = 1; i < misb.length; i++) {
                expect(misb[i][MISB.UnixTimeStamp]).toBeGreaterThan(misb[i-1][MISB.UnixTimeStamp]);
            }
        });

        test('returns false for invalid track index', () => {
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
            const result = trackFile.toMISB(1);
            expect(result).toBe(false);
            warnSpy.mockRestore();
        });

        test('returns false for invalid data', () => {
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
            const invalidTrack = new CTrackFileXML({});
            expect(invalidTrack.toMISB()).toBe(false);
            warnSpy.mockRestore();
        });
    });

    describe('getShortName', () => {
        test('returns filename without extension when provided', () => {
            expect(trackFile.getShortName(0, 'elevated_track.xml')).toBe('elevated_track');
        });

        test('returns default name when no filename provided', () => {
            expect(trackFile.getShortName()).toBe('XML Track');
        });
    });

    describe('hasMoreTracks', () => {
        test('returns false (XML files contain single track)', () => {
            expect(trackFile.hasMoreTracks()).toBe(false);
            expect(trackFile.hasMoreTracks(0)).toBe(false);
            expect(trackFile.hasMoreTracks(1)).toBe(false);
        });
    });

    describe('getTrackCount', () => {
        test('returns 1 (XML files contain single track)', () => {
            expect(trackFile.getTrackCount()).toBe(1);
        });
    });

    describe('extractObjects', () => {
        test('does not throw', () => {
            expect(() => trackFile.extractObjects()).not.toThrow();
        });
    });
});
