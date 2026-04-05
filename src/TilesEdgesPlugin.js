// Plugin for 3d-tiles-renderer that enables shader-based wireframe edge
// rendering via barycentric coordinates.  Each triangle gets (1,0,0),
// (0,1,0), (0,0,1) assigned to its three vertices; the fragment shader
// detects proximity to an edge and draws a thin line.
//
// Internal triangulation edges (the diagonal of a quad split into two
// triangles) are detected via coplanar adjacency and suppressed so that
// only real polygon edges are drawn.
//
// No extra geometry objects are created — edges are rendered in the same
// draw call as the filled polygons, with correct occlusion and zero
// z-fighting.

import {Float32BufferAttribute, Vector3} from "three";
import {sharedUniforms} from "./js/map33/material/SharedUniforms";

const BARY_ADDED = Symbol("TilesEdges_baryAdded");

export class TilesEdgesPlugin {
    constructor() {
        this.tiles = null;
    }

    init(tiles) {
        this.tiles = tiles;
    }

    processTileModel(scene) {
        scene.traverse(child => {
            if (child.isMesh && child.geometry && !child.geometry[BARY_ADDED]) {
                addBarycentricAttribute(child.geometry);
            }
        });
    }

    setVisible(v) {
        sharedUniforms.showBuildingEdges.value = v;
    }

    dispose() {
        this.tiles = null;
    }
}

// Quantise a float position component to an integer key.
// Tile vertex coordinates are typically in the low thousands so
// multiplying by 100 gives sub-millimetre precision — plenty to
// match shared vertices reliably while avoiding FP noise.
function quantise(v) {
    return Math.round(v * 100);
}

function edgeKey(ax, ay, az, bx, by, bz) {
    const a0 = quantise(ax), a1 = quantise(ay), a2 = quantise(az);
    const b0 = quantise(bx), b1 = quantise(by), b2 = quantise(bz);
    // Canonical order: smaller vertex first
    if (a0 < b0 || (a0 === b0 && (a1 < b1 || (a1 === b1 && a2 < b2)))) {
        return `${a0},${a1},${a2}|${b0},${b1},${b2}`;
    }
    return `${b0},${b1},${b2}|${a0},${a1},${a2}`;
}

/**
 * Add a vec3 `barycentric` attribute to the geometry with internal
 * triangulation edges suppressed.
 */
