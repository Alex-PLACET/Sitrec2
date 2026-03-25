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
const currentCmdEl = document.getElementById("current-cmd");
const historyListEl = document.getElementById("history-list");

let elapsedTimer = null;

function formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}

function stripPrefix(action) {
    return action.replace(/^sitrec_/, "");
}

function renderCurrentCommand(cmd) {
    if (!cmd) {
        currentCmdEl.style.display = "none";
        if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; }
        return;
    }
    currentCmdEl.style.display = "block";
    const updateElapsed = () => {
        const elapsed = Date.now() - cmd.startTime;
        let html = `<span class="action">${stripPrefix(cmd.action)}</span> <span class="elapsed">${formatDuration(elapsed)}</span>`;
        if (cmd.detail) html += `<span class="detail">${escHtml(cmd.detail)}</span>`;
        currentCmdEl.innerHTML = html;
    };
    updateElapsed();
    if (elapsedTimer) clearInterval(elapsedTimer);
    elapsedTimer = setInterval(updateElapsed, 200);
}

function renderHistory(history) {
    if (!history || history.length === 0) {
        historyListEl.innerHTML = '<li style="color:#9ca3af;">No commands yet</li>';
        return;
    }
    historyListEl.innerHTML = history.map(cmd => {
        const icon = cmd.ok ? "\u2713" : "\u2717";
        const iconColor = cmd.ok ? "#22c55e" : "#ef4444";
        const dur = formatDuration(cmd.endTime - cmd.startTime);
        const detail = cmd.detail ? cmd.detail : "";
        return `<li><span class="icon" style="color:${iconColor}">${icon}</span><span class="action">${stripPrefix(cmd.action)}</span><span class="detail">${escHtml(detail)}</span><span class="dur">${dur}</span></li>`;
    }).join("");
}

function escHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

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

    // Show the Sitrec tab in the current window (not the global default)
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
        const sitrecTab = tabs.find(t => t.url && (
            t.url.includes("metabunk.org/sitrec") ||
            t.url.includes("metabunk.org/build") ||
            /localhost:\d+\/sitrec/.test(t.url) ||
            /localhost:\d+\/build/.test(t.url)
        ));
        if (sitrecTab) {
            tabDot.className = "dot green";
            // Show a short label from the URL path (e.g. "/sitrec" or "/build2")
            const path = new URL(sitrecTab.url).pathname.split("/").filter(Boolean)[0] || "sitrec";
            tabStatus.textContent = `/${path} (#${sitrecTab.id})`;
        } else if (state.sitrecTabId) {
            tabDot.className = "dot green";
            tabStatus.textContent = `Tab #${state.sitrecTabId} (other window)`;
        } else {
            tabDot.className = "dot yellow";
            tabStatus.textContent = "Not found";
        }
    });

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

    // Activity section
    renderCurrentCommand(state.currentCommand);
    renderHistory(state.commandHistory);

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

