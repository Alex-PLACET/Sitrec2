// CNodeFloodSim.js - Flood simulator using Position Based Fluids (PBF)
//
// Based on Macklin & Müller 2013 "Position Based Fluids".
// Particles satisfy a density constraint through iterative position correction,
// producing stable, incompressible fluid behavior on terrain.
//
// Air/Ground states:
//   AIR:    freefall under gravity, no slope forces
//   GROUND: slope acceleration + terrain clamping (PBF handles fluid pressure)

import {CNode3DGroup} from "./CNode3DGroup";
import {Color, DynamicDrawUsage, InstancedMesh, Matrix4, MeshPhongMaterial, SphereGeometry} from "three";
import {ECEFToLLAVD_radii, LLAToECEF} from "../LLA-ECEF-ENU";
import {getLocalEastVector, getLocalNorthVector, getLocalUpVector} from "../SphericalMath";
import {guiPhysics, NodeMan, setRenderOne, Sit} from "../Globals";
import {EventManager} from "../CEventManager";
import {meanSeaLevelOffset} from "../EGM96Geoid";
import * as LAYER from "../LayerMasks";

const GRAVITY = 9.81;
const DEFAULT_MAX_PARTICLES = 50000;

// ── PBF Kernel functions (precomputed coefficients set per-step) ─────────
// Poly6: used for density estimation (takes r², avoids sqrt)
// W(r,h) = 315/(64πh⁹) · (h²-r²)³  for r < h
// Spiky gradient: used for constraint gradient (nonzero at r=0)
// ∇W(r,h) = -45/(πh⁶) · (h-r)² · r̂

export class CNodeFloodSim extends CNode3DGroup {
    constructor(v) {
        v.layers ??= LAYER.MASK_WORLD;
        super(v);

        this.input("track", true);

        // GUI-controlled parameters
        this.floodEnabled = false;
        this.floodRate = v.floodRate ?? 50;
        this.sphereSize = v.sphereSize ?? 1.0;
        this.dropRadius = v.dropRadius ?? 10;
        this.waterColor = v.waterColor ?? "#4488cc";
        this.maxParticles = v.maxParticles ?? DEFAULT_MAX_PARTICLES;
        this.method = v.method ?? "Fast"; // "Fast" (ad-hoc pressure) or "PBF" (Position Based Fluids)
        this.addSimpleSerials(["floodEnabled", "floodRate", "sphereSize", "dropRadius", "waterColor", "maxParticles", "method"]);

        // Particle buffers
        this.count = 0;
        this.aliveCount = 0;
        this.freeStack = [];
        this.allocateBuffers(this.maxParticles);

        // Local coordinate origin
        this.originSet = false;
        this.originLat = 0;
        this.originLon = 0;
        this.originAlt = 0;
        this.originECEF = null;
        this.eastVec = null;
        this.northVec = null;
        this.upVec = null;
        this.metersPerDegLat = 111320;
        this.metersPerDegLon = 111320;

        // Elevation grid
        this.elevGridRes = 500;
        this.elevGridSpacing = 2;
        this.elevGridHalf = 500 * 2 / 2;
        this.elevGrid = null;
        this.gradX = null;
        this.gradY = null;
        this._sr = { elev: 0, gx: 0, gy: 0 };

        // Spatial hash buffers
        this._pCell = null;
        this._cellCount = null;
        this._cellStart = null;
        this._sortedIdx = null;

        this._mat4 = new Matrix4();

        // Tile reload
        this._rebuildTimer = null;
        EventManager.addEventListener("tileChanged", () => {
            if (!this.originSet) return;
            if (this._rebuildTimer) clearTimeout(this._rebuildTimer);
            this._rebuildTimer = setTimeout(() => {
                this.buildElevationGrid();
                this._rebuildTimer = null;
            }, 500);
        });

        // Self-drive physics when paused (ignores pause state)
        this._lastUpdateTime = 0;
        this._renderInterval = setInterval(() => {
            if (!this.floodEnabled && this.aliveCount === 0) return;
            // Only self-drive if the render loop hasn't called update recently
            const now = performance.now();
            if (now - this._lastUpdateTime > 50) {
                this.runFloodStep(par.frame);
            }
            setRenderOne(true);
        }, 16);

        this.setupMesh();
        this.setupGUI();
    }

    // ── Buffer allocation ────────────────────────────────────────────────

    allocateBuffers(n) {
        this.px = new Float32Array(n);
        this.py = new Float32Array(n);
        this.pz = new Float32Array(n);
        this.vx = new Float32Array(n);
        this.vy = new Float32Array(n);
        this.vz = new Float32Array(n);
        this.alive = new Uint8Array(n);
        this.onGround = new Uint8Array(n);
        // PBF predicted positions
        this.predX = new Float32Array(n);
        this.predY = new Float32Array(n);
        this.predZ = new Float32Array(n);
        // PBF per-particle values
        this.density = new Float32Array(n);
        this.lambda = new Float32Array(n);
        // Accumulator (reused for gradient sum, then delta position)
        this.accX = new Float32Array(n);
        this.accY = new Float32Array(n);
        this.accZ = new Float32Array(n);
        this.accW = new Float32Array(n); // scalar accumulator (sqGradSum)
    }

