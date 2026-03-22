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
let forceNextConnect = false;   // Set by popup "Reconnect" to override server rejection
let rejectedByServer = false;   // True after server rejects us — suppresses ALL auto-reconnect
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
            // Stop all auto-reconnect. Only the popup Reconnect button can clear this.
            // We close the WebSocket ourselves (server leaves it open for us to close
            // cleanly, avoiding race conditions with close-before-message delivery).
            if (msg.type === "rejected") {
                rejectedByServer = true;
                console.log("[SitrecBridge] Server rejected: " + (msg.reason || "another extension active"));
                // Close our end — onclose will fire but rejectedByServer is already set,
                // so it won't scheduleReconnect.
                if (ws) {
                    ws.close();
                }
                updatePopupState();
                return;
            }

            // Version info from the server (source manifest version)
            if (msg.type === "version-info") {
                sourceVersion = msg.sourceVersion || null;
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
            if (tab && isSitrecUrl(tab.url)) return sitrecTabId;
        } catch {
            sitrecTabId = null;
        }
    }

    // Search all tabs for a Sitrec page
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
        if (isSitrecUrl(tab.url)) {
            sitrecTabId = tab.id;
            return tab.id;
        }
    }
    return null;
}

function isSitrecUrl(url) {
    if (!url) return false;
    return (
        url.includes("metabunk.org/sitrec") ||
        /localhost:\d+\/sitrec/.test(url) ||
        /127\.0\.0\.1:\d+\/sitrec/.test(url)
    );
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

function trackCommandStart(action, params) {
    currentCommand = {
        action,
        detail: commandDetail(action, params),
        startTime: Date.now(),
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
    const { id, action, params } = msg;

    // Handle reload directly in the background script -- no tab needed
    if (action === "reload") {
        trackCommandStart(action, params);
        sendToServer({ id, result: { ok: true, reloading: true } });
        trackCommandEnd(true);
        setTimeout(() => chrome.runtime.reload(), 100);
        return;
    }

    trackCommandStart(action, params);

    // Full-window screenshot: capture the entire visible tab (including HTML overlays)
    // using chrome.tabs.captureVisibleTab(), handled here in the background script.
    if (action === "sitrec_screenshot" && params?.fullWindow) {
        const tabId = await findSitrecTab();
        if (!tabId) {
            sendToServer({ id, error: "No Sitrec tab found." });
            trackCommandEnd(false);
            return;
        }
        try {
            const usePng = params.quality === "png";
            const jpegQuality = usePng ? undefined : Math.min(100, Math.max(1, Number(params.quality) || 75));
            const format = usePng ? "png" : "jpeg";
            const mimeType = usePng ? "image/png" : "image/jpeg";
            const dataUrlPrefix = usePng ? /^data:image\/png;base64,/ : /^data:image\/jpeg;base64,/;

            // Ensure the Sitrec tab is active so captureVisibleTab works
            const tab = await chrome.tabs.get(tabId);
            await chrome.tabs.update(tabId, { active: true });
            // Small delay to let the tab render after activation
            await new Promise(r => setTimeout(r, 100));
            const captureOpts = { format };
            if (format === "jpeg") captureOpts.quality = jpegQuality;
            const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, captureOpts);

            // Downscale via offscreen canvas if maxWidth is set
            let imageData;
            if (params.maxWidth) {
                // Use content script to downscale since service workers lack canvas
                const [result] = await chrome.scripting.executeScript({
                    target: { tabId },
                    func: (dataUrl, maxWidth, mimeType, jpegQuality) => {
                        const img = new Image();
                        return new Promise((resolve) => {
                            img.onload = () => {
                                if (img.width <= maxWidth) {
                                    resolve(null); // no resize needed
                                    return;
                                }
                                const scale = maxWidth / img.width;
                                const c = document.createElement("canvas");
                                c.width = Math.round(img.width * scale);
                                c.height = Math.round(img.height * scale);
                                c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
                                const quality = mimeType === "image/jpeg" ? jpegQuality / 100 : undefined;
                                resolve(c.toDataURL(mimeType, quality));
                            };
                            img.src = dataUrl;
                        });
                    },
                    args: [dataUrl, params.maxWidth, mimeType, jpegQuality || 75],
                    world: "MAIN",
                });
                if (result?.result) {
                    imageData = result.result.replace(dataUrlPrefix, "");
                } else {
                    imageData = dataUrl.replace(dataUrlPrefix, "");
                }
            } else {
                imageData = dataUrl.replace(dataUrlPrefix, "");
            }
            sendToServer({ id, result: { imageData, mimeType } });
            trackCommandEnd(true);
        } catch (e) {
            sendToServer({ id, error: `captureVisibleTab failed: ${e.message}` });
            trackCommandEnd(false);
        }
        return;
    }

    const tabId = await findSitrecTab();
    if (!tabId) {
        sendToServer({
            id,
            error: "No Sitrec tab found. Please open Sitrec in a browser tab.",
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
    if (changeInfo.status === "complete" && isSitrecUrl(tab.url)) {
        sitrecTabId = tabId;
    }
});

chrome.tabs.onRemoved.addListener((tabId) => {
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
    if (port.sender?.tab?.id) {
        sitrecTabId = port.sender.tab.id;
    }

    // Ensure we're connected to the MCP server
    connect();

    port.onDisconnect.addListener(() => {
        // Tab closed or navigated away -- service worker may now suspend.
        // The alarm will keep us reconnecting if needed.
    });
});

// -- Keep-Alive: Alarm Fallback ---------------------------------------------
// When no Sitrec tab holds a port open, the service worker can suspend.
// An alarm wakes it periodically so we can reconnect quickly.

chrome.alarms.create(KEEPALIVE_ALARM_NAME, {
    periodInMinutes: KEEPALIVE_ALARM_PERIOD_MIN,
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== KEEPALIVE_ALARM_NAME) return;
    // Each alarm wake-up: ensure WebSocket is connected
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        connect();
    }
});

// -- Popup Communication ----------------------------------------------------

function updatePopupState() {
    const installedVersion = chrome.runtime.getManifest().version;
    // Best-effort -- popup may not be open
    chrome.runtime.sendMessage({
        type: "stateUpdate",
        wsConnected: ws && ws.readyState === WebSocket.OPEN,
        sitrecTabId,
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
            sendResponse({
                wsConnected: ws && ws.readyState === WebSocket.OPEN,
                sitrecTabId: tabId,
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
