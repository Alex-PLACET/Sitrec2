import {CNode3DGroup} from "./CNode3DGroup";
import * as THREE from "three";
import {GlobalDateTimeNode, setRenderOne, Sit} from "../Globals";
import {dispose} from "../threeExt";
import {V3} from "../threeUtils";
import {getLocalUpVector} from "../SphericalMath";
import * as LAYER from "../LayerMasks";

// CNodeContrail renders a flat horizontal white ribbon trailing behind a track,
// drifting with wind over time. Rebuilt every frame based on the current playback position.
// If a dataTrack is provided with time-based lookup (getTime/getIndexAtTime),
// the contrail can extend before the sitch start time into the data track's earlier data.
export class CNodeContrail extends CNode3DGroup {
    constructor(v) {
        v.layers ??= LAYER.MASK_HELPERS | LAYER.MASK_LOOK;
        super(v);

        this.input("track");
        this.optionalInputs(["wind", "dataTrack"]);

        this.duration = v.duration ?? 100;         // seconds of trail
        this.sampleInterval = v.sampleInterval ?? 5; // seconds between samples
        this.ribbonWidth = v.ribbonWidth ?? 50;    // meters
        this.spread = v.spread ?? 0;               // m/s width increase over time

        this.mesh = null;

        this.material = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
    }

    dispose() {
        this.removeMesh();
        this.material.dispose();
        super.dispose();
    }

    removeMesh() {
        if (this.mesh) {
            this.group.remove(this.mesh);
            dispose(this.mesh.geometry);
            this.mesh = null;
        }
    }

    update(frame) {
        super.update(frame);
        this.rebuildRibbon(frame);
        setRenderOne(true);
    }

    // Binary search for a float frame index in the data track matching a target time.
    findDataTrackFloatFrame(dataTrack, targetTimeMs) {
        const n = dataTrack.frames;
        if (n < 2) return 0;

        if (targetTimeMs <= dataTrack.getTime(0)) return 0;
        if (targetTimeMs >= dataTrack.getTime(n - 1)) return n - 1;

        let lo = 0, hi = n - 1;
        while (hi - lo > 1) {
            const mid = Math.floor((lo + hi) / 2);
            if (dataTrack.getTime(mid) <= targetTimeMs) {
                lo = mid;
            } else {
                hi = mid;
            }
        }

        const tLo = dataTrack.getTime(lo);
        const tHi = dataTrack.getTime(hi);
        if (tHi <= tLo) return lo;
        const frac = (targetTimeMs - tLo) / (tHi - tLo);
        return lo + frac;
    }

    // Get position for a sitch frame, falling back to data track for pre-sitch frames.
    getPositionAtFrame(frame) {
        const track = this.in.track;

        if (frame >= 0 && frame < track.frames) {
            const pos = track.p(frame);
            if (pos && !isNaN(pos.x)) return pos.clone();
            return null;
        }

        if (frame < 0 && this.in.dataTrack && typeof this.in.dataTrack.getTime === 'function') {
            const dataTrack = this.in.dataTrack;
            const msStart = GlobalDateTimeNode.getStartTimeValue();
            const targetTimeMs = msStart + (frame / Sit.fps) * 1000;

            if (targetTimeMs < dataTrack.getTime(0)) return null;

            const floatFrame = this.findDataTrackFloatFrame(dataTrack, targetTimeMs);

            // Validate bracketing frames before interpolating - data track can have
            // empty slots (filtered/invalid data) that cause assertion failures
            const lo = Math.floor(floatFrame);
            const hi = Math.ceil(floatFrame);
            const loVal = (lo >= 0 && lo < dataTrack.frames) ? dataTrack.v(lo) : null;
            const hiVal = (hi >= 0 && hi < dataTrack.frames) ? dataTrack.v(hi) : null;
            const loOk = loVal && loVal.position && !isNaN(loVal.position.x);
            const hiOk = hiVal && hiVal.position && !isNaN(hiVal.position.x);

            let pos;
            if (loOk && hiOk) {
                pos = dataTrack.p(floatFrame); // safe to interpolate
            } else if (loOk) {
                pos = loVal.position;
            } else if (hiOk) {
                pos = hiVal.position;
            } else {
                return null;
            }
            if (pos && !isNaN(pos.x)) return pos.clone();
        }

        return null;
    }

