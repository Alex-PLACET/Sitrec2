# Plan: IGRA Radiosonde Data Support

## Overview

Add support for importing radiosonde (weather balloon) sounding data into Sitrec, reconstructing the balloon's 3D trajectory from station position, altitude, elapsed time, and wind data, and displaying it as a track with a white 5m sphere following the balloon path.

Three data sources will be supported:
1. **IGRA2 files** — offline/imported fixed-width text files from NOAA NCEI
2. **UWYO TEXT:LIST** — University of Wyoming sounding HTML output (scraped)
3. **UWYO TEXT:CSV** — University of Wyoming CSV with per-second GPS positions (highest quality)

---

## Data Source Analysis

### IGRA2 Format (Fixed-Width Text)

**Source**: `https://www.ncei.noaa.gov/data/integrated-global-radiosonde-archive/access/`

Each file contains many soundings for one station. Structure:

```
Header: #USM00072451 2024  1  1 12 1156   65 ncdc-gts ncdc-gts  377626  -999695
Data:   1  -9999  10132   790  -53   96  259  -9999   200   36
        2  -9999   9930   297  -55   96  256  -9999   205   41
        ...
```

**Header fields** (fixed columns):
| Field | Cols | Description |
|-------|------|-------------|
| `#` | 1 | Header marker |
| ID | 2-12 | Station ID |
| YEAR | 14-17 | Year |
| MONTH | 19-20 | Month |
| DAY | 22-23 | Day |
| HOUR | 25-26 | UTC hour (99=missing) |
| RELTIME | 28-31 | Release time HHMM |
| NUMLEV | 33-36 | Number of data levels |
| LAT | 56-62 | Latitude × 10000 |
| LON | 64-71 | Longitude × 10000 |

**Data fields** (fixed columns):
| Field | Cols | Units | Missing |
|-------|------|-------|---------|
| LVLTYP1 | 1 | Level type | - |
| LVLTYP2 | 2 | Surface/tropo/other | - |
| ETIME | 4-8 | Elapsed time MMMSS | -9999 |
| PRESS | 10-15 | Pressure in Pa | -9999 |
| GPH | 17-21 | Geopotential height (m) | -9999 |
| TEMP | 23-27 | Temperature × 10 (°C) | -9999 |
| RH | 29-33 | Relative humidity × 10 | -9999 |
| DPDP | 35-39 | Dewpoint depression × 10 | -9999 |
| WDIR | 41-45 | Wind direction (°) | -9999 |
| WSPD | 47-51 | Wind speed × 10 (m/s) | -9999 |

**Key challenge**: No GPS lat/lon per level — only station position. Must integrate wind vectors to reconstruct horizontal trajectory.

### UWYO TEXT:LIST Format (HTML)

**Source**: `https://weather.uwyo.edu/cgi-bin/sounding?region=naconf&TYPE=TEXT%3ALIST&YEAR=2024&MONTH=01&FROM=0112&TO=0112&STNM=72451`

Returns HTML containing a `<pre>` block with fixed-width table:

```
   PRES   HGHT   TEMP   DWPT   RELH   MIXR   DRCT   SPED   THTA   THTE   THTV
    hPa      m      C      C      %   g/kg    deg    m/s      K      K      K
 1000.0    239   -5.3   -6.1     96   2.59    200    3.6  268.3  275.8  268.8
  993.0    297   -5.5   -6.3     96   2.56    205    4.1  268.5  275.9  269.0
```

Station metadata at bottom: `SLAT`, `SLON`, `SELV` (lat, lon, elevation).

**Key challenge**: Same as IGRA2 — no per-level GPS positions. Must extract station position from metadata and integrate wind.

### UWYO TEXT:CSV Format (Best Quality)

**Source**: `https://weather.uwyo.edu/cgi-bin/sounding?region=naconf&TYPE=TEXT%3ACSV&YEAR=2024&MONTH=01&FROM=0112&TO=0112&STNM=72451`

Returns HTML containing CSV with **per-second GPS positions**:

```csv
time,longitude,latitude,pressure_hPa,geopotential height_m,temperature_C,...,wind direction_degree,wind speed_m/s
2021-02-10 23:02:03,-147.8763,64.8163,1014.1,137,-16.9,...,34,0.3
2021-02-10 23:02:04,-147.8762,64.8162,1014.0,138,-15.2,...,342,0.8
```

