/**
 * SitrecBridge -- Popup UI
 */

const wsDot = document.getElementById("ws-dot");
const wsStatus = document.getElementById("ws-status");
const tabDot = document.getElementById("tab-dot");
const tabStatus = document.getElementById("tab-status");
const info = document.getElementById("info");
const versionEl = document.getElementById("version");
const updateBanner = document.getElementById("update-banner");

function update(state) {
    if (state.wsConnected) {
        wsDot.className = "dot green";
        wsStatus.textContent = "Connected";
    } else if (state.rejectedByServer) {
        wsDot.className = "dot yellow";
        wsStatus.textContent = "Yielded to other browser";
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

    // Version display
    if (state.installedVersion) {
        versionEl.textContent = `v${state.installedVersion}`;
    }

    // Update available banner
    if (state.sourceVersion && state.installedVersion && state.sourceVersion !== state.installedVersion) {
        updateBanner.innerHTML =
            `Update available: v${state.sourceVersion} ` +
            `<a href="#" id="reload-link" style="color: #92400e; font-weight: 500;">(reload extension)</a>`;
        updateBanner.style.display = "block";
        // Attach reload handler
        const reloadLink = document.getElementById("reload-link");
        if (reloadLink) {
            reloadLink.addEventListener("click", (e) => {
                e.preventDefault();
                chrome.runtime.sendMessage({ type: "reload" });
            });
        }
    } else {
        updateBanner.style.display = "none";
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

// Reconnect button — forces this browser's extension to take over the MCP connection.
// This sends "reconnect" (NOT "reload") so the force flag is set properly.
document.getElementById("reconnect-btn").addEventListener("click", () => {
    wsStatus.textContent = "Reconnecting...";
    wsDot.className = "dot yellow";
    chrome.runtime.sendMessage({ type: "reconnect" });
});
