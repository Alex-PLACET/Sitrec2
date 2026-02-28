/**
 * @jest-environment jsdom
 */

jest.mock("../src/MISBUtils", () => {
    const MISB = {
        UnixTimeStamp: 2,
        SensorLatitude: 13,
        SensorLongitude: 14,
        SensorTrueAltitude: 15,
        TrackID: 59,
    };
    return {MISB, MISBFields: 121};
});

jest.mock("../src/Globals", () => ({
    GlobalDateTimeNode: {dateStart: new Date("2025-01-01T00:00:00.000Z")},
    Sit: {fps: 30},
}));

const {MISB} = require("../src/MISBUtils");
const {parseCustom1CSV} = require("../src/ParseCustom1CSV");
const {ecefToLLA} = require("../src/ParseFlightClubJSON");

const EARTH_RADIUS_M = 6378137.0;
const EARTH_MU = 3.986004418e14;
const EARTH_ROTATION_RATE = 7.292115e-5;

function buildCustom1CSVFromPath(points) {
    const rows = [["stageNumber", "time", "latitudeDegs", "longitudeDegs", "altitudeKm"]];
    for (const point of points) {
        rows.push([
            "2",
            String(point.t),
            String(point.latDeg),
            String(point.lonDeg),
            String(point.altMeters / 1000),
        ]);
    }
    return rows;
}

function buildCircularOrbitPath({
    sampleCount = 80,
    sampleStepSec = 1,
    altitudeM = 400000,
    startLonDeg = -80,
}) {
    const radius = EARTH_RADIUS_M + altitudeM;
    const inertialRate = Math.sqrt(EARTH_MU / (radius * radius * radius));
    const relativeRate = inertialRate - EARTH_ROTATION_RATE;
    const points = [];
    const startLonRad = (startLonDeg * Math.PI) / 180;

    for (let i = 0; i < sampleCount; i++) {
        const t = i * sampleStepSec + 0.01;
        const phase = startLonRad + relativeRate * t;
        const x = radius * Math.cos(phase);
        const y = radius * Math.sin(phase);
        const lla = ecefToLLA(x, y, 0);
        points.push({
            t,
            latDeg: lla.lat,
            lonDeg: lla.lon,
            altMeters: lla.alt,
        });
    }

    return {points, periodSec: 2 * Math.PI / inertialRate};
}

function buildAircraftPath({
    sampleCount = 80,
    sampleStepSec = 1,
    altitudeM = 12000,
    speedMps = 250,
    startLonDeg = -80,
}) {
    const radius = EARTH_RADIUS_M + altitudeM;
    const lonRate = speedMps / radius;
    const points = [];

    for (let i = 0; i < sampleCount; i++) {
        const t = i * sampleStepSec + 0.01;
        const lonDeg = startLonDeg + (lonRate * t * 180) / Math.PI;
        points.push({
            t,
            latDeg: 0,
            lonDeg,
            altMeters: altitudeM,
        });
    }
    return points;
}

describe("parseCustom1CSV orbital extension", () => {
    test("extends high-altitude orbital CUSTOM1 tracks by about two orbits", () => {
        const {points, periodSec} = buildCircularOrbitPath({});
        const csv = buildCustom1CSVFromPath(points);

        const parsed = parseCustom1CSV(csv);

        expect(parsed.length).toBeGreaterThan(points.length + 500);

        const lastOriginalTime = parsed[points.length - 1][MISB.UnixTimeStamp];
        const lastExtendedTime = parsed[parsed.length - 1][MISB.UnixTimeStamp];
        const extensionSec = (lastExtendedTime - lastOriginalTime) / 1000;

        expect(extensionSec).toBeGreaterThan(periodSec * 1.9);
        expect(extensionSec).toBeLessThan(periodSec * 2.1);
    });

    test("does not extend low-altitude non-orbital CUSTOM1 tracks", () => {
        const points = buildAircraftPath({});
        const csv = buildCustom1CSVFromPath(points);

        const parsed = parseCustom1CSV(csv);
        expect(parsed.length).toBe(points.length);
    });
});
