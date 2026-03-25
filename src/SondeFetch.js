// SondeFetch.js — Fetch radiosonde sounding data from UWYO via the PHP proxy
// and import it into Sitrec as a track.

import {SITREC_SERVER, isServerless} from "./configUtils";
import {FileManager} from "./Globals";
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

/**
 * Import Sounding dialog — prompts user for station/date/hour, fetches from UWYO,
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

    // Step 1: Station ID
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
    if (stationId === null) return; // cancelled

    // Step 2: Date
    const today = new Date().toISOString().slice(0, 10);
    const dateStr = await promptForText({
        title: "Import Sounding — Date",
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
        title: "Import Sounding — Hour",
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
        console.log(`Fetching sounding: station=${stationId.trim()}, date=${dateStr.trim()}, hour=${hour}`);
        const html = await fetchUWYOSounding(stationId.trim(), dateStr.trim(), hour, "list");

        // Feed it into the import pipeline as if it were a dropped file
        const filename = `sounding_${stationId.trim()}_${dateStr.trim()}_${String(hour).padStart(2, '0')}Z.html`;
        const encoder = new TextEncoder();
        const arrayBuffer = encoder.encode(html).buffer;

        await FileManager.parseResult(filename, arrayBuffer);
        console.log("Sounding imported: " + filename);

    } catch (e) {
        alert("Failed to import sounding:\n" + e.message);
        console.error("Sounding import error:", e);
    }
}
