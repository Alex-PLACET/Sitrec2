/**
 * SitrecBridge — Page Bridge
 *
 * Injected into the Sitrec page's MAIN WORLD (not the content script isolated world).
 * This script has direct access to all Sitrec globals:
 *   window.NodeMan, window.Sit, window.Globals, window.par,
 *   window.FileManager, window.LocalFrame, window.GlobalScene, etc.
 *
 * Receives commands from content-script.js via window.postMessage,
 * executes them against Sitrec's API, and sends results back.
 */

// ── MCP Debug Mode ──────────────────────────────────────────────────────────
// Tell Sitrec's assert() to capture asserts instead of hitting debugger.
// Asserts are collected in window._mcpAsserts and drained after each handler call.
window._mcpDebug = true;
window._mcpAsserts = [];

function drainAsserts() {
    const asserts = window._mcpAsserts;
    window._mcpAsserts = [];
    return asserts.length > 0 ? asserts : null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function isSitrecReady() {
    const el = document.getElementById("sitrec-objects-ready");
    return el && el.dataset.ready === "complete";
}

/**
 * Safely serialize a value, handling Three.js objects, circular refs, etc.
 */
function safeSerialize(val, depth = 0) {
    if (depth > 4) return "[max depth]";
    if (val === undefined) return undefined;
    if (val === null) return null;
    if (typeof val === "number" || typeof val === "boolean" || typeof val === "string") return val;

    // Three.js Vector3, Vector2, Euler, etc.
    if (val.isVector3) return { x: val.x, y: val.y, z: val.z, _type: "Vector3" };
    if (val.isVector2) return { x: val.x, y: val.y, _type: "Vector2" };
    if (val.isEuler) return { x: val.x, y: val.y, z: val.z, order: val.order, _type: "Euler" };
    if (val.isQuaternion) return { x: val.x, y: val.y, z: val.z, w: val.w, _type: "Quaternion" };
    if (val.isMatrix4) return { elements: Array.from(val.elements), _type: "Matrix4" };
    if (val.isColor) return { r: val.r, g: val.g, b: val.b, _type: "Color" };

    // Arrays
    if (Array.isArray(val)) {
        return val.slice(0, 100).map((v) => safeSerialize(v, depth + 1));
    }

    // Plain objects
    if (typeof val === "object") {
        const out = {};
        const keys = Object.keys(val).slice(0, 50);
        for (const k of keys) {
            try {
                out[k] = safeSerialize(val[k], depth + 1);
            } catch {
                out[k] = "[unserializable]";
            }
        }
        return out;
    }

    return String(val);
}

// ── Action Handlers ─────────────────────────────────────────────────────────

const handlers = {
    sitrec_get_sitch() {
        const Sit = window.Sit;
        if (!Sit) return { error: "Sit not available" };
        return {
            name: Sit.name,
            menuName: Sit.menuName,
            frames: Sit.frames,
            fps: Sit.fps,
            duration: Sit.frames / Sit.fps,
            lat: Sit.lat,
            lon: Sit.lon,
            alt: Sit.alt,
            startTime: Sit.startTime,
            isCustom: Sit.isCustom,
            canMod: Sit.canMod,
            buildTime: document.lastModified,
        };
    },

    async sitrec_load_sitch({ name }) {
        if (!name) return { error: "Missing 'name' parameter" };
        if (typeof window.newSitch !== "function") {
            return { error: "newSitch function not available" };
        }
        try {
            await window.newSitch(name);
            return { loaded: name, success: true };
        } catch (e) {
            return { error: `Failed to load sitch '${name}': ${e.message}` };
        }
    },

    sitrec_list_sitches() {
        const SitchMan = window.Globals?.SitchMan;
        if (!SitchMan) {
            return { error: "SitchMan not available" };
        }
        // SitchMan.sitches is typically a map/object of sitch definitions
        const sitches = SitchMan.sitches || SitchMan.list || {};
        const result = [];
        for (const [key, val] of Object.entries(sitches)) {
            result.push({
                id: key,
                menuName: val.menuName || val.name || key,
                category: val.category,
            });
        }
        return result;
    },

    sitrec_list_nodes({ filter, typeFilter } = {}) {
        const NodeMan = window.NodeMan;
        if (!NodeMan) return { error: "NodeMan not available" };

        const nodes = [];
        const lowerFilter = filter?.toLowerCase();
        const lowerType = typeFilter?.toLowerCase();

        NodeMan.iterate((key, node) => {
            if (lowerFilter && !key.toLowerCase().includes(lowerFilter)) return;
            const className = node.constructor?.name || "CNode";
            if (lowerType && !className.toLowerCase().includes(lowerType)) return;

            nodes.push({
                id: key,
                type: className,
                visible: node.visible !== false,
                inputCount: node.inputs ? Object.keys(node.inputs).length : 0,
                outputCount: node.outputs ? node.outputs.length : 0,
            });
        });

        return { count: nodes.length, nodes };
    },

    sitrec_get_node({ id, frame } = {}) {
        const NodeMan = window.NodeMan;
        if (!NodeMan) return { error: "NodeMan not available" };
        if (!id) return { error: "Missing 'id' parameter" };

        const node = NodeMan.get(id);
        if (!node) return { error: `Node '${id}' not found` };

        const f = frame ?? window.par?.frame ?? 0;

        const inputs = {};
        if (node.inputs) {
            for (const [k, v] of Object.entries(node.inputs)) {
                inputs[k] = v?.id || String(v);
            }
        }

        const outputs = [];
        if (node.outputs) {
            for (const o of node.outputs) {
                outputs.push(o?.id || String(o));
            }
        }

        let value;
        try {
            const raw = node.getValue(f);
            value = safeSerialize(raw);
        } catch (e) {
            value = { error: e.message };
        }

        return {
            id: node.id,
            type: node.constructor?.name || "CNode",
            visible: node.visible !== false,
            inputs,
            outputs,
            frame: f,
            value,
        };
    },

    sitrec_get_frame() {
        const par = window.par;
        const Sit = window.Sit;
        return {
            frame: par?.frame ?? null,
            frames: Sit?.frames ?? null,
            fps: Sit?.fps ?? null,
            paused: par?.paused ?? null,
        };
    },

    sitrec_set_frame({ frame } = {}) {
        if (frame == null) return { error: "Missing 'frame' parameter" };
        const par = window.par;
        if (!par) return { error: "par not available" };
        par.frame = frame;
        par.renderOne = true;
        return { frame: par.frame };
    },

    sitrec_play_pause({ paused } = {}) {
        const par = window.par;
        if (!par) return { error: "par not available" };
        if (paused !== undefined) {
            par.paused = !!paused;
        } else {
            par.paused = !par.paused;
        }
        return { paused: par.paused };
    },

    sitrec_screenshot({ selector, view, quality, maxWidth } = {}) {
        // quality: JPEG quality 0-100 (default 75). Use 100 or "png" for lossless PNG.
        // maxWidth: if set, downscale the captured image to this width (maintains aspect ratio).
        const usePng = quality === "png";
        const jpegQuality = usePng ? undefined : Math.min(100, Math.max(1, Number(quality) || 75)) / 100;
        const mimeType = usePng ? "image/png" : "image/jpeg";
        const dataUrlPrefix = usePng ? /^data:image\/png;base64,/ : /^data:image\/jpeg;base64,/;

        // Helper: optionally downscale a canvas, then export as data URL
        function exportCanvas(srcCanvas) {
            let canvas = srcCanvas;
            if (maxWidth && srcCanvas.width > maxWidth) {
                const scale = maxWidth / srcCanvas.width;
                const offscreen = document.createElement("canvas");
                offscreen.width = Math.round(srcCanvas.width * scale);
                offscreen.height = Math.round(srcCanvas.height * scale);
                const ctx = offscreen.getContext("2d");
                ctx.drawImage(srcCanvas, 0, 0, offscreen.width, offscreen.height);
                canvas = offscreen;
            }
            const dataUrl = usePng ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", jpegQuality);
            const imageData = dataUrl.replace(dataUrlPrefix, "");
            return { imageData, mimeType };
        }

        // If a view name is given (e.g. "mainView", "lookView"), render that
        // view's renderer and capture its canvas directly. This works even when
        // preserveDrawingBuffer is false because we capture synchronously after render.
        const viewName = view || "mainView";
        const viewNode = window.NodeMan?.get(viewName);
        if (viewNode?.renderer) {
            try {
                // Run the full render pipeline: sky, main scene, then effects
                const frame = Math.floor(window.par?.frame ?? 0);
                if (typeof viewNode.renderSky === "function") viewNode.renderSky();
                if (typeof viewNode.renderCanvas === "function") viewNode.renderCanvas(frame);
                if (typeof viewNode.renderTargetAndEffects === "function") viewNode.renderTargetAndEffects();
            } catch (e) {
                return { error: `Render error during screenshot: ${e.message}` };
            }
            return exportCanvas(viewNode.renderer.domElement);
        }

        // Fallback: try a CSS selector
        const sel = selector || "canvas";
        const canvas = document.querySelector(sel);
        if (!canvas) return { error: `No element found for selector '${sel}'` };

        if (canvas.tagName === "CANVAS") {
            return exportCanvas(canvas);
        }

        return { error: "Selected element is not a canvas. Use 'canvas' selector." };
    },

    sitrec_eval({ expression } = {}) {
        if (!expression) return { error: "Missing 'expression' parameter" };
        try {
            // Evaluate in page context with access to all globals
            const result = new Function(`return (${expression})`)();
            return { result: safeSerialize(result) };
        } catch (e) {
            return { error: `Eval error: ${e.message}` };
        }
    },

    sitrec_api_call({ fn, args } = {}) {
        if (!fn) return { error: "Missing 'fn' parameter" };
        const api = window.sitrecAPI;
        if (!api) return { error: "sitrecAPI not available (page may need rebuilding)" };
        try {
            const result = api.handleAPICall({ fn, args: args || {} });
            return safeSerialize(result);
        } catch (e) {
            return { error: `API call error: ${e.message}` };
        }
    },

    sitrec_api_list() {
        const api = window.sitrecAPI;
        if (!api) return { error: "sitrecAPI not available (page may need rebuilding)" };
        try {
            return safeSerialize(api.getFullDocumentation());
        } catch (e) {
            return { error: `API list error: ${e.message}` };
        }
    },
};

// ── Message Listener ────────────────────────────────────────────────────────

window.addEventListener("message", async (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.source !== "sitrec-bridge-content") return;

    const { reqId, action, params } = event.data;

    // Check readiness for most actions (eval and status are allowed before ready)
    if (action !== "sitrec_eval" && !isSitrecReady()) {
        window.postMessage(
            {
                source: "sitrec-bridge-page",
                reqId,
                error: "Sitrec is not ready yet. Wait for the page to finish loading.",
            },
            "*"
        );
        return;
    }

    const handler = handlers[action];
    if (!handler) {
        window.postMessage(
            {
                source: "sitrec-bridge-page",
                reqId,
                error: `Unknown action: ${action}`,
            },
            "*"
        );
        return;
    }

    try {
        const result = await handler(params || {});
        const asserts = drainAsserts();
        const response = { source: "sitrec-bridge-page", reqId, result };
        if (asserts) response.asserts = asserts;
        window.postMessage(response, "*");
    } catch (e) {
        const asserts = drainAsserts();
        const response = { source: "sitrec-bridge-page", reqId, error: e.message };
        if (asserts) response.asserts = asserts;
        window.postMessage(response, "*");
    }
});

console.log("[SitrecBridge] Page bridge loaded");
