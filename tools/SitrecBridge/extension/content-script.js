/**
 * SitrecBridge -- Content Script
 *
 * Runs in the content script isolated world on Sitrec pages.
 * Bridges between the background service worker (via chrome.runtime messages)
 * and the page-bridge.js script (via window.postMessage).
 *
 * Content scripts can't access page JS globals directly (window.NodeMan, etc.),
 * so page-bridge.js is injected into the page's main world to do the actual work.
 */

// Inject the page-bridge script into the main world
(function injectPageBridge() {
    // Check if already injected
    if (document.getElementById("sitrec-bridge-injected")) return;

    const marker = document.createElement("div");
    marker.id = "sitrec-bridge-injected";
    marker.style.display = "none";
    document.documentElement.appendChild(marker);

    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("page-bridge.js");
    script.type = "module";
    document.documentElement.appendChild(script);
})();

// -- Keep-Alive Port --------------------------------------------------------
// Opening a long-lived port to the background service worker prevents Chrome
// from suspending it (MV3 service worker lifecycle). The port stays open as
// long as this content script is alive (i.e., the Sitrec tab is open).

let keepalivePort = null;

function openKeepalivePort() {
    try {
        keepalivePort = chrome.runtime.connect({ name: "sitrec-keepalive" });
        keepalivePort.onDisconnect.addListener(() => {
            keepalivePort = null;
            // Service worker may have restarted -- reconnect after a short delay
            setTimeout(openKeepalivePort, 1000);
        });
    } catch {
        // Extension context invalidated (e.g., extension was reloaded)
        keepalivePort = null;
    }
}

openKeepalivePort();

// -- Message relay: background <-> page-bridge ------------------------------

// Pending requests from the background, waiting for page-bridge responses
const pendingPageRequests = new Map();
let pageRequestCounter = 0;

/**
 * Handle messages from the background service worker.
 * Forward the action to page-bridge.js via window.postMessage.
 */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    const { action, params } = msg;
    if (!action) return false;

    const reqId = ++pageRequestCounter;

    // Set up a timeout
    const timer = setTimeout(() => {
        pendingPageRequests.delete(reqId);
        sendResponse({ error: "Timed out waiting for Sitrec page response" });
    }, 12000);

    pendingPageRequests.set(reqId, { sendResponse, timer });

    // Forward to page-bridge.js in the main world
    window.postMessage(
        {
            source: "sitrec-bridge-content",
            reqId,
            action,
            params,
        },
        "*"
    );

    return true; // async sendResponse
});

/**
 * Handle responses from page-bridge.js in the main world.
 */
window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.source !== "sitrec-bridge-page") return;

    const { reqId, result, error } = event.data;
    const pending = pendingPageRequests.get(reqId);
    if (!pending) return;

    clearTimeout(pending.timer);
    pendingPageRequests.delete(reqId);

    if (error) {
        pending.sendResponse({ error });
    } else {
        pending.sendResponse(result);
    }
});
