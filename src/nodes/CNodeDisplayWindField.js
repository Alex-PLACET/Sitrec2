// Wind field visualization with animated streamlines on the globe.
// Uses GPU-efficient shader animation: a frame counter offsets a dash pattern
// along each streamline, creating a flowing effect without per-frame geometry updates.

import {CNode3DGroup} from "./CNode3DGroup";
import {LLAToECEF} from "../LLA-ECEF-ENU";
import {sharedUniforms} from "../js/map33/material/SharedUniforms";
import {GlobalDateTimeNode, Sit} from "../Globals";
import * as LAYER from "../LayerMasks";
import {
    BufferAttribute, BufferGeometry, LineSegments,
    ShaderMaterial,
} from "three";
import {setRenderOne} from "../Globals";

const R_EARTH = 6371000; // meters
const DEG = Math.PI / 180;

// Pressure-level ↔ altitude mapping (approximate standard atmosphere)
export const WIND_LEVEL_TABLE = [
    {hPa: 1000, ft: 360,   label: "1,000 hPa (~360 ft)"},
    {hPa: 925,  ft: 2500,  label: "925 hPa (~2,500 ft)"},
    {hPa: 850,  ft: 4800,  label: "850 hPa (~4,800 ft)"},
    {hPa: 700,  ft: 9900,  label: "700 hPa (~9,900 ft)"},
    {hPa: 500,  ft: 18300, label: "500 hPa (~18,300 ft)"},
    {hPa: 300,  ft: 30000, label: "300 hPa (~30,000 ft)"},
    {hPa: 250,  ft: 33800, label: "250 hPa (~33,800 ft)"},
    {hPa: 200,  ft: 38600, label: "200 hPa (~38,600 ft)"},
];

export function altFeetToLevel(ft) {
    if (ft < 500) return "surface";
    for (let i = 0; i < WIND_LEVEL_TABLE.length - 1; i++) {
        if (ft <= WIND_LEVEL_TABLE[i + 1].ft) {
            const d0 = Math.abs(ft - WIND_LEVEL_TABLE[i].ft);
            const d1 = Math.abs(ft - WIND_LEVEL_TABLE[i + 1].ft);
            return String(d0 < d1 ? WIND_LEVEL_TABLE[i].hPa : WIND_LEVEL_TABLE[i + 1].hPa);
        }
    }
    return String(WIND_LEVEL_TABLE[WIND_LEVEL_TABLE.length - 1].hPa);
}

export function levelToAltFeet(level) {
    if (level === "surface") return 33;  // ~10m
    const hPa = parseInt(level);
    const entry = WIND_LEVEL_TABLE.find(e => e.hPa === hPa);
    return entry ? entry.ft : 0;
}

export class CNodeDisplayWindField extends CNode3DGroup {
    constructor(v) {
        super(v);

        // Wind grid (flat Float32Arrays, row-major, north-to-south)
        this.windU = null;
        this.windV = null;
        this.gridNx = 0;
        this.gridNy = 0;
        this.gridLon0 = 0;
        this.gridLat0 = 90;
        this.gridDLon = 1;
        this.gridDLat = -1;

        // Tunables
        this.renderAltitude = v.altitude       ?? 2000;
        this.seedSpacing    = v.seedSpacing    ?? 1.5;
        this.steps          = v.steps          ?? 24;
        this.dtSeconds      = v.dtSeconds      ?? 3000;
        this.numDashes      = v.numDashes      ?? 6;
        this.flowSpeed      = v.flowSpeed      ?? 0.006;
        this.lineOpacity    = v.lineOpacity    ?? 0.9;
        this.maxWindSpeed   = v.maxWindSpeed   ?? 30;
        this.minSpeedCutoff = v.minSpeedCutoff ?? 0.5;

        this.windLevel      = "surface";
        this.statusText     = "Not loaded";

        this.frameCount = 0;
        this.linesMesh = null;
        this.dataSource = "none";
        this.fetching = false;

        // ---------- shader material ----------
        this.material = new ShaderMaterial({
            uniforms: {
                uTime:      {value: 0},
                uNumDashes: {value: this.numDashes},
                uFlowSpeed: {value: this.flowSpeed},
                uOpacity:   {value: this.lineOpacity},
                uMaxSpeed:  {value: this.maxWindSpeed},
                ...sharedUniforms,
            },
            vertexShader: VERT,
            fragmentShader: FRAG,
            transparent: true,
            depthTest: false,
            depthWrite: false,
        });

        // visible in main view only (not look view)
        this.group.layers.mask = LAYER.MASK_MAIN;
        this.propagateLayerMask();

        // GUI is created externally (from CustomSupport.js)
        // — the node just exposes the properties and methods

        this.simpleSerials.push("visible", "seedSpacing", "lineOpacity",
            "flowSpeed", "numDashes", "maxWindSpeed", "renderAltitude");

        // Add to Show/Hide menu
        this.showHider("Wind Field");
    }

