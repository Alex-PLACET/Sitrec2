// SondeFetch.js — Fetch radiosonde sounding data from UWYO via the PHP proxy
// and import it into Sitrec as a track.

import {SITREC_SERVER, SITREC_APP, isServerless} from "./configUtils";
import {FileManager, Sit} from "./Globals";
import {promptForText} from "./TextPrompt";
import {detectSondeFormat} from "./ParseSonde";

/**
 * Fetch a sounding from UWYO via the proxySounding.php CORS proxy.
 *
 * @param {string} stationId - 5-digit WMO station number (e.g. "72451")
 * @param {string} date - Date string YYYY-MM-DD
 * @param {number|string} hour - UTC hour (0 or 12)
 * @param {string} format - "csv" or "list"
 * @returns {Promise<string>} Raw HTML response from UWYO
 */
export async function fetchUWYOSounding(stationId, date, hour, format = "list") {
    const url = SITREC_SERVER + "proxySounding.php"
        + "?source=uwyo"
        + "&station=" + encodeURIComponent(stationId)
        + "&date=" + encodeURIComponent(date)
        + "&hour=" + encodeURIComponent(hour)
        + "&format=" + encodeURIComponent(format);

    const response = await fetch(url);

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `HTTP ${response.status}`);
    }

    const text = await response.text();

    if (!text || text.trim().length === 0) {
        throw new Error("Empty response from UWYO proxy");
    }

    // Verify the response is actually sonde data
    const detectedFormat = detectSondeFormat(text);
    if (!detectedFormat) {
        throw new Error("UWYO returned data but it doesn't look like sounding data. "
            + "The station may not exist or no data is available for this date/time.");
    }

    return text;
}

// Station list cache
let stationListCache = null;

/**
 * Load the IGRA2 station list JSON (cached after first load).
 * @returns {Promise<Array<{id, wmo, name, lat, lon, elev, country, firstYear, lastYear}>>}
 */
async function loadStationList() {
    if (stationListCache) return stationListCache;
    const url = SITREC_APP + "data/igra2-stations.json";
    const resp = await fetch(url);
    if (!resp.ok) throw new Error("Failed to load station list");
    stationListCache = await resp.json();
    return stationListCache;
}

/**
 * Haversine distance in km between two lat/lon points.
 */
function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Show a searchable station picker dialog.
 * Sorts by proximity to the current sitch center.
 * @returns {Promise<{wmo: string, name: string}|null>} Selected station or null if cancelled.
 */
