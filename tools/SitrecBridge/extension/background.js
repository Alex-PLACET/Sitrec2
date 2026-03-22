/**
 * SitrecBridge — Background Service Worker
 *
 * Connects to the MCP server's WebSocket and relays commands to/from
 * content scripts running in Sitrec tabs.
 *
 * Message flow:
 *   MCP Server --WebSocket--> here --chrome.tabs.sendMessage--> content-script.js
 *   content-script.js --chrome.runtime.sendMessage--> here --WebSocket--> MCP Server
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

// -- WebSocket Connection ---------------------------------------------------

async function connect() {
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
        return;
    }

    // Only connect if we have a Sitrec tab — prevents extensions in browsers
    // without Sitrec from competing for the MCP server's single extension socket.
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

    ws.onopen = () => {
        console.log("[SitrecBridge] Connected to MCP server");
        reconnectInterval = RECONNECT_INTERVAL_MS; // Reset backoff
        updatePopupState();
    };

    ws.onmessage = async (event) => {
        try {
            const msg = JSON.parse(event.data);
            await handleServerMessage(msg);
        } catch (e) {
            console.error("[SitrecBridge] Error handling message:", e);
        }
    };

    ws.onclose = () => {
        console.log("[SitrecBridge] Disconnected from MCP server");
        ws = null;
        updatePopupState();
        scheduleReconnect();
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

// -- Handle Incoming Server Messages ----------------------------------------

async function handleServerMessage(msg) {
    const { id, action, params } = msg;

    // Handle reload directly in the background script -- no tab needed
    if (action === "reload") {
        sendToServer({ id, result: { ok: true, reloading: true } });
        setTimeout(() => chrome.runtime.reload(), 100);
        return;
    }

    const tabId = await findSitrecTab();
    if (!tabId) {
        sendToServer({
            id,
            error: "No Sitrec tab found. Please open Sitrec in a browser tab.",
        });
        return;
    }

    try {
        // Forward to content script and wait for response
        const result = await chrome.tabs.sendMessage(tabId, { action, params });
        sendToServer({ id, result });
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
        } catch (e2) {
            sendToServer({
                id,
                error: `Failed to communicate with Sitrec tab: ${e2.message}`,
            });
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
    // Best-effort -- popup may not be open
    chrome.runtime.sendMessage({
        type: "stateUpdate",
        wsConnected: ws && ws.readyState === WebSocket.OPEN,
        sitrecTabId,
    }).catch(() => {});
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "getState") {
        findSitrecTab().then((tabId) => {
            sendResponse({
                wsConnected: ws && ws.readyState === WebSocket.OPEN,
                sitrecTabId: tabId,
                wsUrl: WS_URL,
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
