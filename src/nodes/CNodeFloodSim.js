// CNodeFloodSim.js - Flood simulator that spawns water spheres at the target point
// and flows them downhill using the terrain elevation map.
//
// Each sphere has an explicit onGround flag:
//   AIR:    pure freefall under gravity, light air drag, no slope forces
//   GROUND: slope acceleration from terrain gradient, ground friction, no freefall
//
// Transition criteria:
//   Air → Ground:  particle altitude ≤ terrain elevation + radius
//   Ground → Air:  particle altitude > terrain elevation + radius + liftThreshold

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

export class CNodeFloodSim extends CNode3DGroup {
    constructor(v) {
        v.layers ??= LAYER.MASK_WORLD;
        super(v);

        this.input("track", true); // optional track for spawn point

        // GUI-controlled parameters (all serialized)
        this.floodEnabled = false;
        this.floodRate = v.floodRate ?? 50;
        this.sphereSize = v.sphereSize ?? 1.0;
        this.dropRadius = v.dropRadius ?? 10;
        this.waterColor = v.waterColor ?? "#4488cc";
        this.maxParticles = v.maxParticles ?? DEFAULT_MAX_PARTICLES;
        this.addSimpleSerials(["floodEnabled", "floodRate", "sphereSize", "dropRadius", "waterColor", "maxParticles"]);

        // Allocate particle buffers
        this.count = 0;
        this.aliveCount = 0;
        this.freeStack = [];
        this.allocateBuffers(this.maxParticles);

        // Local coordinate origin (set once when flooding starts)
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

        // Pre-computed elevation + gradient grid
        this.elevGridRes = 500;
        this.elevGridSpacing = 2;
        this.elevGridHalf = 500 * 2 / 2;
        this.elevGrid = null;
        this.gradX = null;
        this.gradY = null;

        // Shared result object for sampleGrid (avoids per-call allocation)
        this._sr = { elev: 0, gx: 0, gy: 0 };

        // Pre-allocated collision buffers (grown as needed, never shrunk)
        this._pCell = null;
        this._cellCount = null;
        this._cellStart = null;
        this._sortedIdx = null;

        // Reusable matrix
        this._mat4 = new Matrix4();

        // Debounced elevation grid rebuild when new terrain tiles load
        this._rebuildTimer = null;
        EventManager.addEventListener("tileChanged", () => {
            if (!this.originSet) return;
            if (this._rebuildTimer) clearTimeout(this._rebuildTimer);
            this._rebuildTimer = setTimeout(() => {
                this.buildElevationGrid();
                this._rebuildTimer = null;
            }, 500);
        });

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
        this.onGround = new Uint8Array(n);  // 0 = airborne, 1 = on ground
    }

    /** Reallocate buffers when maxParticles changes, preserving live data */
    resizeBuffers(newMax) {
        if (newMax === this.maxParticles) return;
        const oldMax = this.maxParticles;
        const copy = Math.min(this.count, newMax);

        const newPx = new Float32Array(newMax);
        const newPy = new Float32Array(newMax);
        const newPz = new Float32Array(newMax);
        const newVx = new Float32Array(newMax);
        const newVy = new Float32Array(newMax);
        const newVz = new Float32Array(newMax);
        const newAlive = new Uint8Array(newMax);
        const newOnGround = new Uint8Array(newMax);

        newPx.set(this.px.subarray(0, copy));
        newPy.set(this.py.subarray(0, copy));
        newPz.set(this.pz.subarray(0, copy));
        newVx.set(this.vx.subarray(0, copy));
        newVy.set(this.vy.subarray(0, copy));
        newVz.set(this.vz.subarray(0, copy));
        newAlive.set(this.alive.subarray(0, copy));
        newOnGround.set(this.onGround.subarray(0, copy));

        this.px = newPx; this.py = newPy; this.pz = newPz;
        this.vx = newVx; this.vy = newVy; this.vz = newVz;
        this.alive = newAlive;
        this.onGround = newOnGround;

        this.maxParticles = newMax;
        if (this.count > newMax) this.count = newMax;

        // Rebuild free stack (discard indices >= newMax)
        this.freeStack = this.freeStack.filter(i => i < newMax);

        // Rebuild InstancedMesh with new capacity
        if (this.instancedMesh) {
            this.group.remove(this.instancedMesh);
            this.instancedMesh.geometry.dispose();
            this.instancedMesh.material.dispose();
        }
        this.setupMesh();
    }

    // ── Rendering setup ──────────────────────────────────────────────────

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

