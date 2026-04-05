/**
 * SitrecBridge — Background Service Worker
 *
 * Connects to the MCP server's WebSocket and relays commands to/from
 * content scripts running in Sitrec tabs.
 *
 * Message flow:
 *   MCP Server --WebSocket--> here --chrome.tabs.sendMessage--> content-script.js
 *   content-script.js --chrome.runtime.sendMessage--> here --WebSocket--> MCP Server
 *
 * Multi-browser coordination:
 *   The MCP server accepts only ONE extension at a time (first-come-first-served).
 *   If another browser's extension is already connected, the server sends a
 *   {type: "rejected"} message and closes the socket. This extension then sets
 *   rejectedByServer=true and stops all auto-reconnect attempts. Only the user
 *   clicking "Reconnect" in the popup can override this (sends "force-extension"
 *   to the server, which replaces the existing connection).
 */

const WS_URL = "ws://localhost:9780";
const RECONNECT_INTERVAL_MS = 3000;
const MAX_RECONNECT_INTERVAL_MS = 30000;
const KEEPALIVE_ALARM_NAME = "sitrec-bridge-keepalive";
const KEEPALIVE_ALARM_PERIOD_MIN = 0.5; // 30 seconds, minimum Chrome allows

let ws = null;
let reconnectTimer = null;
let reconnectInterval = RECONNECT_INTERVAL_MS;
let sitrecTabId = null;
const knownSitrecTabs = new Map();  // Tab ID → { buildDir } — confirmed as Sitrec by content script keepalive
let forceNextConnect = false;   // Set by popup "Reconnect" to override server rejection
let rejectedByServer = false;   // True after max retries — suppresses auto-reconnect until popup Reconnect
let rejectionRetries = 0;       // Count of consecutive rejections before giving up
let sourceVersion = null;       // Version from source manifest.json (sent by MCP server)
let currentCommand = null;      // Currently executing MCP command {action, detail, startTime}
let commandHistory = [];        // Recent commands [{action, detail, startTime, endTime, ok}]
const MAX_HISTORY = 8;

// -- WebSocket Connection ---------------------------------------------------

async function connect() {
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
        return;
    }

    // Suppressed after server rejected us (another extension is active).
    // Only cleared by the popup Reconnect button.
    if (rejectedByServer) {
        return;
    }

    // Only connect if we have a Sitrec tab.
    const tabId = await findSitrecTab();
    if (!tabId) {
        return;
    }

    try {
        ws = new WebSocket(WS_URL);
    } catch (e) {
        console.error("[SitrecBridge] WebSocket creation failed:", e.message);
        scheduleReconnect();
        return;
    }

    const isForced = forceNextConnect;
    forceNextConnect = false;

    ws.onopen = () => {
        console.log("[SitrecBridge] WebSocket open, awaiting server acceptance...");
        reconnectInterval = RECONNECT_INTERVAL_MS; // Reset backoff
        if (isForced) {
            // Tell the server to replace the existing extension
            ws.send(JSON.stringify({ type: "force-extension" }));
        }
        // Don't updatePopupState() here — wait for version-info (confirmation
        // that the server accepted us) to avoid a brief "Connected" flash
        // before a potential rejection.
    };

    ws.onmessage = async (event) => {
        try {
            const msg = JSON.parse(event.data);

            // Server rejected us — another extension is already connected.
            // Server rejected us — another extension is connected.
            // Retry a few times with backoff (the existing connection may be stale
            // from an extension reload, and the server's liveness probe will clear it).
            // After max retries, stop and require manual Reconnect from popup.
            if (msg.type === "rejected") {
                rejectionRetries = (rejectionRetries || 0) + 1;
                const MAX_REJECTION_RETRIES = 3;
                console.log("[SitrecBridge] Server rejected (" + rejectionRetries + "/" + MAX_REJECTION_RETRIES + "): " + (msg.reason || "another extension active"));
                if (ws) {
                    ws.close();
                }
                if (rejectionRetries >= MAX_REJECTION_RETRIES) {
                    rejectedByServer = true;
                    rejectionRetries = 0;
                    console.log("[SitrecBridge] Max rejection retries reached — stopping auto-reconnect");
                } else {
                    // Retry after a delay — the server may clear the stale connection
                    reconnectInterval = 3000;
                    scheduleReconnect();
                }
                updatePopupState();
                return;
            }

            // Version info from the server (source manifest version)
            // This confirms the server accepted us — reset rejection state
            if (msg.type === "version-info") {
                sourceVersion = msg.sourceVersion || null;
                rejectedByServer = false;
                rejectionRetries = 0;
                updatePopupState();
                return;
            }

            await handleServerMessage(msg);
        } catch (e) {
            console.error("[SitrecBridge] Error handling message:", e);
        }
    };

    ws.onclose = () => {
        ws = null;
        console.log("[SitrecBridge] Disconnected from MCP server");
        updatePopupState();
        // If rejected, don't reconnect — the flag was already set in onmessage
        if (!rejectedByServer) {
            scheduleReconnect();
        }
    };

    ws.onerror = (err) => {
        console.error("[SitrecBridge] WebSocket error");
        // onclose will fire after this, triggering reconnect
    };
}

