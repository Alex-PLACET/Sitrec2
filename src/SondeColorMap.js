// SondeColorMap.js — Map sonde atmospheric data to colors for track visualization.
//
// Provides color ramps for altitude, temperature, and pressure.
// Used as a per-frame color input for CNodeDisplayTrack.

import {Color} from "three";

/**
 * Map a value to a color using a multi-stop gradient.
 * @param {number} value - The input value
 * @param {Array<{value: number, color: Color}>} stops - Sorted gradient stops
 * @returns {Color}
 */
export function gradientColor(value, stops) {
    if (stops.length === 0) return new Color(1, 1, 1);
    if (value <= stops[0].value) return stops[0].color.clone();
    if (value >= stops[stops.length - 1].value) return stops[stops.length - 1].color.clone();

    for (var i = 0; i < stops.length - 1; i++) {
        if (value >= stops[i].value && value <= stops[i + 1].value) {
            var t = (value - stops[i].value) / (stops[i + 1].value - stops[i].value);
            return stops[i].color.clone().lerp(stops[i + 1].color, t);
        }
    }
    return stops[stops.length - 1].color.clone();
}

// Standard altitude color ramp: surface (blue) → stratosphere (red)
export var ALTITUDE_STOPS = [
    { value: 0,     color: new Color(0.0, 0.2, 1.0) },   // Deep blue — surface
    { value: 3000,  color: new Color(0.0, 0.8, 1.0) },   // Cyan — lower troposphere
    { value: 8000,  color: new Color(0.0, 1.0, 0.3) },   // Green — mid troposphere
    { value: 15000, color: new Color(1.0, 1.0, 0.0) },   // Yellow — upper troposphere
    { value: 25000, color: new Color(1.0, 0.5, 0.0) },   // Orange — lower stratosphere
    { value: 35000, color: new Color(1.0, 0.0, 0.0) },   // Red — upper stratosphere
];

// Temperature color ramp: cold (blue) → warm (red)
export var TEMPERATURE_STOPS = [
    { value: -80, color: new Color(0.0, 0.0, 1.0) },   // Deep blue — stratospheric cold
    { value: -60, color: new Color(0.0, 0.5, 1.0) },   // Cyan-blue
    { value: -40, color: new Color(0.0, 1.0, 1.0) },   // Cyan
    { value: -20, color: new Color(0.0, 1.0, 0.0) },   // Green
    { value: 0,   color: new Color(1.0, 1.0, 0.0) },   // Yellow
    { value: 20,  color: new Color(1.0, 0.5, 0.0) },   // Orange
    { value: 40,  color: new Color(1.0, 0.0, 0.0) },   // Red — hot
];

// Pressure color ramp: high pressure/surface (blue) → low pressure/top (red)
export var PRESSURE_STOPS = [
    { value: 5,    color: new Color(1.0, 0.0, 0.0) },   // Red — near-burst
    { value: 50,   color: new Color(1.0, 0.5, 0.0) },   // Orange
    { value: 200,  color: new Color(1.0, 1.0, 0.0) },   // Yellow
    { value: 500,  color: new Color(0.0, 1.0, 0.3) },   // Green
    { value: 850,  color: new Color(0.0, 0.8, 1.0) },   // Cyan
    { value: 1013, color: new Color(0.0, 0.2, 1.0) },   // Blue — surface
];

/**
 * Get a color for a sonde data point based on the selected color mode.
 * @param {"altitude"|"temperature"|"pressure"|"none"} mode
 * @param {number|null} altitude - meters
 * @param {number|null} temperature - °C
 * @param {number|null} pressure - hPa
 * @param {Color} fallbackColor - color when mode is "none" or data missing
 * @returns {Color}
 */
export function sondeColor(mode, altitude, temperature, pressure, fallbackColor) {
    switch (mode) {
        case "altitude":
            if (altitude != null) return gradientColor(altitude, ALTITUDE_STOPS);
            break;
        case "temperature":
            if (temperature != null) return gradientColor(temperature, TEMPERATURE_STOPS);
            break;
        case "pressure":
            if (pressure != null) return gradientColor(pressure, PRESSURE_STOPS);
            break;
    }
    return fallbackColor ? fallbackColor.clone() : new Color(1, 1, 1);
}