    resizeBuffers(newMax) {
        if (newMax === this.maxParticles) return;
        const copy = Math.min(this.count, newMax);
        const fields = ['px','py','pz','vx','vy','vz','predX','predY','predZ','density','lambda','accX','accY','accZ','accW'];
        const byteFields = ['alive','onGround'];
        const newBufs = {};
        for (const f of fields) {
            newBufs[f] = new Float32Array(newMax);
            newBufs[f].set(this[f].subarray(0, copy));
        }
        for (const f of byteFields) {
            newBufs[f] = new Uint8Array(newMax);
            newBufs[f].set(this[f].subarray(0, copy));
        }
        for (const f of [...fields, ...byteFields]) this[f] = newBufs[f];

        this.maxParticles = newMax;
        if (this.count > newMax) this.count = newMax;
        this.freeStack = this.freeStack.filter(i => i < newMax);

        if (this.instancedMesh) {
            this.group.remove(this.instancedMesh);
            this.instancedMesh.geometry.dispose();
            this.instancedMesh.material.dispose();
        }
        this.setupMesh();
    }

    // ── Rendering ────────────────────────────────────────────────────────

    setupMesh() {
        const geo = new SphereGeometry(0.5, 6, 4);
        const mat = new MeshPhongMaterial({
            color: new Color(this.waterColor),
            transparent: true,
            opacity: 0.8,
        });
        this.instancedMesh = new InstancedMesh(geo, mat, this.maxParticles);
        this.instancedMesh.instanceMatrix.setUsage(DynamicDrawUsage);
        this.instancedMesh.count = 0;
        this.instancedMesh.frustumCulled = false;
        this.group.add(this.instancedMesh);
    }

    // ── GUI ──────────────────────────────────────────────────────────────

    setupGUI() {
        if (!guiPhysics) return;
        this.guiFolder = guiPhysics.addFolder("Flood Sim");
        this.guiFolder.add(this, "floodEnabled").name("Flood").listen()
            .onChange(() => setRenderOne());
        this.guiFolder.add(this, "floodRate", 1, 500, 1).name("Flood Rate");
        this.guiFolder.add(this, "sphereSize", 0.05, 100.0, 0.05).name("Sphere Size");
        this.guiFolder.add(this, "dropRadius", 1, 10000, 1).name("Drop Radius");
        this.guiFolder.add(this, "maxParticles", 1000, 200000, 1000).name("Max Particles")
            .onChange(v => this.resizeBuffers(v));
        this.guiFolder.add(this, "method", ["Fast", "PBF"]).name("Method");
        this.guiFolder.addColor(this, "waterColor").name("Water Color")
            .onChange(() => {
                this.instancedMesh.material.color.set(this.waterColor);
                setRenderOne();
            });
        this.guiFolder.add(this, "resetFlood").name("Reset");
    }

    resetFlood() {
        this.count = 0;
        this.aliveCount = 0;
        this.alive.fill(0);
        this.onGround.fill(0);
        this.freeStack.length = 0;
        this.instancedMesh.count = 0;
        this.originSet = false;
        this.elevGrid = null;
        setRenderOne();
    }

    // ── Target / spawn ───────────────────────────────────────────────────

    getTargetECEF(f) {
        if (this.in.track) return this.in.track.p(f);
        for (const name of ["fixedTargetPositionWind", "fixedTargetPosition", "targetTrack"]) {
            if (NodeMan.exists(name)) return NodeMan.get(name).p(f);
        }
        return LLAToECEF(Sit.lat, Sit.lon, 0);
    }

    // ── Origin ───────────────────────────────────────────────────────────

    setupOrigin(ecef) {
        this.originECEF = ecef.clone();
        const lla = ECEFToLLAVD_radii(ecef);
        this.originLat = lla.x;
        this.originLon = lla.y;
        this.originAlt = lla.z;
        this.eastVec  = getLocalEastVector(ecef).clone();
        this.northVec = getLocalNorthVector(ecef).clone();
        this.upVec    = getLocalUpVector(ecef).clone();
        this.metersPerDegLat = 111320;
        this.metersPerDegLon = 111320 * Math.cos(this.originLat * Math.PI / 180);
        this.group.position.copy(ecef);
        this._seaLevel = meanSeaLevelOffset(this.originLat, this.originLon);
        this.buildElevationGrid();
        this.originSet = true;
    }

    // ── Elevation grid (unchanged) ───────────────────────────────────────

    localToLL(e, n) {
        return [
            this.originLat + n / this.metersPerDegLat,
            this.originLon + e / this.metersPerDegLon,
        ];
    }

    getElevationDirect(e, n) {
        const [lat, lon] = this.localToLL(e, n);
        if (NodeMan.exists("TerrainModel")) {
            const terrain = NodeMan.get("TerrainModel");
            if (terrain.elevationMap) {
                const elev = terrain.elevationMap.getElevationInterpolated(lat, lon);
                if (isFinite(elev)) return elev;
            }
        }
        return this.originAlt;
    }