function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
        // Exponential backoff capped at MAX_RECONNECT_INTERVAL_MS
        reconnectInterval = Math.min(reconnectInterval * 1.5, MAX_RECONNECT_INTERVAL_MS);
    }, reconnectInterval);
}

function sendToServer(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
    }
}

// -- Find Sitrec Tab --------------------------------------------------------

async function findSitrecTab() {
    // If we have a remembered tab, check it's still valid
    if (sitrecTabId != null) {
        try {
            const tab = await chrome.tabs.get(sitrecTabId);
            if (tab && knownSitrecTabs.has(tab.id)) return sitrecTabId;
        } catch {
            knownSitrecTabs.delete(sitrecTabId);
            sitrecTabId = null;
        }
    }

    // Check any other known Sitrec tabs (registered via keepalive)
    for (const tabId of knownSitrecTabs.keys()) {
        try {
            await chrome.tabs.get(tabId);
            sitrecTabId = tabId;
            return tabId;
        } catch {
            knownSitrecTabs.delete(tabId);
        }
    }

    // Fallback: scan all open tabs by URL pattern.
    // This handles the case where the service worker restarted and
    // knownSitrecTabs was cleared (in-memory state lost on MV3 suspension).
    return discoverSitrecTabByURL();
}

/**
 * Scan all open tabs for Sitrec URLs and try to re-establish the content
 * script keepalive connection. Returns the first matching tab ID, or null.
 */
async function discoverSitrecTabByURL() {
    try {
        const allTabs = await chrome.tabs.query({});
        for (const tab of allTabs) {
            if (!isSitrecUrl(tab.url)) continue;
            // Try to (re-)inject the content script so the keepalive port is re-established
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ["content-script.js"],
                });
            } catch {
                // Content script may already be injected, or tab not injectable — that's OK
            }
            // Register tentatively so the tab is usable immediately
            if (!knownSitrecTabs.has(tab.id)) {
                knownSitrecTabs.set(tab.id, { buildDir: null });
            }
            sitrecTabId = tab.id;
            updatePopupState();
            return tab.id;
        }
    } catch {
        // tabs.query failed
    }
    return null;
}

/**
 * Find a Sitrec tab matching a target specifier.
 * @param {string|number} target - Tab ID (number), or URL substring to match (string).
 *   Examples: 456, "build2", "/sitrec", "localhost:4000"
 * @param {string|null} cwd - MCP server working directory. When no explicit target is
 *   given, prefer the tab whose build directory matches this cwd.
 * @returns {Promise<number|null>} Matching tab ID, or null if not found.
 */