**Best option for accuracy** — actual GPS positions, 1-second resolution, no wind integration needed. However, not all stations/soundings have CSV data available (requires GPS-equipped sondes).

---

## Architecture Design

### Component Diagram

```
                   ┌─────────────────────────┐
                   │    Data Sources          │
                   │  ┌─────────┐            │
                   │  │ IGRA2   │ .txt file  │
                   │  │ file    │────────┐   │
                   │  └─────────┘        │   │
                   │  ┌─────────┐        │   │
                   │  │ UWYO    │ HTML   │   │
                   │  │ LIST    │────────┤   │
                   │  └─────────┘        │   │
                   │  ┌─────────┐        │   │
                   │  │ UWYO    │ CSV    │   │
                   │  │ CSV     │────────┤   │
                   │  └─────────┘        │   │
                   └─────────────────────│───┘
                                         │
                                         ▼
                   ┌─────────────────────────────────────────┐
                   │         Parser Layer                     │
                   │                                         │
                   │  ParseIGRA2.js ──── parseIGRA2()        │
                   │  ParseUWYO.js ──── parseUWYOList()      │
                   │                     parseUWYOCSV()      │
                   │                                         │
                   │  Output: SondeData {                    │
                   │    station: {lat, lon, elev, id, name}  │
                   │    datetime: Date                       │
                   │    levels: [{                           │
                   │      time_s, pressure, height,          │
                   │      temp, rh, dewpoint,                │
                   │      windDir, windSpeed,                │
                   │      lat?, lon?   ← GPS if available    │
                   │    }]                                   │
                   │  }                                      │
                   └──────────────┬──────────────────────────┘
                                  │
                                  ▼
                   ┌─────────────────────────────────────────┐
                   │    Trajectory Reconstruction             │
                   │                                         │
                   │  SondeTrajectory.js                     │
                   │    reconstructTrajectory(sondeData)      │
                   │                                         │
                   │    If GPS positions available:           │
                   │      → Use lat/lon directly             │
                   │    Else:                                 │
                   │      → Integrate wind vectors from      │
                   │        station position upward           │
                   │                                         │
                   │  Output: [{                             │
                   │    time: epochMs,                       │
                   │    lat, lon, alt,                       │
                   │    pressure, temp, windDir, windSpeed   │
                   │  }]                                     │
                   └──────────────┬──────────────────────────┘
                                  │
                                  ▼
                   ┌─────────────────────────────────────────┐
                   │    Track Integration                     │
                   │                                         │
                   │  CTrackFileSonde.js (extends CTrackFile)│
                   │    canHandle() → detect format          │
                   │    toMISB()   → MISB array              │
                   │                                         │
                   │  Registered in CFileManager.js          │
                   │  trackFileClasses array                  │
                   └──────────────┬──────────────────────────┘
                                  │
                                  ▼
                   ┌─────────────────────────────────────────┐
                   │    Display Layer                         │
                   │                                         │
                   │  Track: CNodeTrackFromMISB              │
                   │    → standard MISB-based track          │
                   │                                         │
                   │  Line: CNodeDisplayTrack                │
                   │    → 3D track line with wall to ground  │
                   │                                         │
                   │  Sphere: CNodeDisplayTargetSphere       │
                   │    → white 5m sphere following track    │
                   │                                         │
                   │  (Future: atmospheric data overlay,     │
                   │   color-coded altitude, wind arrows)    │
                   └─────────────────────────────────────────┘
```

### Integration with Existing Architecture

The implementation follows Sitrec's established patterns:

1. **Parser** → Normalized intermediate format (`SondeData`)
2. **TrackFile** → `CTrackFileSonde` converts to MISB array (same as KML, STANAG, etc.)
3. **TrackManager** → Standard `makeMISBDataTrack()` / `makeTrackFromMISBData()` pipeline
4. **Display** → Standard `CNodeDisplayTrack` + `CNodeDisplayTargetSphere`

No new node types are strictly required — the existing track/display infrastructure handles everything once data is in MISB format.

---

## Implementation Plan

### Phase 1: Core Parsers

