#!/usr/bin/env node
/**
 * SitrecBridge MCP Server
 *
 * Bridges MCP clients (Claude Code, Claude Desktop, etc.) to a running Sitrec
 * instance in Chrome via a WebSocket relay to the SitrecBridge Chrome extension.
 *
 * Architecture:
 *   MCP Client <--stdio--> This Server <--WebSocket--> Chrome Extension <--message--> Sitrec Page
 *
 * Multi-session support:
 *   The first MCP server to start becomes the "primary" — it owns the WebSocket
 *   server on the port and the Chrome extension connects to it. Subsequent MCP
 *   servers detect the port is in use and connect as "peer" WebSocket clients to
 *   the primary, which relays their requests to the extension and routes responses
 *   back. This allows multiple Claude Code sessions to share one Sitrec instance.
 *
 * Based on the relay pattern from https://github.com/railsblueprint/blueprint-mcp
 */

import {Server} from "@modelcontextprotocol/sdk/server/index.js";
import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListResourcesRequestSchema,
    ListToolsRequestSchema,
    ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {WebSocket, WebSocketServer} from "ws";
import {readFileSync} from "fs";
import {fileURLToPath} from "url";
import {dirname, join} from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const WS_PORT = parseInt(process.env.SITREC_BRIDGE_PORT || "9780", 10);
const WS_HOST = "127.0.0.1"; // Localhost only — avoids macOS firewall EPERM on 0.0.0.0

// Load the agent guide once at startup
let agentGuide = "";
try {
    agentGuide = readFileSync(join(__dirname, "sitrec-mcp-guide.md"), "utf-8");
} catch (e) {
    agentGuide = "Guide not found. See tools/SitrecBridge/sitrec-mcp-guide.md";
}
const REQUEST_TIMEOUT_MS = 15000;
const KEEPALIVE_INTERVAL_MS = 10000;

// ── Logging (stderr only — stdout is reserved for MCP stdio transport) ──────

function log(...args) {
    console.error("[SitrecBridge]", ...args);
}

// ── WebSocket Relay ─────────────────────────────────────────────────────────
// Supports two modes:
//   "primary" — owns the WebSocket server, extension connects here, relays for peers
//   "secondary" — connects as a client to the primary, sends requests through it

let mode = null;                    // "primary" or "secondary"
let extensionSocket = null;         // Chrome extension connection (primary only)
let primarySocket = null;           // Connection to the primary server (secondary only)
const pendingRequests = new Map();  // id → { resolve, reject, timer }
const peerRequestMap = new Map();   // primaryId → { peerSocket, peerId } (primary only)
let requestCounter = 0;
let keepaliveTimer = null;

// ── Primary Mode ────────────────────────────────────────────────────────────

function startAsPrimary(port) {
    mode = "primary";
    const wss = new WebSocketServer({ host: WS_HOST, port });

    wss.on("listening", () => {
        log(`Primary: WebSocket server listening on ws://localhost:${port}`);
    });

    wss.on("error", (err) => {
        log("WebSocket server error:", err.message);
    });

    wss.on("connection", (ws) => {
        // Wait briefly for a peer identification message.
        // The extension never sends one, so after a short timeout we treat it as extension.
        let identified = false;

        const earlyHandler = (raw) => {
            try {
                const msg = JSON.parse(raw.toString());
                if (msg.type === "peer") {
                    identified = true;
                    ws.removeListener("message", earlyHandler);
                    setupPeerConnection(ws);
                    return;
                }
                if (msg.type === "force-extension") {
                    // User explicitly requested reconnect — replace existing without probing
                    identified = true;
                    ws.removeListener("message", earlyHandler);
                    setupExtensionConnection(ws, true);
                    return;
                }
            } catch {}
            // Not a peer message — treat as extension, but let the normal handler process it
            if (!identified) {
                identified = true;
                ws.removeListener("message", earlyHandler);
                setupExtensionConnection(ws, false);
                // Re-dispatch this message through the extension handler
                handleExtensionMessage(raw);
            }
        };

        ws.on("message", earlyHandler);

        // If no message within 500ms, assume it's the extension
        setTimeout(() => {
            if (!identified) {
                identified = true;
                ws.removeListener("message", earlyHandler);
                setupExtensionConnection(ws, false);
            }
        }, 500);
    });
}

