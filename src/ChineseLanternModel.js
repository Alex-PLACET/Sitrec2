// Chinese Lantern physics model for LOS trajectory fitting.
// Passive object: buoyancy decays as hot air cools, quadratic drag, wind-driven horizontal drift.
//
// Parameters solved by optimizer:
//   0: initialRange     — distance along first LOS ray (meters)
//   1: initialVUp       — initial vertical velocity (m/s, positive = up)
//   2: buoyancyAccel    — initial buoyancy acceleration B0/m (m/s², ~1-5)
//   3: coolingTau        — buoyancy decay time constant (seconds, ~30-300)
//   4: dragCoeff         — drag deceleration factor 0.5*rho*Cd*A/m (1/m, ~0.01-0.5)
//   5: windE             — east wind component at reference altitude (m/s)
//   6: windN             — north wind component at reference altitude (m/s)
//   7: windShear         — wind speed multiplier per meter of altitude (1/m, ~0.0001-0.005)

import {PhysicsModel} from "./PhysicsModel";

const G = 9.81; // gravity m/s²
const KTS_TO_MS = 0.514444;

export class ChineseLanternModel extends PhysicsModel {

    getName() {
        return "Chinese Lantern";
    }

    getParameterDefs() {
        // name, min, max, default, scale (initial simplex perturbation)
        return [
            {name: "initialRange",  min: 100,   max: 20000, default: 3000,  scale: 500},
            {name: "initialVUp",    min: -5,    max: 10,    default: 1.0,   scale: 0.5},
            {name: "buoyancyAccel", min: 0,     max: 20,    default: 10.5,  scale: 1.0},
            {name: "coolingTau",    min: 5,     max: 600,   default: 100,   scale: 20},
            {name: "dragCoeff",     min: 0.001, max: 2.0,   default: 0.1,   scale: 0.02},
            {name: "windE",         min: -30,   max: 30,    default: 18 * KTS_TO_MS * Math.cos(Math.PI * 70 / 180), scale: 1.0},
            {name: "windN",         min: -30,   max: 30,    default: 18 * KTS_TO_MS * Math.sin(Math.PI * 70 / 180), scale: 1.0},
            {name: "windShear",     min: -0.01, max: 0.01,  default: 0.001, scale: 0.0005},
        ];
    }

    // Initial state: position along first LOS ray, with initial vertical velocity
    getInitialState(params, dataset) {
        const range = params[0];
        const vUp = params[1];

        // Position = sensor + range * losDir at frame 0
        const sx = dataset.sensorPos[0], sy = dataset.sensorPos[1], sz = dataset.sensorPos[2];
        const dx = dataset.losDir[0], dy = dataset.losDir[1], dz = dataset.losDir[2];

        const x = sx + range * dx;
        const y = sy + range * dy;
        const z = sz + range * dz;

        // Initial horizontal velocity = wind at initial altitude
        // In ENU: x=East, y=North, z=Up
        const windE = params[5];
        const windN = params[6];
        const shear = params[7];
        const windScale = 1 + shear * z; // z is altitude in ENU
        const vx = windE * windScale;
        const vy = windN * windScale;
        const vz = vUp;

        return [x, y, z, vx, vy, vz];
    }

    // ODE: derivatives of [x,y,z, vx,vy,vz]
    derivatives(state, params, t) {
        const [x, y, z, vx, vy, vz] = state;
        const buoyancyAccel = params[2];
        const tau = params[3];
        const dragCoeff = params[4];
        const windE = params[5];
        const windN = params[6];
        const shear = params[7];

        // Wind at current altitude (stronger higher up)
        const windScale = 1 + shear * Math.max(z, 0);
        const wE = windE * windScale;
        const wN = windN * windScale;

        // Buoyancy decays exponentially as hot air cools
        const buoyancy = buoyancyAccel * Math.exp(-t / tau);

        // Relative velocity to air (for drag)
        const relVx = vx - wE;
        const relVy = vy - wN;
        const relVz = vz;  // no vertical wind

        // Quadratic drag: F/m = -dragCoeff * |v_rel| * v_rel (component-wise)
        const relSpeed = Math.sqrt(relVx * relVx + relVy * relVy + relVz * relVz);
        const dragFactor = dragCoeff * relSpeed;

        const ax = -dragFactor * relVx;
        const ay = -dragFactor * relVy;
        const az = buoyancy - G - dragFactor * relVz;

        return [vx, vy, vz, ax, ay, az];
    }
}