#### 1.1 Create `src/ParseSonde.js` — Unified sonde data parser

This file contains all three parsers, outputting a common `SondeData` structure:

```javascript
/**
 * @typedef {Object} SondeLevel
 * @property {number|null} time_s    - Seconds since launch (null if unavailable)
 * @property {number} pressure       - Pressure in hPa
 * @property {number} height         - Geopotential height in meters
 * @property {number|null} temp      - Temperature in °C
 * @property {number|null} rh        - Relative humidity %
 * @property {number|null} dewpoint  - Dewpoint temperature in °C
 * @property {number|null} windDir   - Wind direction in degrees (0=N)
 * @property {number|null} windSpeed - Wind speed in m/s
 * @property {number|null} lat       - GPS latitude (UWYO CSV only)
 * @property {number|null} lon       - GPS longitude (UWYO CSV only)
 */

/**
 * @typedef {Object} SondeData
 * @property {Object} station         - Station metadata
 * @property {number} station.lat     - Station latitude
 * @property {number} station.lon     - Station longitude
 * @property {number} station.elev    - Station elevation (m)
 * @property {string} station.id      - Station identifier
 * @property {string} station.name    - Station name
 * @property {Date} datetime          - Launch datetime (UTC)
 * @property {SondeLevel[]} levels    - Array of sounding levels
 * @property {string} source          - "igra2" | "uwyo-list" | "uwyo-csv"
 * @property {boolean} hasGPS         - Whether GPS positions are available
 */
```

**`parseIGRA2(text, soundingIndex=0)`**
- Parse fixed-width IGRA2 format
- Skip to the Nth sounding in the file (files contain many soundings)
- Extract header: station ID, date, lat/lon (÷10000)
- Extract data levels: pressure (÷100 → hPa), height, temp (÷10), wind dir, wind speed (÷10)
- Skip levels with missing height AND missing pressure
- Handle `-9999` (missing) and `-8888` (QA-removed) sentinels
- If ETIME is available, convert from MMMSS to seconds
- Return `SondeData` with `hasGPS: false`

**`parseIGRA2StationList(text)`** (utility, for future station picker)
- Parse the `igra2-station-list.txt` format
- Return array of `{id, lat, lon, elev, state, name, firstYear, lastYear, numObs}`

**`parseUWYOList(html)`**
- Extract `<pre>` content from HTML
- Parse the fixed-width table (skip header lines, dashes)
- Extract station metadata from bottom section (`Station latitude:`, etc.)
- Handle column variations (SPED vs SKNT for wind speed)
- Return `SondeData` with `hasGPS: false`

**`parseUWYOCSV(html)`**
- Extract CSV content from HTML `<pre>` tags
- Parse comma-separated values with header row
- Extract lat/lon/time per data point
- Return `SondeData` with `hasGPS: true`

**Sounding selector for IGRA2 multi-sounding files:**
- `countIGRA2Soundings(text)` — count `#` header lines
- `listIGRA2Soundings(text)` — return `[{index, date, hour, numLevels}]` for UI picker

#### 1.2 Create `src/SondeTrajectory.js` — Wind-integrated trajectory reconstruction

For data without GPS positions (IGRA2, UWYO TEXT:LIST), reconstruct the balloon's horizontal path:

```javascript
/**
 * Reconstruct balloon trajectory from station position + wind profile.
 *
 * Algorithm:
 * 1. Start at station lat/lon/elev
 * 2. For each consecutive pair of levels:
 *    a. Compute time interval (from ETIME, or estimate from ascent rate)
 *    b. Average the wind speed/direction between the two levels
 *    c. Compute horizontal displacement using wind vector × time
 *    d. Apply displacement to current lat/lon using great-circle math
 * 3. Output: array of {time, lat, lon, alt} positions
 *
 * When elapsed time is unavailable:
 *   Estimate from altitude difference using standard ascent rate (~5 m/s).
 *   This is typical for radiosondes (300 m/min = 5 m/s).
 *
 * @param {SondeData} sondeData
 * @returns {Array<{time: number, lat: number, lon: number, alt: number,
 *                   pressure: number, temp: number, windDir: number, windSpeed: number}>}
 */
function reconstructTrajectory(sondeData)
```

**Key implementation details:**

