/**
 * @jest-environment jsdom
 */
import fs from 'fs';
import path from 'path';
import {CTrackFileJSON} from '../src/TrackFiles/CTrackFileJSON';
import {MISB} from '../src/MISBFields';

const testSingleTrackPath = path.join(__dirname, '../data/test/Track_N866TM_.json');
const testNoTailNumberPath = path.join(__dirname, '../data/test/Track_N866TM_All_No tail number.json');
const testNoTailOrAircraftPath = path.join(__dirname, '../data/test/Track_N866TM_All_no tail number or aircraft type.json');

describe('CTrackFileJSON', () => {
    let singleTrackData, singleTrackFile;
    let noTailNumberData, noTailNumberTrackFile;
    let noTailOrAircraftData, noTailOrAircraftTrackFile;

    beforeAll(() => {
        singleTrackData = JSON.parse(fs.readFileSync(testSingleTrackPath, 'utf-8'));
        singleTrackFile = new CTrackFileJSON(singleTrackData);

        noTailNumberData = JSON.parse(fs.readFileSync(testNoTailNumberPath, 'utf-8'));
        noTailNumberTrackFile = new CTrackFileJSON(noTailNumberData);

        noTailOrAircraftData = JSON.parse(fs.readFileSync(testNoTailOrAircraftPath, 'utf-8'));
        noTailOrAircraftTrackFile = new CTrackFileJSON(noTailOrAircraftData);
    });

    describe('canHandle', () => {
        test('returns true for single track JSON', () => {
            expect(CTrackFileJSON.canHandle('test.json', singleTrackData)).toBe(true);
        });

        test('returns true for multi-track JSON without tail number', () => {
            expect(CTrackFileJSON.canHandle('test.json', noTailNumberData)).toBe(true);
        });

        test('returns true for multi-track JSON without tail or aircraft type', () => {
            expect(CTrackFileJSON.canHandle('test.json', noTailOrAircraftData)).toBe(true);
        });

        test('returns false for empty object', () => {
            expect(CTrackFileJSON.canHandle('test.json', {})).toBe(false);
        });

        test('returns false for null data', () => {
            expect(CTrackFileJSON.canHandle('test.json', null)).toBe(false);
        });

        test('returns false for string data', () => {
            expect(CTrackFileJSON.canHandle('test.json', 'not an object')).toBe(false);
        });

        test('returns false for non-FeatureCollection', () => {
            expect(CTrackFileJSON.canHandle('test.json', {type: 'Feature'})).toBe(false);
        });

        test('returns false for FeatureCollection without features', () => {
            expect(CTrackFileJSON.canHandle('test.json', {type: 'FeatureCollection'})).toBe(false);
        });

        test('returns false for FeatureCollection with empty features', () => {
            expect(CTrackFileJSON.canHandle('test.json', {type: 'FeatureCollection', features: []})).toBe(false);
        });

        test('returns false for feature without geometry', () => {
            const data = {
                type: 'FeatureCollection',
                features: [{type: 'Feature', properties: {thresherId: 'test', dtg: '2012-09-19T18:28:01.000Z'}}]
            };
            expect(CTrackFileJSON.canHandle('test.json', data)).toBe(false);
        });

        test('returns false for feature without Point geometry type', () => {
            const data = {
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    geometry: {type: 'Polygon'},
                    properties: {thresherId: 'test', dtg: '2012-09-19T18:28:01.000Z'}
                }]
            };
            expect(CTrackFileJSON.canHandle('test.json', data)).toBe(false);
        });

        test('returns false for feature without thresherId or dtg', () => {
            const data = {
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    geometry: {type: 'Point', coordinates: [0, 0, 0]},
                    properties: {lat: 0, lon: 0}
                }]
            };
            expect(CTrackFileJSON.canHandle('test.json', data)).toBe(false);
        });

        test('returns true with only thresherId (no dtg)', () => {
            const data = {
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    geometry: {type: 'Point', coordinates: [0, 0, 0]},
                    properties: {thresherId: 'test'}
                }]
            };
            expect(CTrackFileJSON.canHandle('test.json', data)).toBe(true);
        });

        test('returns true with only dtg (no thresherId)', () => {
            const data = {
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    geometry: {type: 'Point', coordinates: [0, 0, 0]},
                    properties: {dtg: '2012-09-19T18:28:01.000Z'}
                }]
            };
            expect(CTrackFileJSON.canHandle('test.json', data)).toBe(true);
        });

        test('returns false for KML data', () => {
            expect(CTrackFileJSON.canHandle('test.kml', {kml: {}})).toBe(false);
        });

        test('returns false for STANAG XML data', () => {
            expect(CTrackFileJSON.canHandle('test.xml', {nitsRoot: {}})).toBe(false);
        });
    });

    describe('doesContainTrack', () => {
        test('returns true for single track JSON', () => {
            expect(singleTrackFile.doesContainTrack()).toBe(true);
        });

        test('returns true for multi-track JSON', () => {
            expect(noTailNumberTrackFile.doesContainTrack()).toBe(true);
        });

        test('returns false for empty features', () => {
            const emptyTrack = new CTrackFileJSON({type: 'FeatureCollection', features: []});
            expect(emptyTrack.doesContainTrack()).toBe(false);
        });
    });

    describe('getTrackCount', () => {
        test('single track file has 1 track', () => {
            expect(singleTrackFile.getTrackCount()).toBe(1);
        });

        test('no tail number file has 2 tracks', () => {
            expect(noTailNumberTrackFile.getTrackCount()).toBe(2);
        });

        test('no tail or aircraft file has 2 tracks', () => {
            expect(noTailOrAircraftTrackFile.getTrackCount()).toBe(2);
        });
    });

    describe('hasMoreTracks', () => {
        test('single track returns false for index 0', () => {
            expect(singleTrackFile.hasMoreTracks(0)).toBe(false);
        });

        test('multi-track returns true for index 0', () => {
            expect(noTailNumberTrackFile.hasMoreTracks(0)).toBe(true);
        });

        test('multi-track returns false for last index', () => {
            expect(noTailNumberTrackFile.hasMoreTracks(1)).toBe(false);
        });
    });

    describe('getShortName', () => {
        test('single track returns thresherId (cropped to 16 chars)', () => {
            const shortName = singleTrackFile.getShortName(0);
            expect(shortName).toBe('Track_N866TM');
        });

        test('no tail number file returns aircraftType for first track', () => {
            const shortName = noTailNumberTrackFile.getShortName(0);
            expect(shortName).toBe('Aircraft Type OK');
        });

        test('no tail number file returns cropped thresherId for second track', () => {
            const shortName = noTailNumberTrackFile.getShortName(1);
            expect(shortName).toBe('Track_N866TM');
        });

        test('no tail or aircraft file returns cropped thresherId for first track', () => {
            const shortName = noTailOrAircraftTrackFile.getShortName(0);
            expect(shortName.length).toBeLessThanOrEqual(16);
        });
    });

    describe('toMISB', () => {
        test('single track returns array with correct length', () => {
            const misb = singleTrackFile.toMISB(0);
            expect(misb.length).toBe(601);
        });

        test('MISB data has required fields', () => {
            const misb = singleTrackFile.toMISB(0);
            expect(misb[0][MISB.UnixTimeStamp]).toBeDefined();
            expect(misb[0][MISB.SensorLatitude]).toBeDefined();
            expect(misb[0][MISB.SensorLongitude]).toBeDefined();
            expect(misb[0][MISB.SensorTrueAltitude]).toBeDefined();
        });

        test('first point has correct coordinates', () => {
            const misb = singleTrackFile.toMISB(0);
            expect(misb[0][MISB.SensorLatitude]).toBeCloseTo(42.116341, 5);
            expect(misb[0][MISB.SensorLongitude]).toBeCloseTo(-87.900675, 5);
            expect(misb[0][MISB.SensorTrueAltitude]).toBe(0);
        });

        test('first point has correct timestamp', () => {
            const misb = singleTrackFile.toMISB(0);
            const expectedTime = new Date('2012-09-19T18:28:01.000Z').getTime();
            expect(misb[0][MISB.UnixTimeStamp]).toBe(expectedTime);
        });

        test('MISB data is sorted by timestamp', () => {
            const misb = singleTrackFile.toMISB(0);
            for (let i = 1; i < misb.length; i++) {
                expect(misb[i][MISB.UnixTimeStamp]).toBeGreaterThanOrEqual(misb[i - 1][MISB.UnixTimeStamp]);
            }
        });

        test('multi-track file can extract first track', () => {
            const misb = noTailNumberTrackFile.toMISB(0);
            expect(misb.length).toBeGreaterThan(0);
        });

        test('multi-track file can extract second track', () => {
            const misb = noTailNumberTrackFile.toMISB(1);
            expect(misb.length).toBeGreaterThan(0);
        });
    });

    describe('extractObjects', () => {
        test('extractObjects does not throw', () => {
            expect(() => singleTrackFile.extractObjects()).not.toThrow();
        });
    });

    describe('error handling', () => {
        test('handles undefined data gracefully in canHandle', () => {
            expect(CTrackFileJSON.canHandle('test.json', undefined)).toBe(false);
        });

        test('handles array data in canHandle', () => {
            expect(CTrackFileJSON.canHandle('test.json', [])).toBe(false);
        });

        test('handles number data in canHandle', () => {
            expect(CTrackFileJSON.canHandle('test.json', 42)).toBe(false);
        });
    });
});
