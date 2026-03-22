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
import {WebSocketServer} from "ws";
import {readFileSync} from "fs";
import {fileURLToPath} from "url";
import {dirname, join} from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const WS_PORT = parseInt(process.env.SITREC_BRIDGE_PORT || "9780", 10);

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

// ── WebSocket Relay (Extension Server) ──────────────────────────────────────

let extensionSocket = null;
const pendingRequests = new Map(); // id → { resolve, reject, timer }
let requestCounter = 0;
let keepaliveTimer = null;

const wss = new WebSocketServer({ port: WS_PORT });

wss.on("listening", () => {
    log(`WebSocket server listening on ws://localhost:${WS_PORT}`);
});

wss.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
        log(`ERROR: Port ${WS_PORT} is already in use. Set SITREC_BRIDGE_PORT env var to use a different port.`);
        process.exit(1);
    }
    log("WebSocket server error:", err.message);
});

wss.on("connection", (ws) => {
    // Single connection enforcement — like blueprint-mcp's ExtensionServer
    if (extensionSocket && extensionSocket.readyState === 1) {
        log("New connection while one is active — replacing old connection");
        extensionSocket.close();
    }

    extensionSocket = ws;
    log("Chrome extension connected");

    // Start keepalive pings to prevent service worker suspension
    clearInterval(keepaliveTimer);
    keepaliveTimer = setInterval(() => {
        if (extensionSocket && extensionSocket.readyState === 1) {
            extensionSocket.ping();
        }
    }, KEEPALIVE_INTERVAL_MS);

    ws.on("message", (raw) => {
        try {
            const msg = JSON.parse(raw.toString());
            if (msg.id != null && pendingRequests.has(msg.id)) {
                const { resolve, timer } = pendingRequests.get(msg.id);
                clearTimeout(timer);
                pendingRequests.delete(msg.id);
                resolve(msg);
            }
            // Notifications (no id) can be logged or ignored
        } catch (e) {
            log("Bad message from extension:", e.message);
        }
    });

    ws.on("close", () => {
        log("Chrome extension disconnected");
        if (extensionSocket === ws) extensionSocket = null;
        clearInterval(keepaliveTimer);

        // Reject all pending requests
        for (const [id, { reject, timer }] of pendingRequests) {
            clearTimeout(timer);
            reject(new Error("Extension disconnected"));
        }
        pendingRequests.clear();
    });

    ws.on("error", (err) => {
        log("WebSocket error:", err.message);
    });
});

/**
 * Send a command to the Chrome extension and wait for the response.
 * Follows the same request/response pattern as blueprint-mcp's ExtensionServer.
 */
function sendToExtension(action, params = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        if (!extensionSocket || extensionSocket.readyState !== 1) {
            return reject(new Error(
                "Chrome extension is not connected. Make sure:\n" +
                "1. The SitrecBridge extension is installed and enabled in Chrome\n" +
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
    });
}

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
            "so it works even with preserveDrawingBuffer=false. Returns a base64-encoded PNG image.",
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
    { name: "sitrec-bridge", version: "1.0.0" },
    { capabilities: { tools: {}, resources: {} } }
);

// ── Tool Handlers ───────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // sitrec_status is handled locally — no extension needed
    if (name === "sitrec_status") {
        const connected = !!(extensionSocket && extensionSocket.readyState === 1);
        return {
            content: [{
                type: "text",
                text: JSON.stringify({
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

    // sitrec_reload_extension is handled specially — sends a direct message
    // to the background script (not through content script relay)
    if (name === "sitrec_reload_extension") {
        if (!extensionSocket || extensionSocket.readyState !== 1) {
            return {
                content: [{ type: "text", text: "Extension not connected. Nothing to reload." }],
                isError: true,
            };
        }
        // Send reload message directly — the background script handles this
        // as a chrome.runtime.onMessage, but we send it via WebSocket.
        // The background script will call chrome.runtime.reload() after a short delay.
        extensionSocket.send(JSON.stringify({ id: ++requestCounter, action: "reload" }));
        return {
            content: [{ type: "text", text: "Extension reloading. It will reconnect automatically in a few seconds." }],
        };
    }

    // All other tools relay to the extension
    try {
        const response = await sendToExtension(name, args || {});

        if (response.error) {
            return {
                content: [{ type: "text", text: `Error: ${response.error}` }],
                isError: true,
            };
        }

        // Screenshots return as image content
        if (name === "sitrec_screenshot" && response.result?.imageData) {
            return {
                content: [{
                    type: "image",
                    data: response.result.imageData,
                    mimeType: "image/png",
                }],
            };
        }

        const text = typeof response.result === "string"
            ? response.result
            : JSON.stringify(response.result, null, 2);

        return { content: [{ type: "text", text }] };
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