async function findSitrecTabByTarget(target, cwd) {
    // Explicit target takes priority
    if (target != null) {
        // Numeric tab ID — direct lookup
        if (typeof target === "number") {
            try {
                const tab = await chrome.tabs.get(target);
                if (knownSitrecTabs.has(tab.id)) return tab.id;
                // Tab exists but not registered — try to recover it
                if (isSitrecUrl(tab.url)) {
                    knownSitrecTabs.set(tab.id, { buildDir: null });
                    return tab.id;
                }
            } catch {}
            return null;
        }

        // String — match against URL of known Sitrec tabs first,
        // then fall back to scanning all tabs by URL
        if (typeof target === "string") {
            const needle = target.toLowerCase();
            const tabs = await chrome.tabs.query({});
            // First pass: check known tabs
            for (const tab of tabs) {
                if (knownSitrecTabs.has(tab.id) && tab.url.toLowerCase().includes(needle)) {
                    return tab.id;
                }
            }
            // Second pass: check ALL tabs with matching Sitrec URL
            for (const tab of tabs) {
                if (isSitrecUrl(tab.url) && tab.url.toLowerCase().includes(needle)) {
                    knownSitrecTabs.set(tab.id, { buildDir: null });
                    return tab.id;
                }
            }
        }
        return null;
    }

    // No explicit target — try to match by build directory if cwd hint is provided
    if (cwd) {
        for (const [tabId, info] of knownSitrecTabs) {
            if (info.buildDir && info.buildDir === cwd) {
                try {
                    await chrome.tabs.get(tabId);
                    return tabId;
                } catch {
                    knownSitrecTabs.delete(tabId);
                }
            }
        }
    }

    // Fall back to default (first known Sitrec tab)
    return findSitrecTab();
}

/**
 * List all open Sitrec tabs with their IDs and URLs.
 * Used by the sitrec_list_tabs MCP tool.
 */
async function findAllSitrecTabs() {
    const tabs = await chrome.tabs.query({});
    const results = [];
    for (const tab of tabs) {
        // Include known tabs AND tabs matching Sitrec URLs (recovering from state loss)
        if (knownSitrecTabs.has(tab.id) || isSitrecUrl(tab.url)) {
            if (!knownSitrecTabs.has(tab.id)) {
                knownSitrecTabs.set(tab.id, { buildDir: null });
            }
            const info = knownSitrecTabs.get(tab.id);
            results.push({ id: tab.id, url: tab.url, title: tab.title || "", buildDir: info.buildDir || null });
        }
    }
    return results;
}

function isSitrecUrl(url) {
    if (!url) return false;
    try {
        const parsed = new URL(url);
        const host = parsed.hostname;
        return (
            host === "local.metabunk.org" ||
            host === "www.metabunk.org" ||
            host === "localhost" ||
            host === "127.0.0.1"
        );
    } catch {
        return false;
    }
}

// -- Command Tracking -------------------------------------------------------

function commandDetail(action, params) {
    if (!params) return "";
    switch (action) {
        case "sitrec_eval":
            return (params.expression || params.code || "").slice(0, 80).replace(/\n/g, " ");
        case "sitrec_api_call":
            return params.function || "";
        case "sitrec_load_sitch":
            return params.name || "";
        case "sitrec_get_node":
            return params.id || "";
        case "sitrec_list_nodes":
            return params.filter || params.type || "";
        case "sitrec_set_frame":
            return `frame ${params.frame}`;
        case "sitrec_screenshot":
            return params.fullWindow ? "full window" : "canvas";
        default:
            return "";
    }
}

function trackCommandStart(action, params, cwd, tabId) {
    currentCommand = {
        action,
        detail: commandDetail(action, params),
        startTime: Date.now(),
        cwd: cwd || null,
        tabId: tabId || null,
    };
    updatePopupState();
}

function trackCommandEnd(ok) {
    if (currentCommand) {
        commandHistory.unshift({
            ...currentCommand,
            endTime: Date.now(),
            ok,
        });
        if (commandHistory.length > MAX_HISTORY) commandHistory.pop();
    }
    currentCommand = null;
    updatePopupState();
}

// -- Handle Incoming Server Messages ----------------------------------------

