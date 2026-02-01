import {MISB, MISBFields} from "./MISBUtils";

const WGS84_A = 6378137.0;
const WGS84_F = 1 / 298.257223563;
const WGS84_B = WGS84_A * (1 - WGS84_F);
const WGS84_E2 = (WGS84_A * WGS84_A - WGS84_B * WGS84_B) / (WGS84_A * WGS84_A);

function ecefToLLA(x, y, z) {
    const p = Math.sqrt(x * x + y * y);
    const lon = Math.atan2(y, x) * 180 / Math.PI;

    let lat = Math.atan2(z, p * (1 - WGS84_E2));
    for (let i = 0; i < 10; i++) {
        const sinLat = Math.sin(lat);
        const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
        lat = Math.atan2(z + WGS84_E2 * N * sinLat, p);
    }

    const sinLat = Math.sin(lat);
    const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
    const alt = p / Math.cos(lat) - N;

    return {lat: lat * 180 / Math.PI, lon, alt};
}

export function isFlightClubJSON(jsonData) {
    if (!Array.isArray(jsonData) || jsonData.length === 0) return false;
    const first = jsonData[0];
    return first.mission !== undefined
        && first.data !== undefined
        && first.data.stageTrajectories !== undefined
        && first.mission.initialConditions !== undefined
        && first.mission.initialConditions.launchpad !== undefined;
}

export function extractFlightClubInfo(jsonData) {
    const first = jsonData[0];
    const mission = first.mission;
    const launchpad = mission.initialConditions.launchpad.launchpad;
    const vehicle = mission.vehicle;
    const stageTrajectories = first.data.stageTrajectories;

    const lines = [];
    lines.push("=== FlightClub Simulation ===");
    lines.push("");

    if (mission.description) {
        lines.push(`Mission: ${mission.description.trim()}`);
    }
    if (mission.startDateTime) {
        lines.push(`Start: ${mission.startDateTime}`);
    }
    if (mission.company?.description) {
        lines.push(`Company: ${mission.company.description}`);
    }

    lines.push("");
    lines.push("--- Launchpad ---");
    if (launchpad) {
        if (launchpad.description) lines.push(`Site: ${launchpad.description}`);
        lines.push(`Location: ${launchpad.latitude}, ${launchpad.longitude}`);
        if (launchpad.elevation) lines.push(`Elevation: ${launchpad.elevation.toFixed(1)} m`);
        if (launchpad.azimuth) lines.push(`Azimuth: ${launchpad.azimuth}`);
    }

    if (vehicle) {
        lines.push("");
        lines.push("--- Vehicle ---");
        if (vehicle.description) lines.push(`Type: ${vehicle.description}`);
        if (vehicle.cores) {
            vehicle.cores.forEach((core, idx) => {
                if (core.displayName) {
                    lines.push(`  ${core.displayName}: ${core.spec?.modelName || 'Unknown'}`);
                }
            });
        }
    }

    lines.push("");
    lines.push("--- Stage Trajectories ---");
    stageTrajectories.forEach((stage) => {
        const name = getStageName(jsonData, stage.stageNumber);
        lines.push(`  ${name}: ${stage.telemetry.length} points`);
    });

    return lines.join("\n");
}

function getStageName(jsonData, stageNumber) {
    const mission = jsonData[0].mission;
    const vehicle = mission.vehicle;
    if (vehicle && vehicle.cores) {
        const core = vehicle.cores.find(c => c.stageNumber === stageNumber);
        if (core && core.displayName) {
            return core.displayName;
        }
    }
    return `Stage ${stageNumber}`;
}

export function parseFlightClubJSON(jsonData) {
    const first = jsonData[0];
    const launchDateTime = new Date(first.mission.initialConditions.launchpad.launchDateTime);
    const stageTrajectories = first.data.stageTrajectories;

    const results = [];

    stageTrajectories.forEach((stage) => {
        const telemetry = stage.telemetry;
        const stageName = getStageName(jsonData, stage.stageNumber);
        const MISBArray = new Array(telemetry.length);

        for (let i = 0; i < telemetry.length; i++) {
            const point = telemetry[i];
            const t = point.t;
            const timeMs = launchDateTime.getTime() + t * 1000;

            const [x, y, z] = point.x_NI;
            const lla = ecefToLLA(x, y, z);

            MISBArray[i] = new Array(MISBFields).fill(null);
            MISBArray[i][MISB.UnixTimeStamp] = timeMs;
            MISBArray[i][MISB.SensorLatitude] = lla.lat;
            MISBArray[i][MISB.SensorLongitude] = lla.lon;
            MISBArray[i][MISB.SensorTrueAltitude] = lla.alt;
        }

        results.push({
            stageName: stageName,
            stageNumber: stage.stageNumber,
            misbData: MISBArray
        });
    });

    return results;
}

export function flightClubToCSVStrings(jsonData) {
    const first = jsonData[0];
    const launchDateTime = new Date(first.mission.initialConditions.launchpad.launchDateTime);
    const stageTrajectories = first.data.stageTrajectories;

    const results = [];

    stageTrajectories.forEach((stage) => {
        const telemetry = stage.telemetry;
        const stageName = getStageName(jsonData, stage.stageNumber);

        let csv = "time,lat,lon,alt\n";

        for (const point of telemetry) {
            const t = point.t;
            const timeMs = launchDateTime.getTime() + t * 1000;
            const timeISO = new Date(timeMs).toISOString();

            const [x, y, z] = point.x_NI;
            const lla = ecefToLLA(x, y, z);

            csv += `${timeISO},${lla.lat},${lla.lon},${lla.alt}\n`;
        }

        results.push({
            stageName: stageName,
            stageNumber: stage.stageNumber,
            csvString: csv
        });
    });

    return results;
}
