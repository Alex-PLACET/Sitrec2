// Single source of truth for wind field data sources.
//
// Three places consumed this list before:
//   - CustomSupport.js — dropdown label → internal key
//   - CNodeDisplayWindField.js — branches inside fetchWindForAltitude
//   - CNodeCompassUI.js — internal key → compass-label string
//
// Keeping them in sync was error-prone. Anyone adding a source now only
// updates this array.
//
// Fields:
//   key      — internal identifier used in this.source and save files
//   label    — full dropdown label in the Wind Data folder
//   short    — compact label for the compass widget ("Wind: <short>")
//   autoLoad — 'uwyo' / 'igra2' / null — which sounding source, if any,
//              auto-fetches when this source is selected and no profiles
//              of that kind are already loaded

export const WIND_SOURCES = [
    { key: "gfs",              label: "GFS (NOAA)",       short: "GFS",              autoLoad: null },
    { key: "uwyo",             label: "UWYO Soundings",   short: "UWYO",             autoLoad: "uwyo" },
    { key: "igra2",            label: "IGRA2 Soundings",  short: "IGRA2",            autoLoad: "igra2" },
    { key: "manual-soundings", label: "Manual Soundings", short: "Manual Soundings", autoLoad: null },
    { key: "openmeteo",        label: "open-meteo",       short: "open-meteo",       autoLoad: null },
    { key: "manual",           label: "Manual",           short: "Manual",           autoLoad: null },
];

export const DEFAULT_WIND_SOURCE_KEY = "manual";

export function windSourceByKey(key) {
    return WIND_SOURCES.find(s => s.key === key) ?? null;
}

export function windSourceByLabel(label) {
    return WIND_SOURCES.find(s => s.label === label) ?? null;
}

// { label: key, ... } — convenient for lil-gui's dropdown that takes an
// object whose keys are displayed and values are stored.
export function windSourceLabelsToKeys() {
    const out = {};
    for (const s of WIND_SOURCES) out[s.label] = s.key;
    return out;
}

// { key: short, ... } — used by the compass widget.
export function windSourceShortLabels() {
    const out = {};
    for (const s of WIND_SOURCES) out[s.key] = s.short;
    return out;
}