    buildElevationGrid() {
        const res = this.elevGridRes, sp = this.elevGridSpacing, half = res / 2;
        this.elevGrid = new Float32Array(res * res);
        this.gradX = new Float32Array(res * res);
        this.gradY = new Float32Array(res * res);
        for (let j = 0; j < res; j++) {
            const n = (j - half) * sp;
            for (let i = 0; i < res; i++) {
                this.elevGrid[j * res + i] = this.getElevationDirect((i - half) * sp, n);
            }
        }
        const inv2sp = 1 / (2 * sp);
        for (let j = 1; j < res - 1; j++) for (let i = 1; i < res - 1; i++) {
            const idx = j * res + i;
            this.gradX[idx] = (this.elevGrid[idx + 1] - this.elevGrid[idx - 1]) * inv2sp;
            this.gradY[idx] = (this.elevGrid[(j+1)*res+i] - this.elevGrid[(j-1)*res+i]) * inv2sp;
        }
        for (let i = 0; i < res; i++) { this.gradY[i] = this.gradY[res+i]; this.gradY[(res-1)*res+i] = this.gradY[(res-2)*res+i]; }
        for (let j = 0; j < res; j++) { this.gradX[j*res] = this.gradX[j*res+1]; this.gradX[j*res+res-1] = this.gradX[j*res+res-2]; }
    }

    sampleGrid(e, n) {
        const res = this.elevGridRes, sp = this.elevGridSpacing, half = res / 2, r = this._sr;
        const gx = e / sp + half, gy = n / sp + half;
        if (gx < 1 || gx > res - 2 || gy < 1 || gy > res - 2) {
            const h = 2;
            r.elev = this.getElevationDirect(e, n);
            r.gx = (this.getElevationDirect(e+h, n) - this.getElevationDirect(e-h, n)) / (2*h);
            r.gy = (this.getElevationDirect(e, n+h) - this.getElevationDirect(e, n-h)) / (2*h);
            return r;
        }
        const ix = gx | 0, iy = gy | 0, fx = gx - ix, fy = gy - iy;
        const i00 = iy * res + ix, i10 = i00 + 1, i01 = i00 + res, i11 = i01 + 1;
        const w00 = (1-fx)*(1-fy), w10 = fx*(1-fy), w01 = (1-fx)*fy, w11 = fx*fy;
        const eg = this.elevGrid, gxA = this.gradX, gyA = this.gradY;
        r.elev = eg[i00]*w00 + eg[i10]*w10 + eg[i01]*w01 + eg[i11]*w11;
        r.gx = gxA[i00]*w00 + gxA[i10]*w10 + gxA[i01]*w01 + gxA[i11]*w11;
        r.gy = gyA[i00]*w00 + gyA[i10]*w10 + gyA[i01]*w01 + gyA[i11]*w11;
        return r;
    }

    // ── Particle allocation ──────────────────────────────────────────────

    allocParticle() {
        if (this.freeStack.length > 0) return this.freeStack.pop();
        if (this.count < this.maxParticles) return this.count++;
        return -1;
    }

    spawnParticle(spawnE, spawnN, spawnAlt) {
        const idx = this.allocParticle();
        if (idx < 0) return;
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.sqrt(Math.random()) * this.dropRadius;
        this.px[idx] = spawnE + Math.cos(angle) * dist;
        this.py[idx] = spawnN + Math.sin(angle) * dist;
        this.pz[idx] = spawnAlt;
        this.vx[idx] = 0; this.vy[idx] = 0; this.vz[idx] = 0;
        this.alive[idx] = 1;
        // Check if spawn altitude is near ground → start grounded
        const gndElev = this.sampleGrid(this.px[idx], this.py[idx]).elev;
        this.onGround[idx] = (spawnAlt <= gndElev + this.sphereSize * 2) ? 1 : 0;
        this.aliveCount++;
    }

    // ── Per-frame update ─────────────────────────────────────────────────

    update(f) {
        super.update(f);
        if (!this.floodEnabled && this.aliveCount === 0) return;
        this.runFloodStep(f);
    }

    /** Core flood logic — called by update() or self-drive interval */
    runFloodStep(f) {
        const targetECEF = this.getTargetECEF(f);
        if (!this.originSet) {
            if (!this.floodEnabled) return;
            this.setupOrigin(targetECEF);
        }

        // Spawn new particles
        if (this.floodEnabled) {
            const diff = targetECEF.clone().sub(this.originECEF);
            const spawnE = diff.dot(this.eastVec);
            const spawnN = diff.dot(this.northVec);
            // Spawn on the ground at the target's XY, not in the air
            const groundElev = this.sampleGrid(spawnE, spawnN).elev;
            const spawnAlt = groundElev + this.sphereSize;

            const room = this.maxParticles - this.count + this.freeStack.length;
            const toSpawn = Math.min(this.floodRate, room);
            for (let i = 0; i < toSpawn; i++) this.spawnParticle(spawnE, spawnN, spawnAlt);
        }

        // Dispatch to selected solver
        const dt = (Sit.simSpeed || 1) / (Sit.fps || 30);
        if (this.method === "PBF") {
            this.pbfStep(dt);
        } else {
            // Fast: 4 substeps with ad-hoc pressure
            const substeps = 4;
            const subDt = dt / substeps;
            for (let s = 0; s < substeps; s++) {
                this.fastPhysicsStep(subDt);
                this.fastResolveCollisions();
            }
        }
        this._lastUpdateTime = performance.now();

        this.updateInstances();
        setRenderOne();
    }

    // ── Fast Solver (ad-hoc pressure impulse) ───────────────────────────