function setupExtensionConnection(ws, force = false) {
    if (extensionSocket && extensionSocket.readyState === WebSocket.OPEN) {
        if (force) {
            // User explicitly requested this connection — replace existing
            log("Primary: Forced reconnect — replacing existing extension");
            extensionSocket.close();
            finishExtensionSetup(ws);
            return;
        }

        // First-come-first-served: reject the newcomer via a message.
        // Do NOT call ws.close() here — let the extension close after receiving
        // the message. Closing server-side risks the close event arriving before
        // the message, which would cause the extension to reconnect (churn).
        log("Primary: Already have an extension — rejecting new connection");
        ws.send(JSON.stringify({ type: "rejected", reason: "Another extension is already connected" }));
        // Clean up after a timeout in case the extension doesn't close promptly
        setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) ws.close();
        }, 5000);
        return;
    }

    finishExtensionSetup(ws);
}

function finishExtensionSetup(ws) {
    extensionSocket = ws;
    log("Primary: Extension connected");

    // Send the source manifest version so the extension can detect if it needs reloading
    try {
        const sourceManifest = JSON.parse(readFileSync(join(__dirname, "extension", "manifest.json"), "utf-8"));
        ws.send(JSON.stringify({ type: "version-info", sourceVersion: sourceManifest.version }));
    } catch (e) {
        log("Primary: Could not read source manifest for version check:", e.message);
    }

    // Keepalive pings to prevent service worker suspension
    clearInterval(keepaliveTimer);
    keepaliveTimer = setInterval(() => {
        if (extensionSocket && extensionSocket.readyState === WebSocket.OPEN) {
            extensionSocket.ping();
        }
    }, KEEPALIVE_INTERVAL_MS);

    ws.on("message", (raw) => handleExtensionMessage(raw));

    ws.on("close", () => {
        log("Primary: Chrome extension disconnected");
        if (extensionSocket === ws) extensionSocket = null;
        clearInterval(keepaliveTimer);

        // Reject all pending requests (both local and peer-relayed)
        for (const [id, pending] of pendingRequests) {
            clearTimeout(pending.timer);
            // Check if this was a peer relay
            const peerMapping = peerRequestMap.get(id);
            if (peerMapping) {
                // Send error back to peer
                try {
                    peerMapping.peerSocket.send(JSON.stringify({
                        id: peerMapping.peerId,
                        error: "Extension disconnected"
                    }));
                } catch {}
                peerRequestMap.delete(id);
            } else {
                pending.reject(new Error("Extension disconnected"));
            }
        }
        pendingRequests.clear();
    });

    ws.on("error", (err) => {
        log("Primary: Extension WebSocket error:", err.message);
    });
}

function handleExtensionMessage(raw) {
    try {
        const msg = JSON.parse(raw.toString());
        if (msg.id != null && pendingRequests.has(msg.id)) {
            const { resolve, timer } = pendingRequests.get(msg.id);
            clearTimeout(timer);
            pendingRequests.delete(msg.id);

            // Check if this was a peer relay — if so, forward response to peer
            const peerMapping = peerRequestMap.get(msg.id);
            if (peerMapping) {
                peerRequestMap.delete(msg.id);
                try {
                    peerMapping.peerSocket.send(JSON.stringify({
                        id: peerMapping.peerId,
                        result: msg.result,
                        error: msg.error,
                    }));
                } catch (e) {
                    log("Primary: Failed to relay response to peer:", e.message);
                }
                // Still resolve the pending promise (it's a no-op resolve for peer relays)
                resolve(msg);
            } else {
                // Local request — resolve normally
                resolve(msg);
            }
        }
    } catch (e) {
        log("Primary: Bad message from extension:", e.message);
    }
}

function setupPeerConnection(ws) {
    log("Primary: Peer MCP server connected");

    ws.on("message", (raw) => {
        try {
            const msg = JSON.parse(raw.toString());
            // Peer is sending a request to relay to the extension
            if (msg.action) {
                relayPeerRequest(ws, msg);
            }
        } catch (e) {
            log("Primary: Bad message from peer:", e.message);
        }
    });

    ws.on("close", () => {
        log("Primary: Peer MCP server disconnected");
        // Clean up any pending peer requests
        for (const [primaryId, mapping] of peerRequestMap) {
            if (mapping.peerSocket === ws) {
                const pending = pendingRequests.get(primaryId);
                if (pending) {
                    clearTimeout(pending.timer);
                    pendingRequests.delete(primaryId);
                }
                peerRequestMap.delete(primaryId);
            }
        }
    });

    ws.on("error", (err) => {
        log("Primary: Peer WebSocket error:", err.message);
    });
}