export async function pickStation() {
    const stations = await loadStationList();

    // Sort by distance to sitch center
    const sitLat = Sit.lat || 0;
    const sitLon = Sit.lon || 0;
    const sorted = stations
        .filter(s => s.wmo) // only stations with WMO numbers (needed for UWYO)
        .map(s => ({ ...s, dist: haversineKm(sitLat, sitLon, s.lat, s.lon) }))
        .sort((a, b) => a.dist - b.dist);

    return new Promise((resolve) => {
        // Build modal dialog
        const overlay = document.createElement("div");
        overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:10000;display:flex;align-items:center;justify-content:center;";

        const dialog = document.createElement("div");
        dialog.style.cssText = "background:#1a1a2e;color:#e0e0e0;border-radius:8px;padding:20px;width:500px;max-height:70vh;display:flex;flex-direction:column;font-family:sans-serif;";

        dialog.innerHTML = `
            <h3 style="margin:0 0 10px 0;color:#fff;">Select Radiosonde Station</h3>
            <input type="text" id="sonde-search" placeholder="Search by name, ID, or country..."
                style="width:100%;padding:8px;margin-bottom:10px;background:#2a2a4a;color:#fff;border:1px solid #444;border-radius:4px;box-sizing:border-box;font-size:14px;">
            <div style="font-size:11px;color:#888;margin-bottom:5px;">Sorted by distance from sitch center (${sitLat.toFixed(1)}°, ${sitLon.toFixed(1)}°)</div>
            <div id="sonde-station-list" style="overflow-y:auto;flex:1;max-height:50vh;"></div>
            <div style="margin-top:10px;text-align:right;">
                <button id="sonde-cancel" style="padding:6px 16px;background:#444;color:#fff;border:none;border-radius:4px;cursor:pointer;">Cancel</button>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const searchInput = dialog.querySelector("#sonde-search");
        const listDiv = dialog.querySelector("#sonde-station-list");
        const cancelBtn = dialog.querySelector("#sonde-cancel");

        function renderList(filter) {
            const needle = (filter || "").toLowerCase();
            const filtered = needle
                ? sorted.filter(s => s.name.toLowerCase().includes(needle) || s.wmo.includes(needle) || s.id.toLowerCase().includes(needle) || s.country.toLowerCase().includes(needle))
                : sorted.slice(0, 50); // show nearest 50 by default

            listDiv.innerHTML = filtered.slice(0, 100).map(s =>
                `<div class="sonde-station-item" data-wmo="${s.wmo}" data-name="${s.name}"
                    style="padding:6px 8px;cursor:pointer;border-bottom:1px solid #333;font-size:13px;"
                    onmouseover="this.style.background='#3a3a5a'" onmouseout="this.style.background='transparent'">
                    <b>${s.wmo}</b> — ${s.name} <span style="color:#888;font-size:11px;">(${s.country}, ${s.dist.toFixed(0)} km, ${s.lat.toFixed(2)}° ${s.lon.toFixed(2)}°)</span>
                </div>`
            ).join("");
        }

        renderList("");
        searchInput.focus();
        searchInput.addEventListener("input", () => renderList(searchInput.value));

        listDiv.addEventListener("click", (e) => {
            const item = e.target.closest(".sonde-station-item");
            if (item) {
                document.body.removeChild(overlay);
                resolve({ wmo: item.dataset.wmo, name: item.dataset.name });
            }
        });

        cancelBtn.addEventListener("click", () => {
            document.body.removeChild(overlay);
            resolve(null);
        });

        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) {
                document.body.removeChild(overlay);
                resolve(null);
            }
        });

        searchInput.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                document.body.removeChild(overlay);
                resolve(null);
            }
        });
    });
}

/**
 * Auto-import the nearest station's latest sounding. For quick testing.
 * Uses today's date and 12Z by default.
 */
export async function importNearestSounding() {
    if (isServerless) return;
    try {
        var stations = await loadStationList();
        var sitLat = Sit.lat || 0;
        var sitLon = Sit.lon || 0;
        var nearest = stations
            .filter(function(s) { return s.wmo; })
            .sort(function(a, b) { return haversineKm(sitLat, sitLon, a.lat, a.lon) - haversineKm(sitLat, sitLon, b.lat, b.lon); })[0];
        if (!nearest) { alert("No stations found"); return; }

        var today = new Date().toISOString().slice(0, 10);
        console.log("Auto-importing nearest station: " + nearest.wmo + " " + nearest.name + " (" + today + " 12Z)");
        var html = await fetchUWYOSounding(nearest.wmo, today, 12, "list");
        var filename = "sounding_" + nearest.wmo + "_" + today + "_12Z.html";
        await FileManager.parseResult(filename, new TextEncoder().encode(html).buffer);
        console.log("Imported: " + filename);
    } catch (e) {
        alert("Auto-import failed:\n" + e.message);
    }
}

/**
 * Import Sounding dialog — station picker + date/hour, fetches from UWYO,
 * and imports into the current sitch as a track.
 *
 * Called from the File menu.
 */
export async function importSoundingDialog() {
    if (isServerless) {
        alert("Import Sounding requires a server with PHP. "
            + "In serverless mode, download the sounding HTML from weather.uwyo.edu and drag-drop it.");
        return;
    }

    // Step 1: Station picker
    let station;
    try {
        station = await pickStation();
    } catch (e) {
        // Fall back to manual entry if station list fails to load
        console.warn("Station picker failed, falling back to manual entry:", e.message);
        const stationId = await promptForText({
            title: "Import Sounding — Station",
            message: "Enter WMO station number (5 digits).\n"
                + "Examples: 72451 (Sterling VA), 72426 (Amarillo TX), 72681 (Boise ID)",
            defaultValue: "72451",
            validate: (val) => {
                if (!/^\d{5}$/.test(val.trim())) return "Must be exactly 5 digits";
                return "";
            },
        });
        if (stationId === null) return;
        station = { wmo: stationId.trim(), name: stationId.trim() };
    }
    if (!station) return;

    // Step 2: Date
    const today = new Date().toISOString().slice(0, 10);
    const dateStr = await promptForText({
        title: `Import Sounding — Date (${station.wmo} ${station.name})`,
        message: "Enter sounding date (YYYY-MM-DD).\n"
            + "Most stations launch at 00Z and 12Z daily.",
        defaultValue: today,
        validate: (val) => {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(val.trim())) return "Use YYYY-MM-DD format";
            return "";
        },
    });
    if (dateStr === null) return;

    // Step 3: Hour
    const hourStr = await promptForText({
        title: `Import Sounding — Hour (${station.wmo} ${station.name})`,
        message: "Enter UTC launch hour (0 or 12).\n"
            + "Standard radiosonde launches are at 00Z and 12Z.",
        defaultValue: "12",
        validate: (val) => {
            const v = val.trim();
            if (v !== "0" && v !== "00" && v !== "12") return "Must be 0 or 12";
            return "";
        },
    });
    if (hourStr === null) return;

    const hour = parseInt(hourStr.trim());

    // Fetch the sounding data
    try {
        console.log(`Fetching sounding: station=${station.wmo}, date=${dateStr.trim()}, hour=${hour}`);
        const html = await fetchUWYOSounding(station.wmo, dateStr.trim(), hour, "list");

        // Feed it into the import pipeline
        const filename = `sounding_${station.wmo}_${dateStr.trim()}_${String(hour).padStart(2, '0')}Z.html`;
        const encoder = new TextEncoder();
        const arrayBuffer = encoder.encode(html).buffer;

        await FileManager.parseResult(filename, arrayBuffer);
        console.log("Sounding imported: " + filename);

    } catch (e) {
        alert("Failed to import sounding:\n" + e.message);
        console.error("Sounding import error:", e);
    }
}