    // ── Target / spawn point ─────────────────────────────────────────────

    getTargetECEF(f) {
        if (this.in.track) return this.in.track.p(f);
        for (const name of ["fixedTargetPositionWind", "fixedTargetPosition", "targetTrack"]) {
            if (NodeMan.exists(name)) return NodeMan.get(name).p(f);
        }
        return LLAToECEF(Sit.lat, Sit.lon, 0);
    }

    // ── Coordinate origin ────────────────────────────────────────────────

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

    // ── Elevation grid ───────────────────────────────────────────────────

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
                return terrain.elevationMap.getElevationInterpolated(lat, lon);
            }
        }
        return this.originAlt;
    }

    buildElevationGrid() {
        const res = this.elevGridRes;
        const sp  = this.elevGridSpacing;
        const half = res / 2;

        this.elevGrid = new Float32Array(res * res);
        this.gradX    = new Float32Array(res * res);
        this.gradY    = new Float32Array(res * res);

        for (let j = 0; j < res; j++) {
            const n = (j - half) * sp;
            for (let i = 0; i < res; i++) {
                const e = (i - half) * sp;
                this.elevGrid[j * res + i] = this.getElevationDirect(e, n);
            }
        }

        const inv2sp = 1 / (2 * sp);
        for (let j = 1; j < res - 1; j++) {
            for (let i = 1; i < res - 1; i++) {
                const idx = j * res + i;
                this.gradX[idx] = (this.elevGrid[idx + 1]           - this.elevGrid[idx - 1])           * inv2sp;
                this.gradY[idx] = (this.elevGrid[(j + 1) * res + i] - this.elevGrid[(j - 1) * res + i]) * inv2sp;
            }
        }
        for (let i = 0; i < res; i++) {
            this.gradY[i]                   = this.gradY[res + i];
            this.gradY[(res - 1) * res + i] = this.gradY[(res - 2) * res + i];
        }
        for (let j = 0; j < res; j++) {
            this.gradX[j * res]             = this.gradX[j * res + 1];
            this.gradX[j * res + res - 1]   = this.gradX[j * res + res - 2];
        }
    }

    sampleGrid(e, n) {
        const res = this.elevGridRes;
        const sp  = this.elevGridSpacing;
        const half = res / 2;
        const r = this._sr;

        const gx = e / sp + half;
        const gy = n / sp + half;

        if (gx < 1 || gx > res - 2 || gy < 1 || gy > res - 2) {
            const h = 2;
            r.elev = this.getElevationDirect(e, n);
            r.gx = (this.getElevationDirect(e + h, n) - this.getElevationDirect(e - h, n)) / (2 * h);
            r.gy = (this.getElevationDirect(e, n + h) - this.getElevationDirect(e, n - h)) / (2 * h);
            return r;
        }

        const ix = gx | 0;
        const iy = gy | 0;
        const fx = gx - ix;
        const fy = gy - iy;

        const i00 = iy * res + ix;
        const i10 = i00 + 1;
        const i01 = i00 + res;
        const i11 = i01 + 1;

        const w00 = (1 - fx) * (1 - fy);
        const w10 = fx       * (1 - fy);
        const w01 = (1 - fx) * fy;
        const w11 = fx       * fy;

        const eg = this.elevGrid, gxA = this.gradX, gyA = this.gradY;
        r.elev = eg[i00] * w00 + eg[i10] * w10 + eg[i01] * w01 + eg[i11] * w11;
        r.gx   = gxA[i00] * w00 + gxA[i10] * w10 + gxA[i01] * w01 + gxA[i11] * w11;
        r.gy   = gyA[i00] * w00 + gyA[i10] * w10 + gyA[i01] * w01 + gyA[i11] * w11;
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
        const e = spawnE + Math.cos(angle) * dist;
        const n = spawnN + Math.sin(angle) * dist;

        this.px[idx] = e;
        this.py[idx] = n;
        this.pz[idx] = spawnAlt;
        this.vx[idx] = 0;
        this.vy[idx] = 0;
        this.vz[idx] = 0;
        this.alive[idx] = 1;
        this.onGround[idx] = 0;  // spawned in air
        this.aliveCount++;
    }

    // ── Per-frame update ─────────────────────────────────────────────────

    update(f) {
        super.update(f);

        if (!this.floodEnabled && this.aliveCount === 0) return;

        const targetECEF = this.getTargetECEF(f);

        if (!this.originSet) {
            if (!this.floodEnabled) return;
            this.setupOrigin(targetECEF);
        }

        const diff = targetECEF.clone().sub(this.originECEF);
        const spawnE = diff.dot(this.eastVec);
        const spawnN = diff.dot(this.northVec);
        const spawnAlt = ECEFToLLAVD_radii(targetECEF).z;

        if (this.floodEnabled) {
            const room = this.maxParticles - this.count + this.freeStack.length;
            const toSpawn = Math.min(this.floodRate, room);
            for (let i = 0; i < toSpawn; i++) {
                this.spawnParticle(spawnE, spawnN, spawnAlt);
            }
        }

        const dt = (Sit.simSpeed || 1) / (Sit.fps || 30);
        const substeps = 3;
        const subDt = dt / substeps;
        for (let s = 0; s < substeps; s++) {
            this.physicsStep(subDt);
        }

        this.updateInstances();
        setRenderOne();
    }

    // ── Physics ──────────────────────────────────────────────────────────

    physicsStep(dt) {
        const _px = this.px, _py = this.py, _pz = this.pz;
        const _vx = this.vx, _vy = this.vy, _vz = this.vz;
        const _alive = this.alive;
        const _ground = this.onGround;
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

            // Ground → Air: if collision (or cliff) pushed us above the surface, go airborne
            if (_ground[i] && _pz[i] > groundLevel + 0.01) {
                _ground[i] = 0;
                // Inherit small upward velocity so we don't immediately re-land
                if (_vz[i] <= 0) _vz[i] = 0;
            }

            if (_ground[i]) {
                // ── ON GROUND: slope-driven flow ──
                const denom = 1 + gx * gx + gy * gy;
                const ax = -GRAVITY * gx / denom;
                const ay = -GRAVITY * gy / denom;

                _vx[i] = (_vx[i] + ax * dt) * groundFric;
                _vy[i] = (_vy[i] + ay * dt) * groundFric;
                _vz[i] = 0;

                _px[i] += _vx[i] * dt;
                _py[i] += _vy[i] * dt;

                // Snap to terrain at new position
                const newElev = this.sampleGrid(_px[i], _py[i]).elev;
                _pz[i] = newElev + radius;
            } else {
                // ── IN AIR: pure freefall ──
                _vx[i] *= airDrag;
                _vy[i] *= airDrag;
                _vz[i] -= gdt;

                _px[i] += _vx[i] * dt;
                _py[i] += _vy[i] * dt;
                _pz[i] += _vz[i] * dt;

                // Air → Ground: hit the terrain
                if (_pz[i] <= groundLevel) {
                    _pz[i] = groundLevel;
                    _vz[i] = 0;
                    _ground[i] = 1;
                }
            }

            // Kill at sea level
            if (elev <= seaKill) {
                _alive[i] = 0;
                this.aliveCount--;
                this.freeStack.push(i);
            }
        }

        this.resolveCollisions();
    }

    // ── Counting-sort spatial-grid collision detection ────────────────────
    //
    // All buffers are pre-allocated typed arrays (zero GC), collision math
    // is inlined, and we only check 4 forward-neighbor cells per cell
    // (each pair tested exactly once). Position-only push-apart, no
    // velocity exchange (prevents packed particles from acting as rigid body).

    resolveCollisions() {
        const px = this.px, py = this.py, pz = this.pz;
        const alive = this.alive;
        const n = this.count;
        const diam = this.sphereSize;
        const diamSq = diam * diam;
        const cs = diam;
        const invCS = 1 / cs;

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
        const gridH = maxCY - minCY + 3;
        const gridSize = gridW * gridH;
        if (gridSize > 500000) return;

        if (!this._pCell    || this._pCell.length    < n)            this._pCell    = new Uint32Array(Math.max(n, 1024));
        if (!this._cellCount|| this._cellCount.length< gridSize)    this._cellCount = new Uint32Array(Math.max(gridSize, 1024));
        if (!this._cellStart|| this._cellStart.length< gridSize+1)  this._cellStart = new Uint32Array(Math.max(gridSize + 1, 1025));
        if (!this._sortedIdx|| this._sortedIdx.length< aliveN)      this._sortedIdx = new Uint32Array(Math.max(aliveN * 2, 1024));

        const pCell     = this._pCell;
        const cellCount = this._cellCount;
        const cellStart = this._cellStart;
        const sortedIdx = this._sortedIdx;

        cellCount.fill(0, 0, gridSize);

        const offCX = -minCX + 1;
        const offCY = -minCY + 1;

        for (let i = 0; i < n; i++) {
            if (!alive[i]) continue;
            const ci = (Math.floor(py[i] * invCS) + offCY) * gridW
                     + (Math.floor(px[i] * invCS) + offCX);
            pCell[i] = ci;
            cellCount[ci]++;
        }

        cellStart[0] = 0;
        for (let c = 0; c < gridSize; c++) {
            cellStart[c + 1] = cellStart[c] + cellCount[c];
        }

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
            const cStart = cellStart[c];
            const cEnd   = cStart + cnt;

            // Within-cell pairs
            for (let a = cStart; a < cEnd; a++) {
                const i = sortedIdx[a];
                for (let b = a + 1; b < cEnd; b++) {
                    const j = sortedIdx[b];
                    const ddx = px[j] - px[i], ddy = py[j] - py[i], ddz = pz[j] - pz[i];
                    const dSq = ddx * ddx + ddy * ddy + ddz * ddz;
                    if (dSq >= diamSq || dSq < 1e-10) continue;
                    const d = Math.sqrt(dSq), inv = 1 / d;
                    const p = (diam - d) * 0.5;
                    const nnx = ddx * inv * p, nny = ddy * inv * p, nnz = ddz * inv * p;
                    px[i] -= nnx; py[i] -= nny; pz[i] -= nnz;
                    px[j] += nnx; py[j] += nny; pz[j] += nnz;
                }
            }

            // 4 forward-neighbor cells (position-only push-apart)
            const neighbors = [c + nbr0, c + nbr1, c + nbr2, c + nbr3];
            for (let ni = 0; ni < 4; ni++) {
                const nc = neighbors[ni];
                if (nc >= gridSize || cellCount[nc] === 0) continue;
                const ns = cellStart[nc], ne = ns + cellCount[nc];
                for (let a = cStart; a < cEnd; a++) {
                    const i = sortedIdx[a];
                    for (let b = ns; b < ne; b++) {
                        const j = sortedIdx[b];
                        const ddx = px[j] - px[i], ddy = py[j] - py[i], ddz = pz[j] - pz[i];
                        const dSq = ddx * ddx + ddy * ddy + ddz * ddz;
                        if (dSq >= diamSq || dSq < 1e-10) continue;
                        const d = Math.sqrt(dSq), inv = 1 / d;
                        const p = (diam - d) * 0.5;
                        const nnx = ddx * inv * p, nny = ddy * inv * p, nnz = ddz * inv * p;
                        px[i] -= nnx; py[i] -= nny; pz[i] -= nnz;
                        px[j] += nnx; py[j] += nny; pz[j] += nnz;
                    }
                }
            }
        }
    }

    // ── Instance matrix update ───────────────────────────────────────────

    updateInstances() {
        const ex = this.eastVec.x,  ey = this.eastVec.y,  ez = this.eastVec.z;
        const nx = this.northVec.x, ny = this.northVec.y, nz = this.northVec.z;
        const ux = this.upVec.x,    uy = this.upVec.y,    uz = this.upVec.z;
        const size = this.sphereSize;
        const originAlt = this.originAlt;
        const mat = this._mat4;
        const elems = mat.elements;
        const _px = this.px, _py = this.py, _pz = this.pz;
        const _alive = this.alive;

        let visCount = 0;

        for (let i = 0; i < this.count; i++) {
            if (!_alive[i]) continue;

            const e = _px[i];
            const n = _py[i];
            const u = _pz[i] - originAlt;

            const ox = e * ex + n * nx + u * ux;
            const oy = e * ey + n * ny + u * uy;
            const oz = e * ez + n * nz + u * uz;

            elems[0] = size; elems[1] = 0;    elems[2] = 0;    elems[3] = 0;
            elems[4] = 0;    elems[5] = size; elems[6] = 0;    elems[7] = 0;
            elems[8] = 0;    elems[9] = 0;    elems[10] = size; elems[11] = 0;
            elems[12] = ox;  elems[13] = oy;  elems[14] = oz;  elems[15] = 1;

            this.instancedMesh.setMatrixAt(visCount, mat);
            visCount++;
        }

        this.instancedMesh.count = visCount;
        if (visCount > 0) {
            this.instancedMesh.instanceMatrix.needsUpdate = true;
        }
    }

    // ── Cleanup ──────────────────────────────────────────────────────────

    dispose() {
        if (this.instancedMesh) {
            this.instancedMesh.geometry.dispose();
            this.instancedMesh.material.dispose();
        }
        if (this.guiFolder) {
            this.guiFolder.destroy();
        }
        super.dispose();
    }
}