function relayPeerRequest(peerSocket, msg) {
    if (!extensionSocket || extensionSocket.readyState !== WebSocket.OPEN) {
        peerSocket.send(JSON.stringify({
            id: msg.id,
            error: "Chrome extension is not connected to the primary server."
        }));
        return;
    }

    // Assign a primary-scoped ID and relay to extension
    const primaryId = ++requestCounter;
    peerRequestMap.set(primaryId, { peerSocket, peerId: msg.id });

    const timer = setTimeout(() => {
        pendingRequests.delete(primaryId);
        peerRequestMap.delete(primaryId);
        try {
            peerSocket.send(JSON.stringify({
                id: msg.id,
                error: `Timed out waiting for '${msg.action}' response (${REQUEST_TIMEOUT_MS}ms)`
            }));
        } catch {}
    }, REQUEST_TIMEOUT_MS);

    pendingRequests.set(primaryId, {
        resolve: () => {},  // Peer responses are sent directly in handleExtensionMessage
        reject: () => {},
        timer
    });

    extensionSocket.send(JSON.stringify({
        id: primaryId,
        action: msg.action,
        params: msg.params
    }));
}

// ── Secondary Mode ──────────────────────────────────────────────────────────

function startAsSecondary(port) {
    mode = "secondary";
    log(`Secondary: Connecting to primary on ws://localhost:${port}`);

    function connect() {
        primarySocket = new WebSocket(`ws://localhost:${port}`);

        primarySocket.on("open", () => {
            log("Secondary: Connected to primary server");
            // Identify ourselves as a peer
            primarySocket.send(JSON.stringify({ type: "peer" }));
        });

        primarySocket.on("message", (raw) => {
            try {
                const msg = JSON.parse(raw.toString());
                if (msg.id != null && pendingRequests.has(msg.id)) {
                    const { resolve, timer } = pendingRequests.get(msg.id);
                    clearTimeout(timer);
                    pendingRequests.delete(msg.id);
                    resolve(msg);
                }
            } catch (e) {
                log("Secondary: Bad message from primary:", e.message);
            }
        });

        primarySocket.on("close", () => {
            log("Secondary: Disconnected from primary — attempting promotion...");
            primarySocket = null;
            // Reject all pending
            for (const [id, { reject, timer }] of pendingRequests) {
                clearTimeout(timer);
                reject(new Error("Primary server disconnected"));
            }
            pendingRequests.clear();
            // Try to become primary; if another peer already did, reconnect as secondary
            // Random jitter (300-800ms) to avoid multiple secondaries racing
            setTimeout(tryPromote, 300 + Math.random() * 500);
        });

        primarySocket.on("error", (err) => {
            // Connection refused means no primary — try to promote
            if (err.code === "ECONNREFUSED") {
                log("Secondary: Primary not reachable — attempting promotion...");
                primarySocket = null;
                setTimeout(tryPromote, 300 + Math.random() * 500);
                return;
            }
            log("Secondary: Connection error:", err.message);
        });
    }

    function tryPromote() {
        const testServer = new WebSocketServer({ host: WS_HOST, port });
        testServer.on("listening", () => {
            testServer.close(() => {
                log("Secondary: Promoted to primary");
                startAsPrimary(port);
            });
        });
        testServer.on("error", (err) => {
            if (err.code === "EADDRINUSE") {
                // Another peer already promoted — rejoin as secondary
                log("Secondary: Another server is primary — reconnecting...");
                setTimeout(connect, 1000);
            } else {
                log("Secondary: Promotion failed:", err.message);
                setTimeout(connect, 3000);
            }
        });
    }

    connect();
}

// ── Unified sendToExtension ─────────────────────────────────────────────────
// Works in both modes: primary sends directly, secondary sends via primary.