    // ── bilinear wind lookup ─────────────────────────────────────────
    sampleWind(lat, lon) {
        lon = ((lon % 360) + 360) % 360;
        lat = Math.max(-90, Math.min(90, lat));

        const fi = (lon - this.gridLon0) / this.gridDLon;
        const fj = (lat - this.gridLat0) / this.gridDLat;

        let i0 = Math.floor(fi);
        let j0 = Math.floor(fj);
        const si = fi - i0;
        const sj = fj - j0;

        i0 = ((i0 % this.gridNx) + this.gridNx) % this.gridNx;
        const i1 = (i0 + 1) % this.gridNx;
        j0 = Math.max(0, Math.min(j0, this.gridNy - 2));
        const j1 = j0 + 1;

        const w00 = (1 - si) * (1 - sj);
        const w10 = si * (1 - sj);
        const w01 = (1 - si) * sj;
        const w11 = si * sj;

        const idx00 = j0 * this.gridNx + i0;
        const idx10 = j0 * this.gridNx + i1;
        const idx01 = j1 * this.gridNx + i0;
        const idx11 = j1 * this.gridNx + i1;

        return {
            u: w00 * this.windU[idx00] + w10 * this.windU[idx10]
             + w01 * this.windU[idx01] + w11 * this.windU[idx11],
            v: w00 * this.windV[idx00] + w10 * this.windV[idx10]
             + w01 * this.windV[idx01] + w11 * this.windV[idx11],
        };
    }

    setGridParams(nx, ny, lon0, lat0, dlon, dlat) {
        this.gridNx = nx; this.gridNy = ny;
        this.gridLon0 = lon0; this.gridLat0 = lat0;
        this.gridDLon = dlon; this.gridDLat = dlat;
    }

    // ── trace one streamline, appending vertices to the output arrays ──
    _traceStreamline(seedLat, seedLon, lodLevel, lineIndex, alt, center, out) {
        const steps = this.steps;
        const dt    = this.dtSeconds;
        const minSpd = this.minSpeedCutoff;

        let cLat = seedLat, cLon = seedLon;
        const pts = [];
        const spds = [];

        for (let s = 0; s <= steps; s++) {
            const w = this.sampleWind(cLat, cLon);
            const speed = Math.sqrt(w.u * w.u + w.v * w.v);
            if (speed < minSpd && s === 0) return lineIndex;

            const ecef = LLAToECEF(cLat, cLon, alt);
            pts.push(ecef.x - center.x, ecef.y - center.y, ecef.z - center.z);
            spds.push(speed);

            if (s < steps && speed >= minSpd) {
                const cosLat = Math.cos(cLat * DEG);
                if (Math.abs(cosLat) < 0.01) break;
                cLat += (w.v * dt / R_EARTH) / DEG;
                cLon += (w.u * dt / (R_EARTH * cosLat)) / DEG;
                cLat = Math.max(-89, Math.min(89, cLat));
                cLon = ((cLon % 360) + 360) % 360;
            }
        }

        if (pts.length < 6) return lineIndex;

        const nPts = pts.length / 3;
        const lineId = (lineIndex * 0.6180339887) % 1.0;

        for (let s = 0; s < nPts - 1; s++) {
            const t0 = s / (nPts - 1);
            const t1 = (s + 1) / (nPts - 1);
            const speed = (spds[s] + spds[s + 1]) * 0.5;
            const base = s * 3;

            out.pos.push(pts[base], pts[base + 1], pts[base + 2]);
            out.pos.push(pts[base + 3], pts[base + 4], pts[base + 5]);
            out.prog.push(t0, t1);
            out.id.push(lineId, lineId);
            out.spd.push(speed, speed);
            out.lod.push(lodLevel, lodLevel);
        }
        return lineIndex + 1;
    }