    fastPhysicsStep(dt) {
        const _px = this.px, _py = this.py, _pz = this.pz;
        const _vx = this.vx, _vy = this.vy, _vz = this.vz;
        const _alive = this.alive, _ground = this.onGround;
        const n = this.count;
        const radius = this.sphereSize * 0.5;
        const airDrag = Math.pow(0.998, dt * 30);
        const groundFric = Math.pow(0.9995, dt * 30);
        const gdt = GRAVITY * dt;
        const seaKill = this._seaLevel + 2;

        for (let i = 0; i < n; i++) {
            if (!_alive[i]) continue;
            const { elev, gx, gy } = this.sampleGrid(_px[i], _py[i]);
            const groundLevel = elev + radius;

            if (_ground[i] && _pz[i] > groundLevel + 0.01) {
                _ground[i] = 0;
                if (_vz[i] <= 0) _vz[i] = 0;
            }

            if (_ground[i]) {
                const denom = 1 + gx * gx + gy * gy;
                _vx[i] = (_vx[i] + (-GRAVITY * gx / denom) * dt) * groundFric;
                _vy[i] = (_vy[i] + (-GRAVITY * gy / denom) * dt) * groundFric;
                _vz[i] = 0;
                _px[i] += _vx[i] * dt;
                _py[i] += _vy[i] * dt;
                const newElev = this.sampleGrid(_px[i], _py[i]).elev;
                _pz[i] = newElev + radius;
            } else {
                _vx[i] *= airDrag;
                _vy[i] *= airDrag;
                _vz[i] -= gdt;
                _px[i] += _vx[i] * dt;
                _py[i] += _vy[i] * dt;
                _pz[i] += _vz[i] * dt;
                if (_pz[i] <= groundLevel) {
                    _pz[i] = groundLevel;
                    _vz[i] = 0;
                    _ground[i] = 1;
                }
            }

            if (elev <= seaKill) {
                _alive[i] = 0;
                this.aliveCount--;
                this.freeStack.push(i);
            }
        }
    }

    fastResolveCollisions() {
        const px = this.px, py = this.py, pz = this.pz;
        const vx = this.vx, vy = this.vy, vz = this.vz;
        const alive = this.alive;
        const n = this.count;
        const diam = this.sphereSize;
        const diamSq = diam * diam;
        const cs = diam;
        const invCS = 1 / cs;
        const pressK = 2.0;
        const viscosity = 0.02;
        const maxSpeed = 50;
        const maxSpeedSq = maxSpeed * maxSpeed;

        let aliveN = 0;
        let minCX = 1e9, maxCX = -1e9, minCY = 1e9, maxCY = -1e9;
        for (let i = 0; i < n; i++) {
            if (!alive[i]) continue;
            aliveN++;
            const cx = Math.floor(px[i] * invCS);
            const cy = Math.floor(py[i] * invCS);
            if (cx < minCX) minCX = cx;
            if (cx > maxCX) maxCX = cx;
            if (cy < minCY) minCY = cy;
            if (cy > maxCY) maxCY = cy;
        }
        if (aliveN < 2) return;

        const gridW = maxCX - minCX + 3;
        const gridSize = gridW * (maxCY - minCY + 3);
        if (gridSize > 500000) return;

        if (!this._pCell || this._pCell.length < n) this._pCell = new Uint32Array(Math.max(n, 1024));
        if (!this._cellCount || this._cellCount.length < gridSize) this._cellCount = new Uint32Array(Math.max(gridSize, 1024));
        if (!this._cellStart || this._cellStart.length < gridSize + 1) this._cellStart = new Uint32Array(Math.max(gridSize + 1, 1025));
        if (!this._sortedIdx || this._sortedIdx.length < aliveN) this._sortedIdx = new Uint32Array(Math.max(aliveN * 2, 1024));

        const pCell = this._pCell, cellCount = this._cellCount;
        const cellStart = this._cellStart, sortedIdx = this._sortedIdx;
        cellCount.fill(0, 0, gridSize);
        const offCX = -minCX + 1, offCY = -minCY + 1;

        for (let i = 0; i < n; i++) {
            if (!alive[i]) continue;
            const ci = (Math.floor(py[i] * invCS) + offCY) * gridW + (Math.floor(px[i] * invCS) + offCX);
            pCell[i] = ci;
            cellCount[ci]++;
        }
        cellStart[0] = 0;
        for (let c = 0; c < gridSize; c++) cellStart[c + 1] = cellStart[c] + cellCount[c];
        for (let c = 0; c < gridSize; c++) cellCount[c] = cellStart[c];
        for (let i = 0; i < n; i++) {
            if (!alive[i]) continue;
            sortedIdx[cellCount[pCell[i]]++] = i;
        }
        for (let c = 0; c < gridSize; c++) cellCount[c] = cellStart[c + 1] - cellStart[c];

        const nbr0 = 1, nbr1 = gridW - 1, nbr2 = gridW, nbr3 = gridW + 1;

        for (let c = 0; c < gridSize; c++) {
            const cnt = cellCount[c];
            if (cnt === 0) continue;
            const cS = cellStart[c], cE = cS + cnt;

            // Within-cell pairs
            for (let a = cS; a < cE; a++) {
                const i = sortedIdx[a];
                for (let b = a + 1; b < cE; b++) {
                    const j = sortedIdx[b];
                    const ddx = px[j] - px[i], ddy = py[j] - py[i], ddz = pz[j] - pz[i];
                    const dSq = ddx * ddx + ddy * ddy + ddz * ddz;
                    if (dSq >= diamSq || dSq < 1e-10) continue;
                    const d = Math.sqrt(dSq), inv = 1 / d;
                    const overlap = diam - d;
                    const nx = ddx * inv, ny = ddy * inv, nz = ddz * inv;
                    const pp = overlap * 0.5;
                    px[i] -= nx * pp; py[i] -= ny * pp; pz[i] -= nz * pp;
                    px[j] += nx * pp; py[j] += ny * pp; pz[j] += nz * pp;
                    const pv = overlap * pressK;
                    vx[i] -= nx * pv; vy[i] -= ny * pv; vz[i] -= nz * pv;
                    vx[j] += nx * pv; vy[j] += ny * pv; vz[j] += nz * pv;
                    const dvx = (vx[j] - vx[i]) * viscosity, dvy = (vy[j] - vy[i]) * viscosity, dvz = (vz[j] - vz[i]) * viscosity;
                    vx[i] += dvx; vy[i] += dvy; vz[i] += dvz;
                    vx[j] -= dvx; vy[j] -= dvy; vz[j] -= dvz;
                }
            }

            // 4 forward-neighbor cells
            const neighbors = [c + nbr0, c + nbr1, c + nbr2, c + nbr3];
            for (let ni = 0; ni < 4; ni++) {
                const nc = neighbors[ni];
                if (nc >= gridSize || cellCount[nc] === 0) continue;
                const ns = cellStart[nc], ne = ns + cellCount[nc];
                for (let a = cS; a < cE; a++) {
                    const i = sortedIdx[a];
                    for (let b = ns; b < ne; b++) {
                        const j = sortedIdx[b];
                        const ddx = px[j] - px[i], ddy = py[j] - py[i], ddz = pz[j] - pz[i];
                        const dSq = ddx * ddx + ddy * ddy + ddz * ddz;
                        if (dSq >= diamSq || dSq < 1e-10) continue;
                        const d = Math.sqrt(dSq), inv = 1 / d;
                        const overlap = diam - d;
                        const nx = ddx * inv, ny = ddy * inv, nz = ddz * inv;
                        const pp = overlap * 0.5;
                        px[i] -= nx * pp; py[i] -= ny * pp; pz[i] -= nz * pp;
                        px[j] += nx * pp; py[j] += ny * pp; pz[j] += nz * pp;
                        const pv = overlap * pressK;
                        vx[i] -= nx * pv; vy[i] -= ny * pv; vz[i] -= nz * pv;
                        vx[j] += nx * pv; vy[j] += ny * pv; vz[j] += nz * pv;
                        const dvx = (vx[j] - vx[i]) * viscosity, dvy = (vy[j] - vy[i]) * viscosity, dvz = (vz[j] - vz[i]) * viscosity;
                        vx[i] += dvx; vy[i] += dvy; vz[i] += dvz;
                        vx[j] -= dvx; vy[j] -= dvy; vz[j] -= dvz;
                    }
                }
            }
        }

        // Clamp velocities
        for (let i = 0; i < n; i++) {
            if (!alive[i]) continue;
            const sSq = vx[i] * vx[i] + vy[i] * vy[i] + vz[i] * vz[i];
            if (sSq > maxSpeedSq) {
                const s = maxSpeed / Math.sqrt(sSq);
                vx[i] *= s; vy[i] *= s; vz[i] *= s;
            }
        }
    }