function sendToExtension(action, params = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        if (mode === "primary") {
            if (!extensionSocket || extensionSocket.readyState !== WebSocket.OPEN) {
                return reject(new Error(
                    "Chrome extension is not connected. Make sure:\n" +
                    "1. The SitrecBridge extension is installed and enabled\n" +
                    "2. Sitrec is open in a browser tab\n" +
                    "3. The extension popup shows 'Connected'"
                ));
            }

            const id = ++requestCounter;
            const timer = setTimeout(() => {
                pendingRequests.delete(id);
                reject(new Error(`Timed out waiting for '${action}' response (${timeoutMs}ms)`));
            }, timeoutMs);

            pendingRequests.set(id, { resolve, reject, timer });
            extensionSocket.send(JSON.stringify({ id, action, params }));

        } else if (mode === "secondary") {
            if (!primarySocket || primarySocket.readyState !== WebSocket.OPEN) {
                return reject(new Error(
                    "Not connected to primary MCP server. Reconnecting..."
                ));
            }

            const id = ++requestCounter;
            const timer = setTimeout(() => {
                pendingRequests.delete(id);
                reject(new Error(`Timed out waiting for '${action}' response (${timeoutMs}ms)`));
            }, timeoutMs);

            pendingRequests.set(id, { resolve, reject, timer });
            primarySocket.send(JSON.stringify({ id, action, params }));
        }
    });
}

// ── Startup: try primary, fall back to secondary ────────────────────────────

function start() {
    // Try to bind the port. If it fails with EADDRINUSE, become secondary.
    const testServer = new WebSocketServer({ host: WS_HOST, port: WS_PORT });

    testServer.on("listening", () => {
        // We got the port — close the test server and start properly as primary
        testServer.close(() => {
            startAsPrimary(WS_PORT);
        });
    });

    testServer.on("error", (err) => {
        if (err.code === "EADDRINUSE") {
            log(`Port ${WS_PORT} in use — joining as secondary`);
            startAsSecondary(WS_PORT);
        } else {
            log("Failed to start WebSocket server:", err.message);
            process.exit(1);
        }
    });
}

start();

// ── MCP Tool Definitions ────────────────────────────────────────────────────