    rebuildRibbon(frame) {
        this.removeMesh();

        const wind = this.in.wind;
        const fps = Sit.fps;

        // Collect sample points with elapsed time
        const samples = [];
        const maxOffset = this.duration;
        const step = this.sampleInterval;

        for (let t = maxOffset; t >= 0; t -= step) {
            const sampleFrame = frame - t * fps;
            const pos = this.getPositionAtFrame(sampleFrame);
            if (!pos) continue;

            if (wind) {
                const windPerFrame = wind.v(frame);
                pos.add(windPerFrame.multiplyScalar(t * fps));
            }

            samples.push({pos, elapsed: t});
        }

        // Include current position exactly if loop didn't land on t=0
        const lastT = maxOffset % step;
        if (lastT !== 0) {
            const pos = this.getPositionAtFrame(frame);
            if (pos) samples.push({pos, elapsed: 0});
        }

        if (samples.length < 2) return;

        // Compute horizontal wind direction (constant for all points, used for spread)
        let windDir = null;
        if (wind && this.spread > 0) {
            const refPos = samples[Math.floor(samples.length / 2)].pos;
            const windVec = wind.v(frame);
            const up = getLocalUpVector(refPos);
            windDir = windVec.clone().sub(up.clone().multiplyScalar(windVec.dot(up)));
            if (windDir.lengthSq() > 1e-10) {
                windDir.normalize();
            } else {
                windDir = null;
            }
        }

        // Compute midpoint for float precision
        const mid = V3(0, 0, 0);
        for (const s of samples) mid.add(s.pos);
        mid.divideScalar(samples.length);

        // Pre-compute per-point left/right edge positions.
        // Shared between adjacent quads so there are no gaps.
        const edges = [];

        for (let i = 0; i < samples.length; i++) {
            const p = samples[i].pos;
            const elapsed = samples[i].elapsed;

            // Per-point travel direction: average of adjacent segments for smooth edges
            let dir;
            if (i === 0) {
                dir = samples[1].pos.clone().sub(p);
            } else if (i === samples.length - 1) {
                dir = p.clone().sub(samples[i - 1].pos);
            } else {
                dir = samples[i + 1].pos.clone().sub(samples[i - 1].pos);
            }
            if (dir.lengthSq() < 1e-8) continue;
            dir.normalize();

            const up = getLocalUpVector(p);
            const perp = V3().crossVectors(dir, up).normalize();

            // Base half-width perpendicular to travel
            const baseHW = this.ribbonWidth / 2;

            // Spread half-width in wind direction
            const spreadHW = this.spread * elapsed / 2;

            let leftOffset, rightOffset;
            if (windDir && spreadHW > 0) {
                // Combine base perpendicular width + spread in wind direction
                const baseOffset = perp.clone().multiplyScalar(baseHW);
                const spreadOffset = windDir.clone().multiplyScalar(spreadHW);
                leftOffset = baseOffset.clone().negate().sub(spreadOffset);
                rightOffset = baseOffset.clone().add(spreadOffset);
            } else {
                // No wind or no spread: just perpendicular width
                leftOffset = perp.clone().multiplyScalar(-baseHW);
                rightOffset = perp.clone().multiplyScalar(baseHW);
            }

            edges.push({
                left: V3(p.x - mid.x + leftOffset.x, p.y - mid.y + leftOffset.y, p.z - mid.z + leftOffset.z),
                right: V3(p.x - mid.x + rightOffset.x, p.y - mid.y + rightOffset.y, p.z - mid.z + rightOffset.z),
            });
        }

        if (edges.length < 2) return;

        // Build quads from shared edge positions (seamless, no gaps)
        const vertices = [];

        for (let i = 0; i < edges.length - 1; i++) {
            const e1 = edges[i];
            const e2 = edges[i + 1];

            // Triangle 1: e1.left, e2.left, e2.right
            vertices.push(e1.left.x, e1.left.y, e1.left.z);
            vertices.push(e2.left.x, e2.left.y, e2.left.z);
            vertices.push(e2.right.x, e2.right.y, e2.right.z);

            // Triangle 2: e1.left, e2.right, e1.right
            vertices.push(e1.left.x, e1.left.y, e1.left.z);
            vertices.push(e2.right.x, e2.right.y, e2.right.z);
            vertices.push(e1.right.x, e1.right.y, e1.right.z);
        }

        if (vertices.length === 0) return;

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(vertices), 3));
        geometry.computeVertexNormals();

        this.mesh = new THREE.Mesh(geometry, this.material);
        this.mesh.position.set(mid.x, mid.y, mid.z);
        this.group.add(this.mesh);
        this.propagateLayerMask();
    }
}
