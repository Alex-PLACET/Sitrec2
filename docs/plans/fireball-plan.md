# Fireball Meteor Visualization — Plan

## Motivation

Visualize fireball meteor trajectories in Sitrec: a 3D track extending from space
through the atmosphere, with an object moving along it at the correct time and speed.

Initial target: the **Feb 4, 2026 ~1210 UTC** North Island NZ fireball (green-hued,
seen from Kaitaia and across the North Island). Trajectory data not yet available —
contact Fireballs Aotearoa (fireballsaotearoa@gmail.com) for triangulated solution.

## Data Formats

### GMN (Global Meteor Network) Trajectory Summary — Primary Format

The richest publicly available source. Tab/semicolon-delimited text files.
Data at: `https://globalmeteornetwork.org/data/traj_summary_data/`

Key fields for visualization:

| Field | Description |
|-------|-------------|
| `Beginning UTC Time` | Timestamp of meteor start |
| `LatBeg +N (deg)` | Latitude of begin point |
| `LonBeg +E (deg)` | Longitude of begin point |
| `HtBeg (km)` | Begin height above WGS84 |
| `LatEnd +N (deg)` | Latitude of end point |
| `LonEnd +E (deg)` | Longitude of end point |
| `HtEnd (km)` | End height above WGS84 |
| `Vinit (km/s)` | Initial velocity |
| `Vavg (km/s)` | Average velocity |
| `Duration (sec)` | Observed duration |
| `Azim +E of N (deg)` | Radiant azimuth (entry direction) |
| `Elev (deg)` | Radiant elevation (entry angle) |
| `Peak AbsMag` | Peak absolute magnitude |
| `Peak Ht (km)` | Height at peak brightness |

Also includes full orbital elements (a, e, i, peri, node, q, Q), geocentric/heliocentric
velocities, shower association, uncertainty values for most fields, and station metadata.

Files available: daily, monthly, yearly, and all-time. Monthly files are ~50-100 MB.
Python loader: `wmpl.Formats.WmplTrajectorySummary.loadTrajectorySummaryFast()`

### CNEOS (NASA/JPL) Fireball API — Large Bolides Only

REST API: `GET https://ssd-api.jpl.nasa.gov/fireball.api`

Provides a **single point** (peak brightness location) with velocity vector.
Only detects large events via US government sensors.

Key fields: `date`, `lat`, `lon`, `alt` (km), `vx/vy/vz` (km/s, geocentric Earth-fixed),
`energy` (radiated, J×10^10), `impact-e` (total, kt TNT).

Query params: `date-min`, `date-max`, `vel-comp=true`, `req-loc=true`.

Limitation: single point, not begin/end trajectory. Must extrapolate trajectory from
velocity vector.

### IMO / AMS Fireball Reports — Visual Reports

Web-based. Individual event pages with observer reports. KML downloads when sufficient
reports exist for triangulation. Often insufficient data for 3D trajectory solution.

### Fireballs Aotearoa — NZ Camera Network

`https://fireballs.nz/` — NZ-specific camera network. May have triangulated trajectory
for the Feb 4 event. Contact: fireballsaotearoa@gmail.com

## Known Events Near NZ

### Jan 30, 2026, 10:25:37 UTC — Wellington fireball (CNEOS confirmed)
- **Position:** 45.0°S, 174.5°E, altitude 89.0 km
- **Velocity:** 71.1 km/s (vx=-2.1, vy=68.8, vz=17.7 km/s)
- **Energy:** 3.4×10^10 J radiated, 0.12 kt impact
- **Visual:** Blue/teal/green streak, east-to-west, fragmenting, smoke trail >5 min
- **Seen from:** Wellington, Lower Hutt, Petone, Seddon

### Feb 4, 2026, ~1210 UTC — North Island fireball (NOT in CNEOS)
- **Local time:** ~1:10 AM Feb 5 NZDT
- **Visual:** Green-hued, lit up the whole sky, breaking apart with flashing lights
- **Seen from:** Kaitaia and across North Island
- **No trajectory data publicly available yet**

## Implementation Plan

### Phase 1: Manual Entry Meteor Track

Support defining a meteor trajectory by hand (begin/end LLA + velocity + time).
This lets us visualize immediately without needing parsed data files.

#### Data model

```javascript
{
    kind: "MeteorTrack",
    beginLat: -36.0,       // degrees, +N
    beginLon: 174.5,       // degrees, +E
    beginAlt: 95000,       // meters above WGS84
    endLat: -37.2,
    endLon: 175.1,
    endAlt: 35000,         // meters
    velocity: 25000,       // m/s (initial velocity)
    dateTime: "2026-02-05T01:10:00Z",  // UTC
    // Optional:
    duration: 3.5,         // seconds (if known; otherwise computed from velocity + distance)
    peakAlt: 55000,        // meters (for brightness variation)
    magnitude: -8,         // peak absolute magnitude
    extendAbove: 200000,   // meters — how far to extend the track line above begin point
}
```