    // ── PBF Solver ───────────────────────────────────────────────────────

    pbfStep(dt) {
        const px = this.px, py = this.py, pz = this.pz;
        const vx = this.vx, vy = this.vy, vz = this.vz;
        const predX = this.predX, predY = this.predY, predZ = this.predZ;
        const _density = this.density, _lambda = this.lambda;
        const accX = this.accX, accY = this.accY, accZ = this.accZ, accW = this.accW;
        const alive = this.alive, _ground = this.onGround;
        const n = this.count;
        const radius = this.sphereSize * 0.5;
        const seaKill = this._seaLevel + 2;

        // PBF parameters
        const diam = this.sphereSize;        // sphere diameter
        const h = diam * 2.0;               // smoothing radius = 2× particle diameter
        const hSq = h * h;
        const h3 = h * h * h;
        const h6 = h3 * h3;
        const h9 = h6 * h3;
        const poly6K = 315.0 / (64.0 * Math.PI * h9);
        const spikyK = -45.0 / (Math.PI * h6);
        const poly6_0 = poly6K * hSq * hSq * hSq; // W(0, h) — self density
        const epsilon = 400;                 // constraint regularization
        const solverIter = 2;                // PBF solver iterations
        // Viscosity applied as simple velocity damping (avoids extra neighbor traversal)
        const viscDamp = Math.pow(0.99, dt * 30);

        // Compute rest density from expected packing
        // Self + ~7 neighbors at distance sphereSize
        const spacingSq = this.sphereSize * this.sphereSize;
        const wAtSpacing = poly6K * (hSq - spacingSq) * (hSq - spacingSq) * (hSq - spacingSq);
        const restDensity = poly6_0 + 4 * wAtSpacing; // triggers for hexagonal monolayer (~6 neighbors exceeds this)
        const invRestDensity = 1 / restDensity;

        // ── Step 1: Apply external forces ──
        const gdt = GRAVITY * dt;
        const groundFric = Math.pow(0.9995, dt * 30);
        for (let i = 0; i < n; i++) {
            if (!alive[i]) continue;

            if (_ground[i]) {
                // Slope-driven acceleration for grounded particles
                const { gx, gy } = this.sampleGrid(px[i], py[i]);
                const denom = 1 + gx * gx + gy * gy;
                vx[i] += (-GRAVITY * gx / denom) * dt;
                vy[i] += (-GRAVITY * gy / denom) * dt;
                vx[i] *= groundFric;
                vy[i] *= groundFric;
            } else {
                // Freefall for airborne
                vz[i] -= gdt;
            }
        }

        // ── Step 2: Predict positions ──
        for (let i = 0; i < n; i++) {
            if (!alive[i]) continue;
            predX[i] = px[i] + vx[i] * dt;
            predY[i] = py[i] + vy[i] * dt;
            predZ[i] = pz[i] + vz[i] * dt;
        }

        // ── Step 3: Build spatial hash on predicted positions ──
        const cs = h; // cell size = smoothing radius
        const invCS = 1 / cs;

        let aliveN = 0;
        let minCX = 1e9, maxCX = -1e9, minCY = 1e9, maxCY = -1e9;
        for (let i = 0; i < n; i++) {
            if (!alive[i]) continue;
            aliveN++;
            const cx = Math.floor(predX[i] * invCS);
            const cy = Math.floor(predY[i] * invCS);
            if (cx < minCX) minCX = cx;
            if (cx > maxCX) maxCX = cx;
            if (cy < minCY) minCY = cy;
            if (cy > maxCY) maxCY = cy;
        }
        if (aliveN < 2) return;

        const gridW = maxCX - minCX + 3;
        const gridSize = gridW * (maxCY - minCY + 3);
        if (gridSize > 1000000) return;

        // Grow hash buffers
        if (!this._pCell || this._pCell.length < n) this._pCell = new Uint32Array(Math.max(n, 1024));
        if (!this._cellCount || this._cellCount.length < gridSize) this._cellCount = new Uint32Array(Math.max(gridSize, 1024));
        if (!this._cellStart || this._cellStart.length < gridSize + 1) this._cellStart = new Uint32Array(Math.max(gridSize + 1, 1025));
        if (!this._sortedIdx || this._sortedIdx.length < aliveN) this._sortedIdx = new Uint32Array(Math.max(aliveN * 2, 1024));

        const pCell = this._pCell, cellCount = this._cellCount;
        const cellStart = this._cellStart, sortedIdx = this._sortedIdx;

        cellCount.fill(0, 0, gridSize);
        const offCX = -minCX + 1, offCY = -minCY + 1;

        for (let i = 0; i < n; i++) {
            if (!alive[i]) continue;
            const ci = (Math.floor(predY[i] * invCS) + offCY) * gridW + (Math.floor(predX[i] * invCS) + offCX);
            pCell[i] = ci;
            cellCount[ci]++;
        }
        cellStart[0] = 0;
        for (let c = 0; c < gridSize; c++) cellStart[c + 1] = cellStart[c] + cellCount[c];
        for (let c = 0; c < gridSize; c++) cellCount[c] = cellStart[c];
        for (let i = 0; i < n; i++) {
            if (!alive[i]) continue;
            sortedIdx[cellCount[pCell[i]]++] = i;
        }
        for (let c = 0; c < gridSize; c++) cellCount[c] = cellStart[c + 1] - cellStart[c];

        const nbr0 = 1, nbr1 = gridW - 1, nbr2 = gridW, nbr3 = gridW + 1;

        // ── Step 4: Solver iterations ──
        for (let iter = 0; iter < solverIter; iter++) {

            // ── Pass A: Compute density + lambda ──
            // Initialize density with self-contribution
            for (let i = 0; i < n; i++) {
                _density[i] = alive[i] ? poly6_0 : 0;
                accX[i] = 0; accY[i] = 0; accZ[i] = 0; accW[i] = 0;
            }

            // Iterate all neighbor pairs
            for (let c = 0; c < gridSize; c++) {
                const cnt = cellCount[c];
                if (cnt === 0) continue;
                const cS = cellStart[c], cE = cS + cnt;

                // Within cell
                for (let a = cS; a < cE; a++) {
                    const i = sortedIdx[a];
                    for (let b = a + 1; b < cE; b++) {
                        const j = sortedIdx[b];
                        const dx = predX[j] - predX[i], dy = predY[j] - predY[i], dz = predZ[j] - predZ[i];
                        const rSq = dx*dx + dy*dy + dz*dz;
                        if (rSq >= hSq) continue;
                        // Poly6 density
                        const diff = hSq - rSq;
                        const w = poly6K * diff * diff * diff;
                        _density[i] += w;
                        _density[j] += w;
                        // Spiky gradient for lambda denominator
                        const r = Math.sqrt(rSq);
                        if (r < 1e-6) {
                            // Coincident particles: push apart in random direction
                            const push = diam * 0.5;
                            const a2 = Math.random() * Math.PI * 2;
                            accX[i] -= Math.cos(a2) * push; accY[i] -= Math.sin(a2) * push;
                            accX[j] += Math.cos(a2) * push; accY[j] += Math.sin(a2) * push;
                            continue;
                        }
                        const grad = spikyK * (h - r) * (h - r) / r; // gradient coefficient
                        const gx = grad * dx, gy = grad * dy, gz = grad * dz;
                        // Accumulate ∇_i C_i (= -Σ ∇W) and Σ|∇W|²
                        accX[i] += gx; accY[i] += gy; accZ[i] += gz;
                        accX[j] -= gx; accY[j] -= gy; accZ[j] -= gz;
                        const g2 = gx*gx + gy*gy + gz*gz;
                        accW[i] += g2;
                        accW[j] += g2;
                    }
                }

                // Neighbor cells
                const nbrOffsets = [c + nbr0, c + nbr1, c + nbr2, c + nbr3];
                for (let ni = 0; ni < 4; ni++) {
                    const nc = nbrOffsets[ni];
                    if (nc >= gridSize || cellCount[nc] === 0) continue;
                    const nS = cellStart[nc], nE = nS + cellCount[nc];
                    for (let a = cS; a < cE; a++) {
                        const i = sortedIdx[a];
                        for (let b = nS; b < nE; b++) {
                            const j = sortedIdx[b];
                            const dx = predX[j] - predX[i], dy = predY[j] - predY[i], dz = predZ[j] - predZ[i];
                            const rSq = dx*dx + dy*dy + dz*dz;
                            if (rSq >= hSq) continue;
                            const diff = hSq - rSq;
                            const w = poly6K * diff * diff * diff;
                            _density[i] += w;
                            _density[j] += w;
                            const r = Math.sqrt(rSq);
                            if (r < 1e-6) {
                            // Coincident particles: push apart in random direction
                            const push = diam * 0.5;
                            const a2 = Math.random() * Math.PI * 2;
                            accX[i] -= Math.cos(a2) * push; accY[i] -= Math.sin(a2) * push;
                            accX[j] += Math.cos(a2) * push; accY[j] += Math.sin(a2) * push;
                            continue;
                        }
                            const grad = spikyK * (h - r) * (h - r) / r;
                            const gx = grad * dx, gy = grad * dy, gz = grad * dz;
                            accX[i] += gx; accY[i] += gy; accZ[i] += gz;
                            accX[j] -= gx; accY[j] -= gy; accZ[j] -= gz;
                            const g2 = gx*gx + gy*gy + gz*gz;
                            accW[i] += g2;
                            accW[j] += g2;
                        }
                    }
                }
            }

            // Compute lambda for each particle
            const invRho0Sq = invRestDensity * invRestDensity;
            for (let i = 0; i < n; i++) {
                if (!alive[i]) continue;
                const C = _density[i] * invRestDensity - 1;
                // Denominator: Σ|∇_k C_i|² = (1/ρ₀²)(Σ|∇W_ij|² + |Σ∇W_ij|²)
                const selfGrad2 = accX[i]*accX[i] + accY[i]*accY[i] + accZ[i]*accZ[i];
                const denom = invRho0Sq * (accW[i] + selfGrad2) + epsilon;
                _lambda[i] = Math.min(-C / denom, 0); // one-sided: repulsion only (no attraction at free surface)
            }

            // ── Pass B: Compute + apply position correction ──
            // Reuse accX/Y/Z as delta position accumulators
            for (let i = 0; i < n; i++) { accX[i] = 0; accY[i] = 0; accZ[i] = 0; }

            for (let c = 0; c < gridSize; c++) {
                const cnt = cellCount[c];
                if (cnt === 0) continue;
                const cS = cellStart[c], cE = cS + cnt;

                // Within cell
                for (let a = cS; a < cE; a++) {
                    const i = sortedIdx[a];
                    for (let b = a + 1; b < cE; b++) {
                        const j = sortedIdx[b];
                        const dx = predX[j] - predX[i], dy = predY[j] - predY[i], dz = predZ[j] - predZ[i];
                        const rSq = dx*dx + dy*dy + dz*dz;
                        if (rSq >= hSq) continue;
                        const r = Math.sqrt(rSq);
                        if (r < 1e-6) {
                            // Coincident particles: push apart in random direction
                            const push = diam * 0.5;
                            const a2 = Math.random() * Math.PI * 2;
                            accX[i] -= Math.cos(a2) * push; accY[i] -= Math.sin(a2) * push;
                            accX[j] += Math.cos(a2) * push; accY[j] += Math.sin(a2) * push;
                            continue;
                        }
                        const nx = dx / r, ny = dy / r, nz = dz / r;
                        // PBF density constraint correction
                        const grad = spikyK * (h - r) * (h - r) / r;
                        const factor = (_lambda[i] + _lambda[j]) * invRestDensity;
                        const cx = grad * dx * factor, cy = grad * dy * factor, cz = grad * dz * factor;
                        accX[i] += cx; accY[i] += cy; accZ[i] += cz;
                        accX[j] -= cx; accY[j] -= cy; accZ[j] -= cz;
                        // Hard-sphere overlap prevention (catches sparse pairs PBF misses)
                        if (r < diam) {
                            const push = (diam - r) * 0.5;
                            accX[i] -= nx * push; accY[i] -= ny * push; accZ[i] -= nz * push;
                            accX[j] += nx * push; accY[j] += ny * push; accZ[j] += nz * push;
                        }
                    }
                }

                // Neighbor cells
                const nbrOffsets = [c + nbr0, c + nbr1, c + nbr2, c + nbr3];
                for (let ni = 0; ni < 4; ni++) {
                    const nc = nbrOffsets[ni];
                    if (nc >= gridSize || cellCount[nc] === 0) continue;
                    const nS = cellStart[nc], nE = nS + cellCount[nc];
                    for (let a = cS; a < cE; a++) {
                        const i = sortedIdx[a];
                        for (let b = nS; b < nE; b++) {
                            const j = sortedIdx[b];
                            const dx = predX[j] - predX[i], dy = predY[j] - predY[i], dz = predZ[j] - predZ[i];
                            const rSq = dx*dx + dy*dy + dz*dz;
                            if (rSq >= hSq) continue;
                            const r = Math.sqrt(rSq);
                            if (r < 1e-6) {
                            // Coincident particles: push apart in random direction
                            const push = diam * 0.5;
                            const a2 = Math.random() * Math.PI * 2;
                            accX[i] -= Math.cos(a2) * push; accY[i] -= Math.sin(a2) * push;
                            accX[j] += Math.cos(a2) * push; accY[j] += Math.sin(a2) * push;
                            continue;
                        }
                            const grad = spikyK * (h - r) * (h - r) / r;
                            const factor = (_lambda[i] + _lambda[j]) * invRestDensity;
                            const cx = grad * dx * factor, cy = grad * dy * factor, cz = grad * dz * factor;
                            accX[i] += cx; accY[i] += cy; accZ[i] += cz;
                            accX[j] -= cx; accY[j] -= cy; accZ[j] -= cz;
                        }
                    }
                }
            }

            // Apply position corrections + terrain clamp
            for (let i = 0; i < n; i++) {
                if (!alive[i]) continue;
                predX[i] += accX[i];
                predY[i] += accY[i];
                // Grounded particles: only horizontal PBF correction (no upward launch)
                // Airborne particles: full 3D correction
                if (!_ground[i]) {
                    predZ[i] += accZ[i];
                }
                // Clamp to terrain
                const elev = this.sampleGrid(predX[i], predY[i]).elev;
                if (predZ[i] < elev + radius) {
                    predZ[i] = elev + radius;
                }
            }
        } // end solver iterations

        // ── Step 5: Update velocity from position change ──
        const invDt = 1 / dt;
        for (let i = 0; i < n; i++) {
            if (!alive[i]) continue;
            vx[i] = (predX[i] - px[i]) * invDt;
            vy[i] = (predY[i] - py[i]) * invDt;
            vz[i] = (predZ[i] - pz[i]) * invDt;
        }

        // ── Step 5.5: Post-PBF slope boost for grounded particles ──
        // Applied AFTER PBF so it can't be undone by constraint corrections.
        // This drives downhill flow — PBF handles spacing, slope drives momentum.
        const slopeBoost = 3.0;
        for (let i = 0; i < n; i++) {
            if (!alive[i] || !_ground[i]) continue;
            const { gx: sgx, gy: sgy } = this.sampleGrid(predX[i], predY[i]);
            const sd = 1 + sgx * sgx + sgy * sgy;
            vx[i] += (-GRAVITY * sgx / sd) * dt * slopeBoost;
            vy[i] += (-GRAVITY * sgy / sd) * dt * slopeBoost;
        }

        // ── Step 6: Apply viscosity damping (simple O(n), no neighbor traversal) ──
        for (let i = 0; i < n; i++) {
            if (!alive[i]) continue;
            vx[i] *= viscDamp;
            vy[i] *= viscDamp;
            vz[i] *= viscDamp;
        }

        // ── Step 7: Finalize positions + ground state + kill ──
        for (let i = 0; i < n; i++) {
            if (!alive[i]) continue;
            px[i] = predX[i];
            py[i] = predY[i];
            pz[i] = predZ[i];

            const elev = this.sampleGrid(px[i], py[i]).elev;
            _ground[i] = (pz[i] <= elev + radius + 0.05) ? 1 : 0;

            if (elev <= seaKill) {
                alive[i] = 0;
                this.aliveCount--;
                this.freeStack.push(i);
            }
        }
    }