- **Ascent rate estimation**: Standard radiosonde ascent rate is ~5 m/s (300 m/min). Use this when elapsed time (`ETIME`) is missing. Calculate: `dt = (height2 - height1) / 5.0` seconds.

- **Wind integration**: For each level pair, average the wind direction and speed (using circular interpolation for direction), then:
  ```
  displacement_m = avg_windSpeed * dt
  bearing = windDir  (direction wind is FROM, so balloon moves WITH it → bearing = windDir + 180°,
                      but actually wind direction in IGRA2 is direction FROM,
                      so balloon moves TO = windDir + 180° mod 360,
                      but wait: in meteorology, wind FROM 270° means the balloon drifts EAST (90°))
  ```
  Actually: wind direction is where wind comes FROM. If wind is FROM 270° (west), the balloon moves toward 90° (east). So: `balloon_bearing = (windDir + 180) % 360`.

- **Great-circle displacement**: Use the formula:
  ```
  new_lat = asin(sin(lat) * cos(d/R) + cos(lat) * sin(d/R) * cos(bearing))
  new_lon = lon + atan2(sin(bearing) * sin(d/R) * cos(lat), cos(d/R) - sin(lat) * sin(new_lat))
  ```
  Where `d` = displacement in meters, `R` = Earth radius.

- **GPS positions available**: If `sondeData.hasGPS`, skip wind integration entirely — just use the provided lat/lon values directly.

- **Time handling**: Compute absolute epoch timestamps from `sondeData.datetime` + elapsed seconds per level.

### Phase 2: Track File Integration

#### 2.1 Create `src/TrackFiles/CTrackFileSonde.js`

Extends `CTrackFile` with the standard interface:

```javascript
export class CTrackFileSonde extends CTrackFile {
    static canHandle(filename, data) {
        // Detect IGRA2: starts with '#' header line + station ID pattern
        // Detect UWYO HTML: contains "University of Wyoming" or specific table headers
        // Detect UWYO CSV: contains "time,longitude,latitude,pressure"
        // data will be a string (raw text) for these formats
    }

    constructor(data) {
        super(data);
        this.soundings = [];  // parsed SondeData[] for IGRA2 multi-sounding files
        this.trajectories = []; // reconstructed trajectory arrays
        this._parse();
    }

    _parse() {
        // Detect format and parse
        // For IGRA2: parse all soundings (or limit to reasonable count)
        // For UWYO: parse single sounding
        // Reconstruct trajectory for each sounding
    }

    doesContainTrack() {
        return this.trajectories.length > 0 && this.trajectories[0].length > 0;
    }

    toMISB(trackIndex = 0) {
        const trajectory = this.trajectories[trackIndex];
        const misb = [];
        for (const point of trajectory) {
            const row = new Array(MISBFields);
            row[MISB.UnixTimeStamp] = point.time / 1000; // epoch seconds
            row[MISB.SensorLatitude] = point.lat;
            row[MISB.SensorLongitude] = point.lon;
            row[MISB.SensorTrueAltitude] = point.alt;
            misb.push(row);
        }
        return misb;
    }

    getShortName(trackIndex = 0, trackFileName = "") {
        const sonde = this.soundings[trackIndex];
        const dateStr = sonde.datetime.toISOString().slice(0, 10);
        const hour = sonde.datetime.getUTCHours().toString().padStart(2, '0');
        return `${sonde.station.id}_${dateStr}_${hour}Z`;
    }

    hasMoreTracks(trackIndex = 0) {
        return trackIndex < this.trajectories.length - 1;
    }

    getTrackCount() {
        return this.trajectories.length;
    }
}
```

#### 2.2 Register in `CFileManager.js`

Add to the `trackFileClasses` array at `src/CFileManager.js:98`:

```javascript
import {CTrackFileSonde} from "./TrackFiles/CTrackFileSonde";

const trackFileClasses = [
    CTrackFileKML,
    CTrackFileSTANAG,
    CTrackFileSRT,
    CTrackFileJSON,
    CTrackFileMISB,
    CTrackFileSonde,  // Add after more specific handlers
];
```

**Important**: CTrackFileSonde goes last because it handles text files, and we want more specific handlers (JSON, MISB) to match first. The `canHandle()` detection must be specific enough to avoid false positives on other text formats.