const TOOLS = [
    {
        name: "sitrec_status",
        description:
            "Get the connection status of SitrecBridge — whether the extension is connected " +
            "and whether Sitrec is loaded and ready in the browser.",
        inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
        name: "sitrec_get_sitch",
        description:
            "Get information about the currently loaded situation (sitch): name, frame count, " +
            "FPS, center coordinates, time range, and whether it's a custom sitch.",
        inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
        name: "sitrec_load_sitch",
        description: "Load a named situation (sitch) into Sitrec.",
        inputSchema: {
            type: "object",
            properties: {
                name: {
                    type: "string",
                    description: "Sitch name, e.g. 'gimbal', 'chilean', 'gofast', 'agua', 'flir1'",
                },
            },
            required: ["name"],
        },
    },
    {
        name: "sitrec_list_sitches",
        description: "List all available sitches (situations) that can be loaded.",
        inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
        name: "sitrec_list_nodes",
        description:
            "List all nodes in the current node graph. Each node has an ID, a class name, " +
            "and connections to other nodes. Optionally filter by ID substring or class name.",
        inputSchema: {
            type: "object",
            properties: {
                filter: {
                    type: "string",
                    description: "Substring filter on node ID (case-insensitive)",
                },
                typeFilter: {
                    type: "string",
                    description: "Filter on node class name (case-insensitive)",
                },
            },
            required: [],
        },
    },
    {
        name: "sitrec_get_node",
        description:
            "Get detailed information about a specific node: its class name, input connections, " +
            "output connections, visibility, and current value at a given frame.",
        inputSchema: {
            type: "object",
            properties: {
                id: { type: "string", description: "Node ID" },
                frame: {
                    type: "number",
                    description: "Frame number to evaluate getValue() at (defaults to current frame)",
                },
            },
            required: ["id"],
        },
    },
    {
        name: "sitrec_get_frame",
        description: "Get the current frame number, total frame count, FPS, and paused state.",
        inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
        name: "sitrec_set_frame",
        description: "Set the current frame number (jumps the playhead).",
        inputSchema: {
            type: "object",
            properties: {
                frame: { type: "number", description: "Frame number to jump to (0-based)" },
            },
            required: ["frame"],
        },
    },
    {
        name: "sitrec_play_pause",
        description: "Toggle or explicitly set the play/pause state of the animation.",
        inputSchema: {
            type: "object",
            properties: {
                paused: {
                    type: "boolean",
                    description: "If provided, sets paused state. If omitted, toggles current state.",
                },
            },
            required: [],
        },
    },
    {
        name: "sitrec_screenshot",
        description:
            "Capture a screenshot of a Sitrec view. Forces a render then captures the canvas, " +
            "so it works even with preserveDrawingBuffer=false. Returns a base64-encoded image (JPEG by default for smaller size, use quality='png' for lossless). " +
            "Use fullWindow=true to capture the entire browser tab including HTML overlays (time display, UI labels).",
        inputSchema: {
            type: "object",
            properties: {
                view: {
                    type: "string",
                    description: "View node name to capture (defaults to 'mainView'). Other options: 'lookView'.",
                },
                selector: {
                    type: "string",
                    description: "Fallback CSS selector if view is not found (defaults to 'canvas')",
                },
                fullWindow: {
                    type: "boolean",
                    description: "If true, captures the entire browser tab (including HTML overlays like time display) instead of just the WebGL canvas.",
                },
                quality: {
                    type: ["number", "string"],
                    description: "JPEG quality 1-100 (default 75). Use 'png' for lossless PNG output. Lower values = smaller file size.",
                },
                maxWidth: {
                    type: "number",
                    description: "Maximum image width in pixels. If the captured image is wider, it will be downscaled (maintaining aspect ratio). Useful on high-DPI displays to reduce image size.",
                },
            },
            required: [],
        },
    },
    {
        name: "sitrec_eval",
        description:
            "Evaluate a JavaScript expression in the Sitrec page context. Has access to all " +
            "Sitrec globals: NodeMan, Sit, par, Globals, FileManager, LocalFrame, GlobalScene, etc. " +
            "The expression must return a JSON-serializable value. Use for advanced queries " +
            "not covered by other tools.",
        inputSchema: {
            type: "object",
            properties: {
                expression: {
                    type: "string",
                    description: "JavaScript expression to evaluate (must return JSON-serializable value)",
                },
            },
            required: ["expression"],
        },
    },
    {
        name: "sitrec_api_call",
        description:
            "Call a Sitrec API function by name. These are the same functions available to the " +
            "built-in AI chatbot. Use sitrec_api_list to see available functions and their parameters. " +
            "Common functions: gotoLLA, setDateTime, setFrame, play, pause, satellitesLoadCurrentStarlink, " +
            "addObjectAtLLA, setMenuValue, showView, hideView, setLayout, toggleFullscreen.",
        inputSchema: {
            type: "object",
            properties: {
                fn: {
                    type: "string",
                    description: "API function name (e.g. 'gotoLLA', 'setDateTime', 'setFrame')",
                },
                args: {
                    type: "object",
                    description: "Arguments object for the function (e.g. {lat: 51.5, lon: -0.13, alt: 0})",
                },
            },
            required: ["fn"],
        },
    },
    {
        name: "sitrec_api_list",
        description:
            "List all available Sitrec API functions with their documentation, parameters, " +
            "and available menu controls. Returns the full API reference.",
        inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
        name: "sitrec_reload_extension",
        description:
            "Reload the SitrecBridge Chrome extension. Use after modifying extension files " +
            "(background.js, content-script.js, page-bridge.js, manifest.json) to pick up changes " +
            "without manually clicking reload in chrome://extensions. The extension will disconnect " +
            "briefly and reconnect automatically.",
        inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
        name: "sitrec_guide",
        description:
            "Get the Sitrec MCP Agent Guide — a comprehensive reference for the node system, " +
            "API functions, data structures, views, cameras, tracks, menus, and common patterns. " +
            "Read this first before interacting with Sitrec to avoid repeated trial-and-error inspection.",
        inputSchema: { type: "object", properties: {}, required: [] },
    },
];

// ── MCP Server Setup ────────────────────────────────────────────────────────

const server = new Server(
    { name: "sitrec-bridge", version: "1.1.0" },
    { capabilities: { tools: {}, resources: {} } }
);