    // ── streamline geometry with multi-LOD ───────────────────────────
    rebuildStreamlines() {
        if (this.linesMesh) {
            this.group.remove(this.linesMesh);
            this.linesMesh.geometry.dispose();
            this.linesMesh = null;
        }
        if (!this.windU) return;

        const alt    = this.renderAltitude;
        const center = LLAToECEF(0, 0, alt);
        const out    = {pos: [], prog: [], id: [], spd: [], lod: []};
        let lineIndex = 0;

        // 4-level LOD: coarse seeds always visible, finer seeds fade in near camera
        //   LOD 0: spacing × 2   (always visible)
        //   LOD 1: spacing × 1   (visible within ~15,000 km)
        //   LOD 2: spacing × 0.5 (visible within ~8,000 km)
        //   LOD 3: spacing × 0.25 (visible within ~4,000 km)
        const baseSpacing = this.seedSpacing;
        const spacings = [baseSpacing * 2, baseSpacing, baseSpacing * 0.5, baseSpacing * 0.25];

        // Track which grid cells already have a seed from a coarser level
        const seeded = new Set();
        const finest = spacings[spacings.length - 1];

        for (let lod = 0; lod < spacings.length; lod++) {
            const sp = spacings[lod];
            for (let lat0 = -85; lat0 <= 85; lat0 += sp) {
                const row = Math.round((lat0 + 85) / sp);
                const lonOff = (row % 2) ? sp * 0.5 : 0;
                for (let lon0 = 0; lon0 < 360; lon0 += sp) {
                    // Quantise to the finest grid cell to de-duplicate across LOD levels
                    const qLat = Math.round(lat0 / finest);
                    const qLon = Math.round(lon0 / finest);
                    const key = qLat * 100000 + qLon;
                    if (seeded.has(key)) continue;
                    seeded.add(key);

                    // Jitter
                    const jHash = Math.sin(lat0 * 127.1 + lon0 * 311.7) * 43758.5453;
                    const jitter = (jHash - Math.floor(jHash)) * sp * 0.4;
                    const sLat = lat0 + jitter * 0.3;
                    const sLon = lon0 + lonOff + jitter;

                    lineIndex = this._traceStreamline(sLat, sLon, lod, lineIndex, alt, center, out);
                }
            }
        }

        if (out.pos.length === 0) return;

        const geom = new BufferGeometry();
        geom.setAttribute("position",     new BufferAttribute(new Float32Array(out.pos),  3));
        geom.setAttribute("lineProgress", new BufferAttribute(new Float32Array(out.prog), 1));
        geom.setAttribute("lineId",       new BufferAttribute(new Float32Array(out.id),   1));
        geom.setAttribute("windSpeed",    new BufferAttribute(new Float32Array(out.spd),  1));
        geom.setAttribute("lodLevel",     new BufferAttribute(new Float32Array(out.lod),  1));
        geom.computeBoundingSphere();

        this.linesMesh = new LineSegments(geom, this.material);
        this.linesMesh.position.set(center.x, center.y, center.z);
        this.linesMesh.layers.mask = this.group.layers.mask;
        this.linesMesh.raycast = () => {};   // skip raycasting on millions of segments
        this.linesMesh.frustumCulled = false; // globe-spanning geometry, always draw
        this.group.add(this.linesMesh);

        const lodCounts = [0, 0, 0];
        out.lod.forEach(l => lodCounts[l]++);
        console.log(`Wind field: ${lineIndex} streamlines, ${out.pos.length / 3} verts ` +
            `(LOD0: ${lodCounts[0] / 2}, LOD1: ${lodCounts[1] / 2}, LOD2: ${lodCounts[2] / 2})`);
    }

    // ── real data fetch ──────────────────────────────────────────────
    async fetchWindData(level) {
        if (this.fetching) return;
        this.fetching = true;

        level = level ?? "surface";
        const dateNode = GlobalDateTimeNode;
        const dateNow = dateNode?.dateNow ?? new Date();
        const dateStr = dateNow.toISOString().slice(0, 10).replace(/-/g, "");
        const hour = Math.floor(dateNow.getUTCHours() / 6) * 6;

        const levelLabel = level === "surface" ? "10m / Surface" : `${level} hPa (~${levelToAltFeet(level).toLocaleString()} ft)`;
        this.statusText = `Fetching ${levelLabel}...`;
        console.log(`Fetching wind: ${dateStr} ${hour}Z level=${level}`);

        try {
            const url = `sitrecServer/windProxy.php?date=${dateStr}&hour=${hour}&level=${level}`;
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const json = await resp.json();

            if (json.error) throw new Error(json.error);
            if (!json.u || !json.v) throw new Error("Missing u/v arrays");

            this.setGridParams(json.nx, json.ny, json.lon0, json.lat0, json.dlon, json.dlat);
            this.windU = new Float32Array(json.u);
            this.windV = new Float32Array(json.v);
            this.dataSource = json.source ?? "GFS";
            this.windLevel = level;

            // Auto-scale render altitude based on data level
            const altFt = levelToAltFeet(level);
            this.renderAltitude = Math.max(500, altFt * 0.3048 * 0.3);

            this.rebuildStreamlines();
            setRenderOne(true);

            this.statusText = `GFS ${json.refTime?.slice(0, 10) ?? dateStr} ${levelLabel}`;
            console.log(`Wind loaded: ${json.nx}x${json.ny} from ${json.source}`);
        } catch (err) {
            console.error("Wind fetch failed:", err);
            this.statusText = `Error: ${err.message}`;
        } finally {
            this.fetching = false;
        }
    }