#### 2.3 File detection in `CFileManager.js`

The existing file import pipeline needs to handle raw text sonde files. Currently, `CFileManager` parses files based on extension:
- `.kml` → XML parser → KML handler
- `.json` → JSON parser → JSON handler
- `.srt` → raw text → SRT handler

Sonde files need similar routing:
- `.igra`, `.igra2`, `.txt` (with IGRA2 content detection) → raw text → Sonde handler
- `.html` (UWYO output saved as file) → raw text → Sonde handler
- `.csv` (UWYO CSV saved as file) → raw text → Sonde handler

Since `.txt` and `.csv` are generic extensions, **content-based detection in `canHandle()` is essential**:
- IGRA2: First line starts with `#` followed by 11-char station ID pattern (e.g., `#USM00072451`)
- UWYO LIST: Contains `<html>` and `"University of Wyoming"` or `PRES   HGHT   TEMP`
- UWYO CSV: First data line contains `time,longitude,latitude,pressure`

### Phase 3: Display Integration

#### 3.1 Sonde track display in Custom sitch

When a sonde file is imported into the custom sitch, the TrackManager pipeline handles it automatically:

1. File dropped → `CFileManager` detects → `CTrackFileSonde` parses
2. `TrackManager.makeMISBDataTrack()` creates `CNodeMISBDataTrack`
3. `TrackManager.makeTrackFromMISBData()` creates `CNodeTrackFromMISB`
4. `CNodeDisplayTrack` renders the track line

**Additional display for sonde tracks:**

The sonde track should automatically get:
- **White track line** with wall extending to ground (shows drift path)
- **White 5m sphere** following the balloon along the track
- **Track color**: White by default, distinguishing from aircraft tracks (which are typically colored)

#### 3.2 Automatic sphere attachment

In the TrackManager or CustomSupport, detect when a sonde track is imported and auto-create the sphere:

```javascript
// In TrackManager or CustomSupport, after track creation:
if (trackFile instanceof CTrackFileSonde) {
    new CNodeDisplayTargetSphere({
        id: trackId + "_sphere",
        track: trackId,
        size: 5,  // 5 meter radius
        color: new Color(1, 1, 1),  // white
        opacity: 1.0,
        layers: LAYER.MASK_WORLD,
    });
}
```

**Alternative approach**: Add a `createDisplayObjects()` method to `CTrackFileSonde` that creates the sphere after the track node is established. This keeps format-specific display logic inside the track file class.

### Phase 4: Automatic Data Import (UWYO)

#### 4.1 Sonde Fetch UI

Add a UI panel or dialog for fetching sonde data directly:

**Option A: Menu item in the custom sitch**
- File menu → "Import Sounding Data..."
- Opens a dialog with fields:
  - Station ID (WMO number, e.g., 72451)
  - Date (YYYY-MM-DD)
  - Hour (00Z or 12Z)
  - Format: UWYO CSV (preferred) / UWYO LIST / IGRA2
- Fetches data and imports as track

**Option B: Node-based (CNodeSondeFetch)**
- A new node type that fetches and caches sounding data
- Inputs: station ID, date, hour
- Output: SondeData → feeds into track pipeline
- More consistent with Sitrec's node architecture

**Recommended: Option A** for initial implementation (simpler, matches existing "Import" patterns), with Option B as a future enhancement.

#### 4.2 UWYO Fetch Implementation

```javascript
/**
 * Fetch sounding data from University of Wyoming.
 *
 * URL construction:
 *   Legacy: https://weather.uwyo.edu/cgi-bin/sounding?
 *           region=naconf&TYPE=TEXT%3ACSV&YEAR=2024&MONTH=01&FROM=0112&TO=0112&STNM=72451
 *
 *   New:    https://weather.uwyo.edu/wsgi/sounding?
 *           datetime=2024-01-01+12:00:00&id=72451&type=TEXT:CSV
 *
 * @param {string} stationId - WMO station number
 * @param {Date} date - Sounding date
 * @param {number} hour - UTC hour (typically 0 or 12)
 * @param {string} format - "CSV" or "LIST"
 * @returns {Promise<string>} Raw HTML response
 */
async function fetchUWYOSounding(stationId, date, hour, format = "CSV")
```