// ── Tool Handlers ───────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // sitrec_status is handled locally — no extension needed
    if (name === "sitrec_status") {
        const connected = mode === "primary"
            ? !!(extensionSocket && extensionSocket.readyState === WebSocket.OPEN)
            : !!(primarySocket && primarySocket.readyState === WebSocket.OPEN);
        return {
            content: [{
                type: "text",
                text: JSON.stringify({
                    mode,
                    extensionConnected: connected,
                    wsPort: WS_PORT,
                    pendingRequests: pendingRequests.size,
                }, null, 2),
            }],
        };
    }

    // sitrec_guide is handled locally — returns the agent guide markdown
    if (name === "sitrec_guide") {
        return {
            content: [{ type: "text", text: agentGuide }],
        };
    }

    // sitrec_reload_extension — only works from primary
    if (name === "sitrec_reload_extension") {
        if (mode === "primary") {
            if (!extensionSocket || extensionSocket.readyState !== WebSocket.OPEN) {
                return {
                    content: [{ type: "text", text: "Extension not connected. Nothing to reload." }],
                    isError: true,
                };
            }
            extensionSocket.send(JSON.stringify({ id: ++requestCounter, action: "reload" }));
        } else {
            // Secondary: relay through primary
            try {
                await sendToExtension("reload", {});
            } catch {}
        }
        return {
            content: [{ type: "text", text: "Extension reloading. It will reconnect automatically in a few seconds." }],
        };
    }

    // All other tools relay to the extension (via primary if secondary)
    try {
        const response = await sendToExtension(name, args || {});

        // Build assert warning text if any asserts fired during this call
        let assertText = "";
        const asserts = response.result?.asserts;
        if (asserts && asserts.length > 0) {
            assertText = "\n\n⚠️ ASSERT(S) FIRED DURING THIS CALL:\n" +
                asserts.map((a, i) => `[${i + 1}] ${a.message}\n${a.stack}`).join("\n\n");
        }

        if (response.error) {
            return {
                content: [{ type: "text", text: `Error: ${response.error}${assertText}` }],
                isError: true,
            };
        }

        // Screenshots return as image content
        if (name === "sitrec_screenshot" && response.result?.imageData) {
            const content = [{
                type: "image",
                data: response.result.imageData,
                mimeType: response.result.mimeType || "image/png",
            }];
            if (assertText) {
                content.push({ type: "text", text: assertText });
            }
            return { content };
        }

        // Remove asserts from the result before serializing (already extracted above)
        const resultToShow = response.result;
        if (resultToShow && typeof resultToShow === "object") {
            delete resultToShow.asserts;
        }

        const text = typeof resultToShow === "string"
            ? resultToShow
            : JSON.stringify(resultToShow, null, 2);

        return { content: [{ type: "text", text: text + assertText }] };
    } catch (e) {
        return {
            content: [{ type: "text", text: `Error: ${e.message}` }],
            isError: true,
        };
    }
});

// ── Resource Handlers ───────────────────────────────────────────────────────

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
        {
            uri: "sitrec://sitch/current",
            name: "Current Sitch",
            description: "The currently loaded situation in Sitrec",
            mimeType: "application/json",
        },
        {
            uri: "sitrec://nodes",
            name: "Node Graph",
            description: "All nodes in the current Sitrec node graph",
            mimeType: "application/json",
        },
        {
            uri: "sitrec://guide",
            name: "Agent Guide",
            description: "Comprehensive reference for AI agents interacting with Sitrec",
            mimeType: "text/markdown",
        },
    ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    try {
        let action;
        let params = {};

        if (uri === "sitrec://guide") {
            return {
                contents: [{ uri, mimeType: "text/markdown", text: agentGuide }],
            };
        }

        if (uri === "sitrec://sitch/current") {
            action = "sitrec_get_sitch";
        } else if (uri === "sitrec://nodes") {
            action = "sitrec_list_nodes";
        } else {
            return {
                contents: [{ uri, mimeType: "text/plain", text: `Unknown resource: ${uri}` }],
            };
        }

        const response = await sendToExtension(action, params);
        return {
            contents: [{
                uri,
                mimeType: "application/json",
                text: JSON.stringify(response.result, null, 2),
            }],
        };
    } catch (e) {
        return {
            contents: [{ uri, mimeType: "text/plain", text: `Error: ${e.message}` }],
        };
    }
});

// ── Start ───────────────────────────────────────────────────────────────────

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    log("MCP server running (stdio transport)");
}

main().catch((e) => {
    log("Fatal error:", e);
    process.exit(1);
});
