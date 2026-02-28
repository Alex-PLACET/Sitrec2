jest.mock("../src/MISBUtils", () => {
    const MISB = {
        UnixTimeStamp: 0,
        SensorLatitude: 1,
        SensorLongitude: 2,
        SensorTrueAltitude: 3,
    };
    return {MISB, MISBFields: 100};
});

const {flightClubToCSVStrings} = require("../src/ParseFlightClubJSON");

const EARTH_RADIUS_M = 6378137.0;
const EARTH_MU = 3.986004418e14;
const EARTH_ROTATION_RATE = 7.292115e-5;

function buildFlightClubPayload(telemetry) {
    return [
        {
            mission: {
                initialConditions: {
                    launchpad: {
                        launchDateTime: "2025-01-01T00:00:00.000Z",
                        launchpad: {
                            latitude: 0,
                            longitude: 0,
                        },
                    },
                },
            },
            data: {
                stageTrajectories: [
                    {
                        stageNumber: 2,
                        telemetry,
                    },
                ],
            },
        },
    ];
}

function parseCsvPointCount(csvString) {
    const lines = csvString.trim().split("\n");
    return lines.length - 1;
}

function parseCsvLastTimestamp(csvString) {
    const lines = csvString.trim().split("\n");
    const last = lines[lines.length - 1];
    const [timestamp] = last.split(",");
    return new Date(timestamp).getTime();
}

function buildCircularOrbitTelemetry({
    sampleCount = 6,
    sampleStepSec = 60,
    altitudeM = 400000,
}) {
    const radius = EARTH_RADIUS_M + altitudeM;
    const inertialRate = Math.sqrt(EARTH_MU / (radius * radius * radius));
    const relativeRate = inertialRate - EARTH_ROTATION_RATE;
    const telemetry = [];

    for (let i = 0; i < sampleCount; i++) {
        const t = i * sampleStepSec;
        const phase = relativeRate * t;
        const x = radius * Math.cos(phase);
        const y = radius * Math.sin(phase);
        const vx = -radius * relativeRate * Math.sin(phase);
        const vy = radius * relativeRate * Math.cos(phase);
        telemetry.push({
            t,
            x_NI: [x, y, 0],
            v_NI: [vx, vy, 0],
        });
    }

    const periodSec = 2 * Math.PI / inertialRate;
    return {telemetry, periodSec};
}

function buildLowEnergyTelemetry({
    sampleCount = 4,
    sampleStepSec = 60,
    altitudeM = 100000,
    speedMps = 1500,
}) {
    const radius = EARTH_RADIUS_M + altitudeM;
    const relativeRate = speedMps / radius;
    const telemetry = [];

    for (let i = 0; i < sampleCount; i++) {
        const t = i * sampleStepSec;
        const phase = relativeRate * t;
        const x = radius * Math.cos(phase);
        const y = radius * Math.sin(phase);
        const vx = -radius * relativeRate * Math.sin(phase);
        const vy = radius * relativeRate * Math.cos(phase);
        telemetry.push({
            t,
            x_NI: [x, y, 0],
            v_NI: [vx, vy, 0],
        });
    }

    return telemetry;
}

describe("flightClubToCSVStrings orbital extension", () => {
    test("extends orbital trajectory by about two additional orbits", () => {
        const {telemetry, periodSec} = buildCircularOrbitTelemetry({});
        const json = buildFlightClubPayload(telemetry);

        const results = flightClubToCSVStrings(json);
        const csv = results[0].csvString;

        const pointCount = parseCsvPointCount(csv);
        expect(pointCount).toBeGreaterThan(telemetry.length + 500);

        const launchMs = new Date("2025-01-01T00:00:00.000Z").getTime();
        const lastOriginalMs = launchMs + telemetry[telemetry.length - 1].t * 1000;
        const lastExtendedMs = parseCsvLastTimestamp(csv);
        const extensionSec = (lastExtendedMs - lastOriginalMs) / 1000;

        expect(extensionSec).toBeGreaterThan(periodSec * 1.95);
        expect(extensionSec).toBeLessThan(periodSec * 2.05);
    });

    test("does not extend clearly non-orbital trajectories", () => {
        const telemetry = buildLowEnergyTelemetry({});
        const json = buildFlightClubPayload(telemetry);

        const results = flightClubToCSVStrings(json);
        const csv = results[0].csvString;

        const pointCount = parseCsvPointCount(csv);
        expect(pointCount).toBe(telemetry.length);
    });
});