    // ── per-frame update ─────────────────────────────────────────────
    update(frame) {
        super.update(frame);
        this.frameCount++;
        this.material.uniforms.uTime.value = this.frameCount;
    }

    dispose() {
        if (this.linesMesh) {
            this.linesMesh.geometry.dispose();
        }
        this.material.dispose();
        super.dispose();
    }
}


// ═══════════════════════════════════════════════════════════════════
//  GLSL Shaders
// ═══════════════════════════════════════════════════════════════════

const VERT = /* glsl */ `
    attribute float lineProgress;
    attribute float lineId;
    attribute float windSpeed;
    attribute float lodLevel;

    varying float vProgress;
    varying float vId;
    varying float vSpeed;
    varying float vDepth;
    varying float vLod;
    varying float vCamDist;
    varying float vBackFace;

    void main() {
        vProgress = lineProgress;
        vId       = lineId;
        vSpeed    = windSpeed;
        vLod      = lodLevel;

        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vCamDist  = length(mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
        vDepth = gl_Position.w;

        // back-face detection: dot(surface normal, view direction)
        // positive = facing away from camera (far side of globe)
        vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        vec3 surfaceNormal = normalize(worldPos);
        vec3 viewDir = normalize(worldPos - cameraPosition);
        vBackFace = dot(surfaceNormal, viewDir);
    }
`;

const FRAG = /* glsl */ `
    uniform float uTime;
    uniform float uNumDashes;
    uniform float uFlowSpeed;
    uniform float uOpacity;
    uniform float uMaxSpeed;
    uniform float nearPlane;
    uniform float farPlane;

    varying float vProgress;
    varying float vId;
    varying float vSpeed;
    varying float vDepth;
    varying float vLod;
    varying float vCamDist;
    varying float vBackFace;

    vec3 hsv(float h, float s, float v) {
        vec3 c = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
        return v * mix(vec3(1.0), c, s);
    }

    void main() {
        // discard back-facing fragments (far side of globe)
        if (vBackFace > 0.0) discard;

        // ── per-vertex LOD fade based on camera distance ──
        // LOD 0 (coarsest): always visible
        // LOD 1:            fade in within 15,000 km
        // LOD 2:            fade in within 8,000 km
        // LOD 3 (finest):   fade in within 4,000 km
        float lodFade = 1.0;
        if (vLod > 0.5) lodFade *= smoothstep(15000000.0, 10000000.0, vCamDist);
        if (vLod > 1.5) lodFade *= smoothstep(8000000.0,  5000000.0, vCamDist);
        if (vLod > 2.5) lodFade *= smoothstep(4000000.0,  2500000.0, vCamDist);
        if (lodFade < 0.01) discard;

        // animated dash — long bright segments with short dim gaps
        float phase = fract(vProgress * uNumDashes - uTime * uFlowSpeed + vId);
        float dash  = smoothstep(0.0, 0.08, phase) * smoothstep(0.75, 0.65, phase);
        dash = 0.15 + 0.85 * dash;

        // fade at streamline endpoints
        float endFade = smoothstep(0.0, 0.08, vProgress) * smoothstep(1.0, 0.92, vProgress);

        // wind-speed color ramp (blue -> cyan -> green -> yellow -> red)
        float t = clamp(vSpeed / uMaxSpeed, 0.0, 1.0);
        float hue = (1.0 - t) * 0.65;
        vec3 color = hsv(hue, 0.8, 0.8 + 0.2 * t);

        float alpha = dash * endFade * uOpacity * lodFade;
        if (alpha < 0.01) discard;

        gl_FragColor = vec4(color, alpha);

        // logarithmic depth (matches Sitrec convention)
        float z = (log2(max(nearPlane, 1.0 + vDepth)) / log2(1.0 + farPlane)) * 2.0 - 1.0;
        gl_FragDepthEXT = z * 0.5 + 0.5;
    }
`;