**CORS considerations**: UWYO does not provide CORS headers, so direct browser fetch will fail. Solutions:
1. **Proxy through Sitrec's PHP backend** (`sitrecServer/proxySounding.php`) — works for full server deployments
2. **Proxy through a CORS proxy** — fragile, not recommended for production
3. **User saves HTML file and imports** — works offline, no CORS issues
4. **Standalone/Electron mode**: Node.js can fetch without CORS restrictions

**Recommended**: Implement PHP proxy for server mode, fall back to file import for serverless/desktop.

#### 4.3 IGRA2 Fetch Implementation

IGRA2 data is accessed via direct file download (zip files):
- `https://www.ncei.noaa.gov/data/integrated-global-radiosonde-archive/access/data-por/{STATION_ID}-data.txt.zip`

**Challenges**:
- Files are large (entire station history, can be 10+ MB compressed)
- Need to decompress `.zip` in browser (use `JSZip` or `fflate`)
- Need to extract specific sounding by date from the large file
- Year-to-date files are smaller: `data-y2d/{STATION_ID}-data-beg2025.txt.zip`

**Recommended approach**:
1. For recent data → fetch year-to-date file (smaller)
2. For historical data → fetch full file (larger, but comprehensive)
3. Parse in-browser, present sounding selector to user
4. **CORS**: NCEI does provide CORS headers (or at least allows cross-origin), but may still need proxy

#### 4.4 Station Picker (Future Enhancement)

For a polished UX, add a station picker:
- Fetch `igra2-station-list.txt` (one-time, cache)
- Show stations on a map or searchable list
- Filter by country, name, or proximity to current sitch location
- Auto-select nearest station

This is a significant UI effort and should be a separate phase.

### Phase 5: Atmospheric Data Overlay (Future)

Beyond the trajectory track, the sonde data contains rich atmospheric information that could be displayed:

- **Color-coded track**: Color the track line by temperature, pressure, or humidity
- **Wind barbs**: Show wind direction/speed barbs at each level along the track
- **Skew-T diagram**: In-app mini Skew-T/Log-P diagram panel (significant complexity)
- **Atmospheric profile node**: `CNodeAtmosphericProfile` that exposes temp/pressure/wind at any altitude for use by other nodes (e.g., refraction calculations)

---

## File Inventory

### New Files

| File | Purpose |
|------|---------|
| `src/ParseSonde.js` | Parsers for IGRA2, UWYO LIST, UWYO CSV formats |
| `src/SondeTrajectory.js` | Wind integration / trajectory reconstruction |
| `src/TrackFiles/CTrackFileSonde.js` | CTrackFile subclass for sonde data |
| `tests/ParseSonde.test.js` | Unit tests for all three parsers |
| `tests/SondeTrajectory.test.js` | Unit tests for trajectory reconstruction |
| `tests/CTrackFileSonde.test.js` | Integration tests for track file detection/conversion |
| `tests/data/sample-igra2.txt` | Sample IGRA2 data for tests |
| `tests/data/sample-uwyo-list.html` | Sample UWYO TEXT:LIST output for tests |
| `tests/data/sample-uwyo-csv.html` | Sample UWYO TEXT:CSV output for tests |
| `sitrecServer/proxySounding.php` | CORS proxy for UWYO/IGRA2 fetch (server mode) |

### Modified Files

| File | Change |
|------|--------|
| `src/CFileManager.js` | Add `CTrackFileSonde` to `trackFileClasses`; ensure raw text files route to sonde handler |
| `src/CustomSupport.js` | Auto-create white sphere when sonde track is imported (or handle in TrackManager) |
| `src/TrackManager.js` | Optional: detect sonde tracks and apply sonde-specific display defaults |

---

## Trajectory Reconstruction Algorithm (Detail)

### Wind Integration Method

Given a sonde profile with N levels, each having `{height, windDir, windSpeed, time_s}`:

