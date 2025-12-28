/**
 * @jest-environment jsdom
 */
import fs from 'fs';
import path from 'path';
import {parseXml} from '../src/parseXml';
import {CTrackFileKML} from '../src/TrackFiles/CTrackFileKML';
import {CTrackFileSTANAG} from '../src/TrackFiles/CTrackFileSTANAG';
import {CTrackFileSRT} from '../src/TrackFiles/CTrackFileSRT';
import {CTrackFileJSON} from '../src/TrackFiles/CTrackFileJSON';

jest.mock('../src/nodes/CNodeTrack', () => ({
    CNodeTrackFromLLAArray: jest.fn(() => ({
        setArray: jest.fn(),
        recalculateCascade: jest.fn()
    }))
}));
jest.mock('../src/nodes/CNodeDisplayTrack', () => ({
    CNodeDisplayTrack: jest.fn()
}));
jest.mock('../src/LayerMasks', () => ({
    MASK_WORLD: 1
}));
jest.mock('../src/Globals', () => ({
    CustomManager: { shouldIgnore: () => false, ignore: () => {} },
    NodeMan: { getUniqueID: (name) => name },
    Sit: { allowDashInFlightNumber: false }
}));
jest.mock('../src/CFeatureManager', () => ({
    FeatureManager: { addFeature: jest.fn() }
}));

const trackFileClasses = [
    CTrackFileKML,
    CTrackFileSTANAG,
    CTrackFileSRT,
    CTrackFileJSON,
];

function detectTrackFile(filename, data) {
    for (const TrackFileClass of trackFileClasses) {
        if (TrackFileClass.canHandle(filename, data)) {
            return new TrackFileClass(data);
        }
    }
    return null;
}

const testKMLPath = path.join(__dirname, '../data/test/FlightAware_N494SA_KLAX_KIPL_20250602.kml');
const testJSONPath = path.join(__dirname, '../data/test/Track_N866TM_.json');
const testConstellationPath = path.join(__dirname, '../data/nightsky/constellations.lines.json');

describe('detectTrackFile', () => {
    let kmlParsed;
    let jsonParsed;
    let constellationParsed;

    beforeAll(() => {
        const kmlData = fs.readFileSync(testKMLPath, 'utf-8');
        kmlParsed = parseXml(kmlData);

        jsonParsed = JSON.parse(fs.readFileSync(testJSONPath, 'utf-8'));
        constellationParsed = JSON.parse(fs.readFileSync(testConstellationPath, 'utf-8'));
    });

    describe('registry iteration and class selection', () => {
        test('returns CTrackFileKML for KML data', () => {
            const result = detectTrackFile('test.kml', kmlParsed);
            expect(result).toBeInstanceOf(CTrackFileKML);
        });

        test('returns CTrackFileJSON for GeoJSON track data', () => {
            const result = detectTrackFile('test.json', jsonParsed);
            expect(result).toBeInstanceOf(CTrackFileJSON);
        });

        test('returns null for constellation lines JSON (MultiLineString)', () => {
            const result = detectTrackFile('constellations.lines.json', constellationParsed);
            expect(result).toBeNull();
        });

        test('returns null for empty object', () => {
            const result = detectTrackFile('test.json', {});
            expect(result).toBeNull();
        });

        test('returns null for null data', () => {
            const result = detectTrackFile('test.json', null);
            expect(result).toBeNull();
        });

        test('returns null for plain string', () => {
            const result = detectTrackFile('test.txt', 'just some text');
            expect(result).toBeNull();
        });

        test('returns null for array data', () => {
            const result = detectTrackFile('test.json', [1, 2, 3]);
            expect(result).toBeNull();
        });
    });

    describe('priority and order', () => {
        test('KML is checked before JSON for XML data with kml property', () => {
            const kmlData = {kml: {Document: {}}};
            const result = detectTrackFile('test.kml', kmlData);
            expect(result).toBeInstanceOf(CTrackFileKML);
        });

        test('STANAG XML data returns CTrackFileSTANAG', () => {
            const stanagData = {nitsRoot: {message: {track: {}}}};
            const result = detectTrackFile('test.xml', stanagData);
            expect(result).toBeInstanceOf(CTrackFileSTANAG);
        });
    });

    describe('GeoJSON rejection cases', () => {
        test('rejects FeatureCollection with MultiLineString geometry', () => {
            const multiLineData = {
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    geometry: {type: 'MultiLineString', coordinates: [[[0, 0], [1, 1]]]},
                    properties: {}
                }]
            };
            const result = detectTrackFile('test.json', multiLineData);
            expect(result).toBeNull();
        });

        test('rejects FeatureCollection with Polygon geometry', () => {
            const polygonData = {
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    geometry: {type: 'Polygon', coordinates: [[[0, 0], [1, 1], [0, 1], [0, 0]]]},
                    properties: {thresherId: 'test', dtg: '2012-09-19T18:28:01.000Z'}
                }]
            };
            const result = detectTrackFile('test.json', polygonData);
            expect(result).toBeNull();
        });

        test('rejects FeatureCollection without thresherId or dtg', () => {
            const noIdData = {
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    geometry: {type: 'Point', coordinates: [0, 0, 0]},
                    properties: {name: 'test'}
                }]
            };
            const result = detectTrackFile('test.json', noIdData);
            expect(result).toBeNull();
        });

        test('accepts FeatureCollection with Point and thresherId', () => {
            const validData = {
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    geometry: {type: 'Point', coordinates: [0, 0, 0]},
                    properties: {thresherId: 'test'}
                }]
            };
            const result = detectTrackFile('test.json', validData);
            expect(result).toBeInstanceOf(CTrackFileJSON);
        });
    });
});