async function handleServerMessage(msg) {
    const { id, action, params, _cwd } = msg;
    console.log(`[SitrecBridge] RAW msg keys: ${Object.keys(msg).join(',')}, _cwd=${JSON.stringify(msg._cwd)}`);

    // Handle reload directly in the background script -- no tab needed
    if (action === "reload") {
        trackCommandStart(action, params);
        sendToServer({ id, result: { ok: true, reloading: true } });
        trackCommandEnd(true);
        setTimeout(() => chrome.runtime.reload(), 100);
        return;
    }

    // List all Sitrec tabs — handled in background, no specific tab needed
    if (action === "sitrec_list_tabs") {
        trackCommandStart(action, params);
        const tabs = await findAllSitrecTabs();
        sendToServer({ id, result: tabs });
        trackCommandEnd(true);
        return;
    }

    // Full-page screenshot via chrome.tabs.captureVisibleTab — captures DOM + canvas
    if (action === "sitrec_screenshot" && params?.view === "page") {
        const pageTabTarget = params?.tab;
        if (params?.tab !== undefined) delete params.tab;
        const pageTabId = await findSitrecTabByTarget(pageTabTarget, _cwd);
        trackCommandStart(action, params, _cwd, pageTabId);
        if (!pageTabId) {
            sendToServer({ id, error: "No Sitrec tab found for page capture." });
            trackCommandEnd(false);
            return;
        }
        try {
            const tab = await chrome.tabs.get(pageTabId);
            // Ensure the tab is active so captureVisibleTab can see it
            if (!tab.active) {
                await chrome.tabs.update(pageTabId, { active: true });
                await new Promise(r => setTimeout(r, 250));
            }

            const usePng = params.quality === "png";
            const format = usePng ? "png" : "jpeg";
            const quality = usePng ? undefined : Math.min(100, Math.max(1, Number(params.quality) || 75));
            const mimeType = usePng ? "image/png" : "image/jpeg";

            const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format, quality });
            let imageData = dataUrl.replace(/^data:image\/[a-z]+;base64,/, "");

            // Optional maxWidth downscale via OffscreenCanvas
            if (params.maxWidth) {
                const maxW = Number(params.maxWidth);
                const blob = await (await fetch(dataUrl)).blob();
                const bitmap = await createImageBitmap(blob);
                if (bitmap.width > maxW) {
                    const scale = maxW / bitmap.width;
                    const w = Math.round(bitmap.width * scale);
                    const h = Math.round(bitmap.height * scale);
                    const oc = new OffscreenCanvas(w, h);
                    oc.getContext("2d").drawImage(bitmap, 0, 0, w, h);
                    const resizedBlob = await oc.convertToBlob({
                        type: mimeType,
                        quality: usePng ? undefined : quality / 100,
                    });
                    const buf = await resizedBlob.arrayBuffer();
                    const bytes = new Uint8Array(buf);
                    const CHUNK = 0x8000;
                    let binary = "";
                    for (let i = 0; i < bytes.length; i += CHUNK) {
                        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
                    }
                    imageData = btoa(binary);
                }
                bitmap.close();
            }

            sendToServer({ id, result: { imageData, mimeType } });
            trackCommandEnd(true);
        } catch (e) {
            sendToServer({ id, error: `Page capture failed: ${e.message}` });
            trackCommandEnd(false);
        }
        return;
    }

    // Tab targeting: use params.tab to select a specific tab by ID or URL substring.
    // Extract and remove the tab param so it doesn't get forwarded to the content script.
    const tabTarget = params?.tab;
    if (params?.tab !== undefined) {
        delete params.tab;
    }

    const tabId = await findSitrecTabByTarget(tabTarget, _cwd);
    console.log(`[SitrecBridge] ${action}: _cwd=${_cwd || 'none'}, tabTarget=${tabTarget || 'none'}, → tab ${tabId}`);

    trackCommandStart(action, params, _cwd, tabId);

    if (!tabId) {
        const hint = tabTarget
            ? ` matching "${tabTarget}". Available tabs: use sitrec_list_tabs to see open Sitrec tabs.`
            : ". Please open Sitrec in a browser tab.";
        sendToServer({
            id,
            error: `No Sitrec tab found${hint}`,
        });
        trackCommandEnd(false);
        return;
    }

    try {
        // Forward to content script and wait for response
        const result = await chrome.tabs.sendMessage(tabId, { action, params });
        sendToServer({ id, result });
        trackCommandEnd(true);
    } catch (e) {
        // Content script may not be injected yet -- try injecting it
        try {
            await chrome.scripting.executeScript({
                target: { tabId },
                files: ["content-script.js"],
            });
            // Retry after injection
            const result = await chrome.tabs.sendMessage(tabId, { action, params });
            sendToServer({ id, result });
            trackCommandEnd(true);
        } catch (e2) {
            sendToServer({
                id,
                error: `Failed to communicate with Sitrec tab: ${e2.message}`,
            });
            trackCommandEnd(false);
        }
    }
}