```
Input:
  station = {lat0, lon0, elev0}
  levels[0..N-1] = sorted by height ascending

Algorithm:
  positions = []
  currentLat = station.lat0
  currentLon = station.lon0

  For i = 0 to N-1:
    level = levels[i]

    if i == 0:
      positions.push({lat: currentLat, lon: currentLon, alt: level.height, ...})
      continue

    // Time interval
    if level.time_s != null AND levels[i-1].time_s != null:
      dt = level.time_s - levels[i-1].time_s
    else:
      dt = (level.height - levels[i-1].height) / 5.0  // assume 5 m/s ascent

    if dt <= 0: continue  // skip duplicate or descending levels

    // Average wind between levels (circular interpolation for direction)
    avgSpeed = (level.windSpeed + levels[i-1].windSpeed) / 2
    avgDir = circularMean(level.windDir, levels[i-1].windDir)

    // Skip if wind data missing
    if avgSpeed == null or avgDir == null:
      positions.push({lat: currentLat, lon: currentLon, alt: level.height, ...})
      continue

    // Balloon moves in direction opposite to "wind from"
    balloonBearing = (avgDir + 180) % 360

    // Displacement
    displacement_m = avgSpeed * dt

    // Great-circle update
    {currentLat, currentLon} = greatCircleDestination(
      currentLat, currentLon, balloonBearing, displacement_m
    )

    positions.push({
      time: launchEpoch + level.time_s * 1000,
      lat: currentLat,
      lon: currentLon,
      alt: level.height,
      pressure: level.pressure,
      temp: level.temp,
      windDir: level.windDir,
      windSpeed: level.windSpeed
    })

  return positions
```

### Validation

The reconstructed trajectory can be validated against:
1. UWYO CSV data (which has GPS positions) — compare wind-integrated path vs actual GPS
2. Known balloon launches with recovered GPS data
3. Sanity checks: typical sonde drift is 50-200 km over 1-2 hours, reaching 20-35 km altitude

---

## Multi-Sounding IGRA2 File Handling

IGRA2 files can contain thousands of soundings for a single station. Importing an entire file would create thousands of tracks, which is impractical.

### Approach: Sounding Selector

When an IGRA2 file with multiple soundings is detected:

1. **Scan headers**: Parse only the `#` header lines to build a sounding index
2. **Present selector**: Show a dialog/dropdown with available soundings:
   ```
   2024-01-01 00Z (65 levels)
   2024-01-01 12Z (72 levels)
   2024-01-02 00Z (58 levels)
   ...
   ```
3. **Import selected**: Parse and import only the selected sounding(s)
4. **Date filter**: Allow filtering by date range to narrow the list

For the initial implementation, a simpler approach:
- If file contains only 1 sounding → import it
- If file contains multiple → import the first one, log a message about additional soundings
- Add `soundingIndex` parameter to `CTrackFileSonde` for future multi-select

### Alternative: Pre-extracted Single Soundings

Users can extract single soundings from IGRA2 files before importing. This is the simplest workflow and avoids the need for a sounding selector UI initially.

---

## CORS Proxy Design (`proxySounding.php`)

```php
<?php
// proxySounding.php — proxy sounding data requests to avoid CORS issues
//
// Parameters:
//   source=uwyo|igra2
//   station=72451           (WMO station number)
//   date=2024-01-01         (YYYY-MM-DD)
//   hour=12                 (UTC hour: 0 or 12)
//   format=csv|list         (UWYO only)
//
// Returns: raw text/html from upstream source

// Rate limit: max 1 request per 10 seconds per IP
// Validate station ID format (numeric, 5 digits)
// Validate date format
// Whitelist allowed upstream hosts
```

---

## Edge Cases and Error Handling

1. **Missing wind data at some levels**: Skip those levels in trajectory reconstruction; interpolate position linearly between levels with wind data
2. **Missing height data**: If pressure is available, use the standard atmosphere formula to estimate height: `h = 44330 * (1 - (P/1013.25)^0.1903)`
3. **ETIME available for only some levels**: Use ETIME where available, estimate for others using ascent rate between known-time levels
4. **Descending balloon (after burst)**: IGRA2 data may include descent points; handle by detecting altitude decrease and continuing the trajectory (not reversing)
5. **UWYO rate limiting**: UWYO may rate-limit or block automated requests; implement backoff and informative error messages
6. **Station not found**: Clear error message with suggestion to check station ID
7. **No data for date**: UWYO returns an HTML page with "No data available" — detect and report
8. **Multiple soundings per day**: Some stations launch 4+ sondes per day; present all options
9. **Missing station position in IGRA2**: Use `lat`/`lon` from header (per-sounding, may differ for mobile stations)

