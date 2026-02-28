import {MISB, MISBFields} from "./MISBUtils";

const WGS84_A = 6378137.0;
const WGS84_F = 1 / 298.257223563;
const WGS84_B = WGS84_A * (1 - WGS84_F);
const WGS84_E2 = (WGS84_A * WGS84_A - WGS84_B * WGS84_B) / (WGS84_A * WGS84_A);
const EARTH_MU = 3.986004418e14;
const EARTH_J2 = 1.08262668e-3;
const EARTH_ROTATION_RATE = 7.292115e-5;

const DEFAULT_ORBIT_EXTENSION_COUNT = 2;
const MIN_ORBITAL_ALTITUDE_M = 80000;
const MIN_PERIGEE_ALTITUDE_M = 80000;
const MIN_ORBITAL_PERIOD_SECONDS = 20 * 60;
const MAX_ORBITAL_PERIOD_SECONDS = 48 * 60 * 60;
const MIN_PROPAGATION_STEP_SECONDS = 1;
const MAX_PROPAGATION_STEP_SECONDS = 5;
const MAX_PROPAGATION_STEPS = 12000;

export function ecefToLLA(x, y, z) {
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

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function toVector3(value) {
    if (!Array.isArray(value) || value.length < 3) {
        return null;
    }
    const x = Number(value[0]);
    const y = Number(value[1]);
    const z = Number(value[2]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        return null;
    }
    return [x, y, z];
}

function isFiniteVector3(value) {
    return toVector3(value) !== null;
}

function addVectors(a, b) {
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subtractVectors(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scaleVector(v, s) {
    return [v[0] * s, v[1] * s, v[2] * s];
}

function dotVector(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function crossVector(a, b) {
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ];
}

function vectorNorm(v) {
    return Math.sqrt(dotVector(v, v));
}

function median(values) {
    if (!values.length) {
        return null;
    }
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
        return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
}

function toInertialVelocity(velocityECEF, positionECEF) {
    const [x, y] = positionECEF;
    const [vx, vy, vz] = velocityECEF;
    const omegaCrossR = [-EARTH_ROTATION_RATE * y, EARTH_ROTATION_RATE * x, 0];
    return [vx + omegaCrossR[0], vy + omegaCrossR[1], vz + omegaCrossR[2]];
}

function estimateTerminalState(telemetry) {
    if (!Array.isArray(telemetry) || telemetry.length < 2) {
        return null;
    }

    const validIndices = [];
    for (let i = 0; i < telemetry.length; i++) {
        const point = telemetry[i];
        if (!point || !Number.isFinite(Number(point.t))) {
            continue;
        }
        if (!isFiniteVector3(point.x_NI)) {
            continue;
        }
        validIndices.push(i);
    }

    if (validIndices.length < 2) {
        return null;
    }

    const lastIdx = validIndices[validIndices.length - 1];
    const lastPoint = telemetry[lastIdx];
    const position = toVector3(lastPoint.x_NI);
    if (!position) {
        return null;
    }

    const intervals = [];
    for (let i = 1; i < validIndices.length; i++) {
        const prevPoint = telemetry[validIndices[i - 1]];
        const point = telemetry[validIndices[i]];
        const dt = Number(point.t) - Number(prevPoint.t);
        if (Number.isFinite(dt) && dt > 0) {
            intervals.push(dt);
        }
    }

    let velocity = toVector3(lastPoint.v_NI);
    if (!velocity) {
        let weightedVelocity = [0, 0, 0];
        let totalWeight = 0;
        const firstSegment = Math.max(1, validIndices.length - 6);
        for (let i = firstSegment; i < validIndices.length; i++) {
            const prevPoint = telemetry[validIndices[i - 1]];
            const point = telemetry[validIndices[i]];
            const prevPosition = toVector3(prevPoint.x_NI);
            const currentPosition = toVector3(point.x_NI);
            const dt = Number(point.t) - Number(prevPoint.t);
            if (!prevPosition || !currentPosition || !Number.isFinite(dt) || dt <= 0) {
                continue;
            }
            const segmentVelocity = scaleVector(subtractVectors(currentPosition, prevPosition), 1 / dt);
            weightedVelocity = addVectors(weightedVelocity, scaleVector(segmentVelocity, dt));
            totalWeight += dt;
        }
        if (totalWeight <= 0) {
            return null;
        }
        velocity = scaleVector(weightedVelocity, 1 / totalWeight);
    }

    const sampleStepSec = median(intervals);
    return {
        timeSec: Number(lastPoint.t),
        position,
        velocity,
        sampleStepSec: Number.isFinite(sampleStepSec) ? sampleStepSec : MIN_PROPAGATION_STEP_SECONDS,
    };
}

function estimateOrbit(terminalState) {
    const r = terminalState.position;
    const vInertial = toInertialVelocity(terminalState.velocity, terminalState.position);

    const rMag = vectorNorm(r);
    if (!Number.isFinite(rMag) || rMag <= 0) {
        return null;
    }

    const v2 = dotVector(vInertial, vInertial);
    const specificEnergy = 0.5 * v2 - EARTH_MU / rMag;
    if (!Number.isFinite(specificEnergy) || specificEnergy >= 0) {
        return null;
    }

    const semiMajorAxis = -EARTH_MU / (2 * specificEnergy);
    if (!Number.isFinite(semiMajorAxis) || semiMajorAxis <= 0) {
        return null;
    }

    const h = crossVector(r, vInertial);
    const hMag = vectorNorm(h);
    if (!Number.isFinite(hMag) || hMag <= 0) {
        return null;
    }

    const eVector = subtractVectors(
        scaleVector(crossVector(vInertial, h), 1 / EARTH_MU),
        scaleVector(r, 1 / rMag),
    );
    const eccentricity = vectorNorm(eVector);
    if (!Number.isFinite(eccentricity) || eccentricity >= 1) {
        return null;
    }

    const perigeeRadius = semiMajorAxis * (1 - eccentricity);
    const periodSec = 2 * Math.PI * Math.sqrt((semiMajorAxis * semiMajorAxis * semiMajorAxis) / EARTH_MU);
    if (!Number.isFinite(periodSec)) {
        return null;
    }

    return {periodSec, perigeeRadius};
}

function canExtendOrbit(terminalState, orbit) {
    const currentAltitude = vectorNorm(terminalState.position) - WGS84_A;
    if (!Number.isFinite(currentAltitude) || currentAltitude < MIN_ORBITAL_ALTITUDE_M) {
        return false;
    }
    if (orbit.perigeeRadius < WGS84_A + MIN_PERIGEE_ALTITUDE_M) {
        return false;
    }
    if (orbit.periodSec < MIN_ORBITAL_PERIOD_SECONDS || orbit.periodSec > MAX_ORBITAL_PERIOD_SECONDS) {
        return false;
    }
    return true;
}

function accelerationECEF(position, velocity) {
    const [x, y, z] = position;
    const [vx, vy] = velocity;
    const r2 = x * x + y * y + z * z;
    if (r2 <= 0) {
        return [0, 0, 0];
    }

    const r = Math.sqrt(r2);
    const r3 = r2 * r;
    const r5 = r3 * r2;

    let ax = -EARTH_MU * x / r3;
    let ay = -EARTH_MU * y / r3;
    let az = -EARTH_MU * z / r3;

    // Include J2 to keep long-arc propagation realistic for LEO launches.
    const z2 = z * z;
    const j2Factor = 1.5 * EARTH_J2 * EARTH_MU * WGS84_A * WGS84_A / r5;
    const zRatio = 5 * z2 / r2;
    ax += j2Factor * x * (zRatio - 1);
    ay += j2Factor * y * (zRatio - 1);
    az += j2Factor * z * (zRatio - 3);

    const omega2 = EARTH_ROTATION_RATE * EARTH_ROTATION_RATE;
    ax += 2 * EARTH_ROTATION_RATE * vy + omega2 * x;
    ay += -2 * EARTH_ROTATION_RATE * vx + omega2 * y;

    return [ax, ay, az];
}

function stateDerivative(state) {
    return {
        position: state.velocity,
        velocity: accelerationECEF(state.position, state.velocity),
    };
}

function advanceState(state, derivative, dt) {
    return {
        position: addVectors(state.position, scaleVector(derivative.position, dt)),
        velocity: addVectors(state.velocity, scaleVector(derivative.velocity, dt)),
    };
}

function rk4Step(state, dt) {
    const k1 = stateDerivative(state);
    const k2 = stateDerivative(advanceState(state, k1, dt * 0.5));
    const k3 = stateDerivative(advanceState(state, k2, dt * 0.5));
    const k4 = stateDerivative(advanceState(state, k3, dt));

    const position = addVectors(
        state.position,
        scaleVector(
            addVectors(
                addVectors(k1.position, scaleVector(addVectors(k2.position, k3.position), 2)),
                k4.position,
            ),
            dt / 6,
        ),
    );
    const velocity = addVectors(
        state.velocity,
        scaleVector(
            addVectors(
                addVectors(k1.velocity, scaleVector(addVectors(k2.velocity, k3.velocity), 2)),
                k4.velocity,
            ),
            dt / 6,
        ),
    );
    return {position, velocity};
}

export function extendECEFTelemetryWithOrbit(telemetry, orbitCount = DEFAULT_ORBIT_EXTENSION_COUNT) {
    if (!Array.isArray(telemetry) || telemetry.length < 2 || orbitCount <= 0) {
        return telemetry;
    }

    const terminalState = estimateTerminalState(telemetry);
    if (!terminalState) {
        return telemetry;
    }

    const orbit = estimateOrbit(terminalState);
    if (!orbit) {
        return telemetry;
    }
    if (!canExtendOrbit(terminalState, orbit)) {
        return telemetry;
    }

    const totalDurationSec = orbit.periodSec * orbitCount;
    if (!Number.isFinite(totalDurationSec) || totalDurationSec <= 0) {
        return telemetry;
    }

    let stepSec = clamp(
        terminalState.sampleStepSec,
        MIN_PROPAGATION_STEP_SECONDS,
        MAX_PROPAGATION_STEP_SECONDS,
    );
    const minStepForMaxPoints = totalDurationSec / MAX_PROPAGATION_STEPS;
    if (Number.isFinite(minStepForMaxPoints) && minStepForMaxPoints > stepSec) {
        stepSec = minStepForMaxPoints;
    }

    const extendedTelemetry = telemetry.slice();
    let state = {
        position: terminalState.position.slice(),
        velocity: terminalState.velocity.slice(),
    };

    let elapsedSec = 0;
    while (elapsedSec + 1e-9 < totalDurationSec) {
        const dt = Math.min(stepSec, totalDurationSec - elapsedSec);
        state = rk4Step(state, dt);
        elapsedSec += dt;

        if (!isFiniteVector3(state.position) || !isFiniteVector3(state.velocity)) {
            break;
        }
        if (vectorNorm(state.position) < WGS84_A + 20000) {
            break;
        }

        extendedTelemetry.push({
            t: terminalState.timeSec + elapsedSec,
            x_NI: state.position.slice(),
            v_NI: state.velocity.slice(),
        });
    }

    return extendedTelemetry;
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
        const telemetry = extendECEFTelemetryWithOrbit(stage.telemetry, DEFAULT_ORBIT_EXTENSION_COUNT);
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
        const telemetry = extendECEFTelemetryWithOrbit(stage.telemetry, DEFAULT_ORBIT_EXTENSION_COUNT);
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
