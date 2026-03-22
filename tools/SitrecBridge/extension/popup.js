/**
 * SitrecBridge -- Popup UI
 */

const wsDot = document.getElementById("ws-dot");
const wsStatus = document.getElementById("ws-status");
const tabDot = document.getElementById("tab-dot");
const tabStatus = document.getElementById("tab-status");
const info = document.getElementById("info");

function update(state) {
    if (state.wsConnected) {
        wsDot.className = "dot green";
        wsStatus.textContent = "Connected";
    } else {
        wsDot.className = "dot red";
        wsStatus.textContent = "Disconnected";
    }

    if (state.sitrecTabId) {
        tabDot.className = "dot green";
        tabStatus.textContent = `Tab #${state.sitrecTabId}`;
    } else {
        tabDot.className = "dot yellow";
        tabStatus.textContent = "Not found";
    }

    info.textContent = `WebSocket: ${state.wsUrl || "ws://localhost:9780"}`;
}

// Initial state fetch
chrome.runtime.sendMessage({ type: "getState" }, (response) => {
    if (response) update(response);
});

// Listen for state updates
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "stateUpdate") update(msg);
});

// Reconnect button -- does a full extension reload to pick up file changes
document.getElementById("reconnect-btn").addEventListener("click", () => {
    wsStatus.textContent = "Reloading...";
    wsDot.className = "dot yellow";
    chrome.runtime.sendMessage({ type: "reload" });
    // Popup will close automatically when the extension reloads
});