    // ── Instance matrix update ───────────────────────────────────────────

    updateInstances() {
        const ex = this.eastVec.x, ey = this.eastVec.y, ez = this.eastVec.z;
        const nx = this.northVec.x, ny = this.northVec.y, nz = this.northVec.z;
        const ux = this.upVec.x, uy = this.upVec.y, uz = this.upVec.z;
        const size = this.sphereSize;
        const originAlt = this.originAlt;
        const mat = this._mat4, elems = mat.elements;
        const _px = this.px, _py = this.py, _pz = this.pz, _alive = this.alive;

        let visCount = 0;
        for (let i = 0; i < this.count; i++) {
            if (!_alive[i]) continue;
            const e = _px[i], n = _py[i], u = _pz[i] - originAlt;
            const ox = e*ex + n*nx + u*ux;
            const oy = e*ey + n*ny + u*uy;
            const oz = e*ez + n*nz + u*uz;
            elems[0]=size; elems[1]=0; elems[2]=0; elems[3]=0;
            elems[4]=0; elems[5]=size; elems[6]=0; elems[7]=0;
            elems[8]=0; elems[9]=0; elems[10]=size; elems[11]=0;
            elems[12]=ox; elems[13]=oy; elems[14]=oz; elems[15]=1;
            this.instancedMesh.setMatrixAt(visCount, mat);
            visCount++;
        }
        this.instancedMesh.count = visCount;
        if (visCount > 0) this.instancedMesh.instanceMatrix.needsUpdate = true;
    }

    // ── Cleanup ──────────────────────────────────────────────────────────

    dispose() {
        if (this._renderInterval) clearInterval(this._renderInterval);
        if (this._rebuildTimer) clearTimeout(this._rebuildTimer);
        if (this.instancedMesh) {
            this.instancedMesh.geometry.dispose();
            this.instancedMesh.material.dispose();
        }
        if (this.guiFolder) this.guiFolder.destroy();
        super.dispose();
    }
}