---

## Testing Strategy

### Unit Tests (`tests/ParseSonde.test.js`)

- Parse sample IGRA2 header correctly (station ID, date, lat/lon conversion)
- Parse sample IGRA2 data levels (pressure conversion Pa→hPa, temp ÷10, wind ÷10)
- Handle missing values (`-9999`) correctly
- Handle QA-removed values (`-8888`) correctly
- Parse UWYO TEXT:LIST table correctly
- Handle UWYO column variations (SPED vs SKNT)
- Parse UWYO CSV with GPS positions
- Parse station metadata from UWYO bottom section

### Unit Tests (`tests/SondeTrajectory.test.js`)

- Reconstruct trajectory with known wind profile, verify displacement
- Test with GPS data (should pass through directly)
- Test with missing elapsed time (ascent rate estimation)
- Test circular wind direction interpolation (wrap around 360°/0°)
- Test edge case: all wind data missing (track should be vertical above station)
- Test great-circle displacement calculation accuracy

### Integration Tests (`tests/CTrackFileSonde.test.js`)

- `canHandle()` correctly identifies IGRA2 text
- `canHandle()` correctly identifies UWYO HTML
- `canHandle()` does NOT match KML, JSON, SRT, STANAG, or other formats
- `toMISB()` produces valid MISB array
- `getShortName()` returns descriptive names
- Multi-sounding IGRA2 file: `getTrackCount()` correct, `hasMoreTracks()` works

### Visual Regression Test

Add a regression test with a sample sonde track loaded:
- Create a test sitch or use custom sitch with pre-loaded sonde data
- Verify track renders with sphere

---

## Implementation Priority / Phasing

### Phase 1 (MVP): File Import
1. `ParseSonde.js` — IGRA2 parser + UWYO LIST parser
2. `SondeTrajectory.js` — Wind integration algorithm
3. `CTrackFileSonde.js` — TrackFile integration
4. Register in `CFileManager.js`
5. Unit tests for parsers and trajectory
6. Manual testing: drag-and-drop IGRA2 file → track appears with sphere

### Phase 2: UWYO CSV + Polish
7. UWYO CSV parser (GPS positions — best quality)
8. Auto-sphere creation for sonde tracks
9. Sonde-specific track display defaults (white, wall to ground)
10. Integration tests

### Phase 3: Auto-Fetch
11. `proxySounding.php` CORS proxy
12. UWYO fetch UI (station ID, date, hour)
13. IGRA2 year-to-date file fetch
14. Sounding selector for multi-sounding files

### Phase 4: Enhanced Display
15. Color-coded track by temperature or altitude
16. Wind barbs along track
17. Station picker UI with map
18. Atmospheric profile node for cross-feature integration

---

## Open Questions

1. **Sonde sphere size**: 5m radius specified, but at high altitudes (30km) a 5m sphere will be invisible in most views. Should the sphere scale with altitude or camera distance? Or use a fixed screen-space size?

2. **Frame mapping**: Sitrec is frame-based. A sonde ascent lasts ~90 minutes with ~60-100 data levels. How should this map to frames?
   - Option A: One frame per data level (e.g., 65 frames for 65 levels)
   - Option B: Map to sitch frame count (interpolate between levels)
   - Option C: Use real elapsed time mapped to sitch time scale
   - **Recommendation**: Option A for simplicity — set sitch `frames` to match level count, with `fps` derived from total ascent time / frame count.

3. **Multi-track integration**: When a sonde track is imported alongside aircraft tracks, should the sitch's frame range adjust to encompass both? This is a broader TrackManager concern.

4. **Altitude reference**: IGRA2 reports geopotential height (≈ MSL for practical purposes below 30km). Should we treat this as MSL or HAE? The difference is small but exists. **Recommendation**: Treat as MSL, same as most aviation data in Sitrec.

5. **File extension handling**: IGRA2 files are `.txt`. Many other formats also use `.txt`. The content-based detection in `canHandle()` must be very specific to avoid false positives. The IGRA2 header pattern (`#` + 11-char station ID + fixed-column date) is distinctive enough.