// -- Track Tab Changes ------------------------------------------------------

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete" && knownSitrecTabs.has(tabId)) {
        sitrecTabId = tabId;
    }
});

chrome.tabs.onRemoved.addListener((tabId) => {
    knownSitrecTabs.delete(tabId);
    if (tabId === sitrecTabId) {
        sitrecTabId = null;
    }
});

// -- Keep-Alive: Persistent Port from Content Scripts -----------------------
// A long-lived port prevents the MV3 service worker from being suspended
// as long as a Sitrec tab is open.

chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== "sitrec-keepalive") return;

    // If the port comes from a tab, remember it as our Sitrec tab
    const tabId = port.sender?.tab?.id;
    if (tabId) {
        knownSitrecTabs.set(tabId, { buildDir: null });
        sitrecTabId = tabId;
    }

    // Listen for metadata (build directory) from the content script
    port.onMessage.addListener((msg) => {
        if (msg.type === "metadata" && tabId && knownSitrecTabs.has(tabId)) {
            const info = knownSitrecTabs.get(tabId);
            if (msg.buildDir) info.buildDir = msg.buildDir;
        }
    });

    // Ensure we're connected to the MCP server
    connect();
    updatePopupState();

    port.onDisconnect.addListener(() => {
        // Tab closed or navigated away
        if (tabId) {
            knownSitrecTabs.delete(tabId);
            if (sitrecTabId === tabId) sitrecTabId = null;
        }
        updatePopupState();
    });
});

// -- Keep-Alive: Alarm Fallback ---------------------------------------------
// When no Sitrec tab holds a port open, the service worker can suspend.
// An alarm wakes it periodically so we can reconnect quickly.

chrome.alarms.create(KEEPALIVE_ALARM_NAME, {
    periodInMinutes: KEEPALIVE_ALARM_PERIOD_MIN,
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== KEEPALIVE_ALARM_NAME) return;
    // Each alarm wake-up: if we have no known tabs, try URL-based discovery
    // (handles service worker restart where in-memory state was lost)
    if (knownSitrecTabs.size === 0) {
        await discoverSitrecTabByURL();
    }
    // Ensure WebSocket is connected
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        connect();
    }
});

// -- Popup Communication ----------------------------------------------------

function updatePopupState() {
    const installedVersion = chrome.runtime.getManifest().version;
    // Build tab list for popup
    const tabList = [];
    for (const [tabId, info] of knownSitrecTabs) {
        tabList.push({ id: tabId, buildDir: info.buildDir || null });
    }
    // Best-effort -- popup may not be open
    chrome.runtime.sendMessage({
        type: "stateUpdate",
        wsConnected: ws && ws.readyState === WebSocket.OPEN,
        sitrecTabId,
        knownTabs: tabList,
        rejectedByServer,
        installedVersion,
        sourceVersion,
        currentCommand,
        commandHistory,
    }).catch(() => {});
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "getState") {
        findSitrecTab().then((tabId) => {
            const tabList = [];
            for (const [tid, info] of knownSitrecTabs) {
                tabList.push({ id: tid, buildDir: info.buildDir || null });
            }
            sendResponse({
                wsConnected: ws && ws.readyState === WebSocket.OPEN,
                sitrecTabId: tabId,
                knownTabs: tabList,
                wsUrl: WS_URL,
                rejectedByServer,
                installedVersion: chrome.runtime.getManifest().version,
                sourceVersion,
                currentCommand,
                commandHistory,
            });
        });
        return true; // async response
    }

    if (msg.type === "reconnect") {
        reconnectInterval = RECONNECT_INTERVAL_MS;
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
        // Close existing connection if any, so connect() starts fresh
        if (ws) {
            ws.onclose = null;  // Prevent scheduleReconnect from the close
            ws.close();
            ws = null;
        }
        rejectedByServer = false;   // Clear suppression
        forceNextConnect = true;    // Tell server to replace existing extension
        connect();
        sendResponse({ ok: true });
        return false;
    }

    if (msg.type === "reload") {
        sendResponse({ ok: true, reloading: true });
        // Short delay so the response gets sent before we reload
        setTimeout(() => chrome.runtime.reload(), 100);
        return false;
    }
});

// -- Initialize -------------------------------------------------------------

connect();