#### New files

1. **`src/nodes/CNodeMeteorTrack.js`** — Track node
   - Extends `CNode` (or `CNodeEmptyArray`)
   - Takes begin/end LLA, velocity, duration
   - Computes intermediate positions for each frame:
     - Straight-line interpolation in ECEF between begin and end points
     - Timing: maps duration to frame range (e.g., frames 100–200 out of 900)
     - Deceleration model (optional): meteors slow down as they penetrate atmosphere
   - `getValue(frame)` returns `{position, lla}` for the meteor at that frame
   - Also provides the full trajectory line (for the track display extending into space)
   - Extends track backward above `beginAlt` along the entry vector to show the
     approach from space (configurable `extendAbove` distance)

2. **`src/nodes/CNodeDisplayMeteor.js`** (optional, or use existing `CNodeDisplayTrack`)
   - Renders the trajectory line
   - Could add: glow effect, trail that fades behind the meteor, brightness variation
   - The "space extension" portion rendered differently (thinner/dashed) vs atmospheric portion

3. **`src/sitch/SitMeteor.js`** — Example sitch for meteor visualization
   - Sets coordinate center near the fireball location
   - Short time range matching the meteor duration + context (e.g., 10 seconds total)
   - Camera positioned for good viewing angle
   - Terrain/map below for geographic reference

#### How it fits existing architecture

- Meteor track → same interface as any other track (array of `{position, lla}` per frame)
- Display → reuse `CNodeDisplayTrack` with `extendToGround: false`
- Moving object → `CNode3DObject` with `CNodeControllerTrackPosition`
- Object model → glowing sphere or custom particle effect
- The meteor only occupies a few seconds of the sitch timeline; before/after it simply
  isn't visible (or the object is positioned at the start/end of the trajectory)

### Phase 2: GMN File Parser

Parse GMN trajectory summary format to automatically populate meteor track parameters.

1. **`src/TrackFiles/CTrackFileMeteor.js`** — Parser
   - `canHandle()`: detect GMN format by header line
   - `toMISB()`: convert to internal format
   - Handle semicolon-delimited fields with embedded uncertainties
   - Extract begin/end LLA, velocities, duration, shower ID

2. **Filter/search UI**: GMN files contain thousands of events. Need to filter by:
   - Date range
   - Geographic region (lat/lon bounding box)
   - Minimum brightness (magnitude)
   - Shower association

### Phase 3: CNEOS API Integration

Fetch fireball data directly from NASA's API.

1. **`src/nodes/CNodeCNEOSFireball.js`** — API fetch + trajectory extrapolation
   - Fetch from `ssd-api.jpl.nasa.gov/fireball.api`
   - Single point + velocity vector → extrapolate begin/end points:
     - End point ≈ reported position (peak brightness, typically 20–50 km alt)
     - Begin point ≈ back-project velocity vector to ~100–120 km altitude
   - Energy/magnitude data for brightness modeling

### Phase 4: Visual Enhancements

- Glowing/emissive meteor object (point light + bloom post-processing)
- Fading trail behind the meteor (particle system or fading line)
- Fragmentation visualization at low altitude
- Brightness variation along trajectory (using peak height / F parameter)
- Smoke/persistent train after passage
- Ground shadow/light flash at peak brightness
- Night sky background appropriate for date/time/location

## Key Architectural Decisions

### Frame mapping
A meteor lasts 0.5–5 seconds but a sitch might run at 30fps over 30 seconds (900 frames).
Options:
- **Dedicated short sitch**: 5-second sitch at 30fps = 150 frames, meteor fills most of it
- **Embedded in longer sitch**: meteor occupies frames 200–250 of a 900-frame sitch,
  allowing camera flyaround before/after. Use `startFrame`/`endFrame` on the meteor node.

Recommend: start with a dedicated short sitch, add embedding support later.

### Coordinate precision
Meteor altitudes (30–120 km) are well above typical Sitrec objects (aircraft at ≤15 km)
but well below satellites (400+ km). The existing LLA→ECEF→ENU pipeline handles this
range fine. The `CNodeSatelliteTrack` already works at much higher altitudes.

### Velocity
Meteors move at 11–72 km/s (Mach 32–212). At 30fps, a 25 km/s meteor moves ~833 meters
per frame. This is fast but not a problem for rendering — it just means the track
positions change rapidly. The object will appear to streak across the sky, which is
correct behavior.