function addBarycentricAttribute(geometry) {
    if (geometry[BARY_ADDED]) return;

    // De-index if necessary
    if (geometry.index !== null) {
        const nonIndexed = geometry.toNonIndexed();
        geometry.index = null;
        for (const key in nonIndexed.attributes) {
            geometry.setAttribute(key, nonIndexed.attributes[key]);
        }
        if (nonIndexed.morphAttributes) {
            for (const key in nonIndexed.morphAttributes) {
                geometry.morphAttributes[key] = nonIndexed.morphAttributes[key];
            }
        }
        geometry.groups = nonIndexed.groups;
    }

    const posAttr = geometry.attributes.position;
    if (!posAttr) return;

    const pos = posAttr.array;
    const count = posAttr.count;
    const triCount = (count / 3) | 0;

    // --- 1. Compute face normals ---
    const normals = new Float32Array(triCount * 3);
    const ab = new Vector3(), ac = new Vector3(), n = new Vector3();
    for (let t = 0; t < triCount; t++) {
        const i = t * 9; // 3 vertices * 3 components
        ab.set(pos[i+3] - pos[i], pos[i+4] - pos[i+1], pos[i+5] - pos[i+2]);
        ac.set(pos[i+6] - pos[i], pos[i+7] - pos[i+1], pos[i+8] - pos[i+2]);
        n.crossVectors(ab, ac).normalize();
        normals[t * 3] = n.x;
        normals[t * 3 + 1] = n.y;
        normals[t * 3 + 2] = n.z;
    }

    // --- 2. Build edge-to-triangle adjacency map ---
    // Each edge maps to an array of {tri, localEdgeIndex} entries.
    // localEdgeIndex: 0 = edge v0-v1 (opposite v2), 1 = edge v1-v2 (opposite v0), 2 = edge v2-v0 (opposite v1)
    const edgeMap = new Map();
    for (let t = 0; t < triCount; t++) {
        const base = t * 9;
        const verts = [
            [pos[base], pos[base+1], pos[base+2]],
            [pos[base+3], pos[base+4], pos[base+5]],
            [pos[base+6], pos[base+7], pos[base+8]],
        ];
        const edges = [
            [0, 1], // localEdge 0 (opposite v2)
            [1, 2], // localEdge 1 (opposite v0)
            [2, 0], // localEdge 2 (opposite v1)
        ];
        for (let e = 0; e < 3; e++) {
            const [a, b] = edges[e];
            const key = edgeKey(
                verts[a][0], verts[a][1], verts[a][2],
                verts[b][0], verts[b][1], verts[b][2]
            );
            let list = edgeMap.get(key);
            if (!list) {
                list = [];
                edgeMap.set(key, list);
            }
            list.push({tri: t, localEdge: e});
        }
    }

    // --- 3. Find internal edges (shared by two coplanar triangles) ---
    // suppressEdge[tri * 3 + localEdge] = true if that edge should be hidden
    const suppressEdge = new Uint8Array(triCount * 3);
    const COPLANAR_THRESHOLD = 0.99; // dot product threshold (~8 degrees)

    for (const list of edgeMap.values()) {
        if (list.length !== 2) continue;
        const {tri: t0, localEdge: e0} = list[0];
        const {tri: t1, localEdge: e1} = list[1];
        // Compare face normals
        const dot =
            normals[t0 * 3]     * normals[t1 * 3] +
            normals[t0 * 3 + 1] * normals[t1 * 3 + 1] +
            normals[t0 * 3 + 2] * normals[t1 * 3 + 2];
        if (Math.abs(dot) > COPLANAR_THRESHOLD) {
            suppressEdge[t0 * 3 + e0] = 1;
            suppressEdge[t1 * 3 + e1] = 1;
        }
    }

    // --- 4. Assign barycentric coordinates with suppression ---
    // Standard assignment: v0=(1,0,0), v1=(0,1,0), v2=(0,0,1)
    // Edge opposite v2 (localEdge 0, v0-v1): detected by bary.z → 0
    //   → to suppress: raise v0.z and v1.z
    // Edge opposite v0 (localEdge 1, v1-v2): detected by bary.x → 0
    //   → to suppress: raise v1.x and v2.x
    // Edge opposite v1 (localEdge 2, v2-v0): detected by bary.y → 0
    //   → to suppress: raise v2.y and v0.y
    const bary = new Float32Array(count * 3);
    for (let t = 0; t < triCount; t++) {
        const v0 = t * 3;      // vertex indices
        const v1 = v0 + 1;
        const v2 = v0 + 2;

        // Start with standard barycentrics
        bary[v0 * 3] = 1; bary[v0 * 3 + 1] = 0; bary[v0 * 3 + 2] = 0;
        bary[v1 * 3] = 0; bary[v1 * 3 + 1] = 1; bary[v1 * 3 + 2] = 0;
        bary[v2 * 3] = 0; bary[v2 * 3 + 1] = 0; bary[v2 * 3 + 2] = 1;

        // Suppress internal edges by raising the relevant component
        if (suppressEdge[t * 3 + 0]) {
            // Suppress edge v0-v1 (opposite v2): raise z of v0 and v1
            bary[v0 * 3 + 2] = 1;
            bary[v1 * 3 + 2] = 1;
        }
        if (suppressEdge[t * 3 + 1]) {
            // Suppress edge v1-v2 (opposite v0): raise x of v1 and v2
            bary[v1 * 3] = 1;
            bary[v2 * 3] = 1;
        }
        if (suppressEdge[t * 3 + 2]) {
            // Suppress edge v2-v0 (opposite v1): raise y of v2 and v0
            bary[v2 * 3 + 1] = 1;
            bary[v0 * 3 + 1] = 1;
        }
    }

    geometry.setAttribute("barycentric", new Float32BufferAttribute(bary, 3));
    geometry[BARY_ADDED] = true;
}
