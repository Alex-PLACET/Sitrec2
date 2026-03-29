// TLE satellite filter dialog -- modeless panel for filtering satellites by
// spatial, orbital, and name criteria. Integrates with CSatellite.filterSatellites()
// via the tleFilterResults array.

import {Frustum, Matrix4, Ray, Sphere, Vector3} from "three";
import {NodeMan, setRenderOne, Sit} from "./Globals";
import {par} from "./par";
import {ECEFToLLAVD_radii, wgs84} from "./LLA-ECEF-ENU";
import {bestSat} from "./TLEUtils";
import {degrees} from "./mathUtils";
import {intersectSphere2, V3} from "./threeUtils";


// ─── Shared Dialog Chrome ───────────────────────────────────────────────────

const DIALOG_STYLE = `
    background: #2a2a2a; border-radius: 8px; padding: 20px;
    min-width: 380px; max-width: 560px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    font-family: Arial, sans-serif; color: white;
`;

const BTN_STYLE = `
    padding: 8px 16px; border: none; border-radius: 4px;
    cursor: pointer; font-size: 13px; margin: 4px;
`;

function makeButton(text, bg, onClick) {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = BTN_STYLE + `background: ${bg}; color: white;`;
    btn.onclick = onClick;
    return btn;
}

function makeDraggablePanel() {
    const dialog = document.createElement('div');
    dialog.style.cssText = DIALOG_STYLE + `
        position: fixed; top: 80px; right: 20px;
        z-index: 10000; cursor: default;
        max-height: 85vh; overflow-y: auto;
    `;
    for (const evt of ['dblclick', 'mousedown', 'mouseup', 'click', 'wheel', 'contextmenu']) {
        dialog.addEventListener(evt, (e) => e.stopPropagation());
    }

    const titleBar = document.createElement('div');
    titleBar.style.cssText = `
        cursor: move; margin: -20px -20px 10px -20px; padding: 10px 20px;
        background: #333; border-radius: 8px 8px 0 0; user-select: none;
        font-size: 16px; font-weight: bold; color: #fff;
    `;
    titleBar.textContent = 'Filter TLEs';
    dialog.appendChild(titleBar);

    let dragging = false, dragX = 0, dragY = 0;
    const onMouseMove = (e) => {
        if (!dragging) return;
        dialog.style.left = (e.clientX - dragX) + 'px';
        dialog.style.top = (e.clientY - dragY) + 'px';
    };
    const stopDrag = () => {
        dragging = false;
        window.removeEventListener('mousemove', onMouseMove, true);
        window.removeEventListener('mouseup', stopDrag, true);
    };
    titleBar.addEventListener('mousedown', (e) => {
        dragging = true;
        const rect = dialog.getBoundingClientRect();
        dialog.style.left = rect.left + 'px';
        dialog.style.top = rect.top + 'px';
        dialog.style.right = '';
        dragX = e.clientX - dialog.offsetLeft;
        dragY = e.clientY - dialog.offsetTop;
        window.addEventListener('mousemove', onMouseMove, true);
        window.addEventListener('mouseup', stopDrag, true);
        e.preventDefault();
    });

    document.body.appendChild(dialog);
    return dialog;
}


// ─── Filter Row Helpers ─────────────────────────────────────────────────────

const ROW_STYLE = `display: flex; align-items: center; margin: 6px 0; gap: 8px;`;
const LABEL_STYLE = `font-size: 13px; color: #ddd; min-width: 130px;`;
const INPUT_STYLE = `
    background: #444; border: 1px solid #555; border-radius: 3px;
    color: #eee; padding: 4px 6px; font-size: 13px; width: 70px;
`;
const SECTION_STYLE = `
    margin: 10px 0 4px 0; padding: 4px 0; font-size: 14px;
    font-weight: bold; color: #aaa; border-bottom: 1px solid #444;
`;

function makeCheckboxRow(label, onChange) {
    const row = document.createElement('div');
    row.style.cssText = ROW_STYLE;
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.style.cssText = 'margin: 0;';
    cb.onchange = () => onChange(cb.checked);
    const lbl = document.createElement('span');
    lbl.textContent = label;
    lbl.style.cssText = LABEL_STYLE;
    row.appendChild(cb);
    row.appendChild(lbl);
    return {row, checkbox: cb};
}

function makeRangeRow(label, minDefault, maxDefault, unit, onChange) {
    const row = document.createElement('div');
    row.style.cssText = ROW_STYLE;
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.style.cssText = 'margin: 0;';
    const lbl = document.createElement('span');
    lbl.textContent = label;
    lbl.style.cssText = LABEL_STYLE;
    const minInput = document.createElement('input');
    minInput.type = 'number';
    minInput.value = minDefault;
    minInput.style.cssText = INPUT_STYLE;
    const dash = document.createElement('span');
    dash.textContent = '–';
    dash.style.cssText = 'color: #888;';
    const maxInput = document.createElement('input');
    maxInput.type = 'number';
    maxInput.value = maxDefault;
    maxInput.style.cssText = INPUT_STYLE;
    const unitSpan = document.createElement('span');
    unitSpan.textContent = unit || '';
    unitSpan.style.cssText = 'font-size: 12px; color: #888;';

    const fire = () => onChange(cb.checked, parseFloat(minInput.value), parseFloat(maxInput.value));
    cb.onchange = fire;
    minInput.onchange = fire;
    maxInput.onchange = fire;

    row.appendChild(cb);
    row.appendChild(lbl);
    row.appendChild(minInput);
    row.appendChild(dash);
    row.appendChild(maxInput);
    row.appendChild(unitSpan);
    return {row, checkbox: cb, minInput, maxInput};
}

function makeTextRow(label, placeholder, onChange) {
    const row = document.createElement('div');
    row.style.cssText = ROW_STYLE;
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.style.cssText = 'margin: 0;';
    const lbl = document.createElement('span');
    lbl.textContent = label;
    lbl.style.cssText = LABEL_STYLE;
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = placeholder || '';
    input.style.cssText = INPUT_STYLE + 'width: 160px;';

    const fire = () => onChange(cb.checked, input.value);
    cb.onchange = fire;
    input.onchange = fire;
    input.oninput = fire;

    row.appendChild(cb);
    row.appendChild(lbl);
    row.appendChild(input);
    return {row, checkbox: cb, input};
}

function makeValueRow(label, defaultVal, unit, onChange) {
    const row = document.createElement('div');
    row.style.cssText = ROW_STYLE;
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.style.cssText = 'margin: 0;';
    const lbl = document.createElement('span');
    lbl.textContent = label;
    lbl.style.cssText = LABEL_STYLE;
    const input = document.createElement('input');
    input.type = 'number';
    input.value = defaultVal;
    input.style.cssText = INPUT_STYLE;
    const unitSpan = document.createElement('span');
    unitSpan.textContent = unit || '';
    unitSpan.style.cssText = 'font-size: 12px; color: #888;';

    const fire = () => onChange(cb.checked, parseFloat(input.value));
    cb.onchange = fire;
    input.onchange = fire;

    row.appendChild(cb);
    row.appendChild(lbl);
    row.appendChild(input);
    row.appendChild(unitSpan);
    return {row, checkbox: cb, input};
}

function makeSection(title) {
    const div = document.createElement('div');
    div.textContent = title;
    div.style.cssText = SECTION_STYLE;
    return div;
}


// ─── Filter Logic ───────────────────────────────────────────────────────────

function getAltitudeFromEcefKm(ecef) {
    const lla = ECEFToLLAVD_radii(ecef);
    return lla.z / 1000;
}

function getCameraAltitudeKm() {
    try {
        // Use the lookCamera (observer/aircraft position in the sitch),
        // not the mainCamera (3D viewport which can be zoomed out to orbit).
        const cam = NodeMan.get('lookCamera').camera;
        if (!cam) return null;
        const lla = ECEFToLLAVD_radii(cam.position);
        return lla.z / 1000;
    } catch {
        return null;
    }
}

function getLookCamera() {
    try {
        const lookCamNode = NodeMan.get('lookCamera');
        return lookCamNode?.camera || null;
    } catch {
        return null;
    }
}

function wildcardToRegex(pattern) {
    // Escape regex special chars except *, then convert * to .*
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp('^' + escaped + '$', 'i');
}

/**
 * Check spatial filters against a single ECEF position.
 * Returns true if the position passes all enabled spatial filters.
 */
function checkSpatialFilters(ecef, filterOptions) {
    const altKm = getAltitudeFromEcefKm(ecef);

    if (filterOptions.aboveCameraEnabled) {
        const camAlt = getCameraAltitudeKm();
        if (camAlt === null || altKm === null || altKm <= camAlt) return false;
    }

    if (filterOptions.belowCameraEnabled) {
        const camAlt = getCameraAltitudeKm();
        if (camAlt === null || altKm === null || altKm >= camAlt) return false;
    }

    if (filterOptions.altitudeEnabled) {
        if (altKm === null || altKm < filterOptions.altMinKm || altKm > filterOptions.altMaxKm) return false;
    }

    if (filterOptions.frustumEnabled) {
        const lookCam = getLookCamera();
        if (!lookCam) return false;
        const frustum = new Frustum();
        const m = new Matrix4().multiplyMatrices(lookCam.projectionMatrix, lookCam.matrixWorldInverse);
        frustum.setFromProjectionMatrix(m);
        if (!frustum.containsPoint(ecef)) return false;
    }

    if (filterOptions.centerlineEnabled) {
        const lookCam = getLookCamera();
        if (!lookCam) return false;
        const camPos = lookCam.position;
        const lookDir = new Vector3(0, 0, -1).applyQuaternion(lookCam.quaternion);
        const toSat = new Vector3().subVectors(ecef, camPos).normalize();
        const angleDeg = degrees(Math.acos(Math.min(1, Math.max(-1, lookDir.dot(toSat)))));
        if (angleDeg > filterOptions.centerlineMaxDeg) return false;
    }

    if (filterOptions.hiddenByEarthEnabled) {
        const lookCam = getLookCamera();
        if (!lookCam) return false;
        const camPos = lookCam.position;
        const toSat = new Vector3().subVectors(ecef, camPos);
        const dist = toSat.length();
        toSat.normalize();
        const ray = new Ray(camPos, toSat);
        const earthSphere = new Sphere(V3(0, 0, 0), wgs84.POLAR_RADIUS);
        const hit0 = V3(), hit1 = V3();
        const intersects = intersectSphere2(ray, earthSphere, hit0, hit1);
        if (intersects && hit0.distanceTo(camPos) < dist) return false;
    }

    return true;
}

/** True if any spatial filter checkbox is enabled. */
function hasSpatialFilter(filterOptions) {
    return filterOptions.aboveCameraEnabled || filterOptions.belowCameraEnabled
        || filterOptions.altitudeEnabled || filterOptions.frustumEnabled
        || filterOptions.centerlineEnabled || filterOptions.hiddenByEarthEnabled;
}

/**
 * Build an array of sample dates spanning the sitch time range.
 * Samples ~1 per second of sim time, capped at 60.
 */
function buildSampleDates() {
    const startMs = new Date(Sit.startTime).getTime();
    const endFrame = Sit.frames - 1;
    const totalMs = endFrame * 1000 * (Sit.simSpeed ?? 1) / Sit.fps;
    if (totalMs <= 0) return [new Date(startMs)];
    const numSamples = Math.min(60, Math.max(2, Math.ceil(totalMs / 1000)));
    const dates = [];
    for (let s = 0; s < numSamples; s++) {
        const t = s / (numSamples - 1);
        dates.push(new Date(startMs + t * totalMs));
    }
    return dates;
}

/**
 * Apply all enabled TLE filters. Returns boolean[] (one per satData entry).
 */
export function applyTLEFilters(satellites, filterOptions, currentDate) {
    const results = [];

    // Pre-compile name regexes once outside the loop to avoid per-satellite overhead.
    // If the pattern is invalid, set to null so the filter is skipped.
    let wildcardRe = null;
    if (filterOptions.nameWildcardEnabled && filterOptions.nameWildcardPattern) {
        try { wildcardRe = wildcardToRegex(filterOptions.nameWildcardPattern); } catch { /* skip */ }
    }
    let nameRe = null;
    if (filterOptions.nameRegexEnabled && filterOptions.nameRegexPattern) {
        try { nameRe = new RegExp(filterOptions.nameRegexPattern, 'i'); } catch { /* skip */ }
        // Guard against ReDoS: test the regex against a long string. If it takes
        // too long on a single test, the pattern is pathological — discard it.
        if (nameRe) {
            const start = performance.now();
            nameRe.test('A'.repeat(500));
            if (performance.now() - start > 50) {
                console.warn('TLE filter: regex too slow, disabling:', filterOptions.nameRegexPattern);
                nameRe = null;
            }
        }
    }

    const spatial = hasSpatialFilter(filterOptions);
    // For "any frame in range" mode, pre-compute sample dates and frame data
    const sampleDates = (spatial && filterOptions.anyFrameInRange) ? buildSampleDates() : null;
    // Build sample timestamps (ms) for frame-to-sample mapping during rendering
    const sampleTimesMS = sampleDates ? sampleDates.map(d => d.getTime()) : null;
    // Per-satellite frame visibility data: 'on', 'off', or boolean[] for changeable
    const perSatFrameData = sampleDates ? [] : null;

    for (let i = 0; i < satellites.TLEData.satData.length; i++) {
        const satData = satellites.TLEData.satData[i];
        let pass = true;

        // ── Non-spatial filters (checked once, independent of position) ──

        // Name (wildcard)
        if (pass && wildcardRe) {
            if (!wildcardRe.test(satData.name)) pass = false;
        }

        // Name RE (regex)
        if (pass && nameRe) {
            if (!nameRe.test(satData.name)) pass = false;
        }

        // Orbital parameters (from satrec)
        const satrec = bestSat(satData.satrecs, currentDate);

        // Eccentricity
        if (pass && filterOptions.eccentricityEnabled) {
            const ecc = satrec.ecco;
            if (ecc === undefined || ecc < filterOptions.eccMin || ecc > filterOptions.eccMax) pass = false;
        }

        // Inclination (satrec.inclo is in radians)
        if (pass && filterOptions.inclinationEnabled) {
            const incDeg = satrec.inclo !== undefined ? degrees(satrec.inclo) : null;
            if (incDeg === null || incDeg < filterOptions.incMin || incDeg > filterOptions.incMax) pass = false;
        }

        // Period (derived from mean motion, satrec.no is in radians/minute)
        if (pass && filterOptions.periodEnabled) {
            const periodMin = satrec.no > 0 ? (2 * Math.PI / satrec.no) : null;
            if (periodMin === null || periodMin < filterOptions.periodMin || periodMin > filterOptions.periodMax) pass = false;
        }

        // Speed (approximate orbital velocity from mean motion and semi-major axis)
        if (pass && filterOptions.speedEnabled) {
            const GM = 398600.4418;
            const nRadPerSec = satrec.no / 60;
            if (nRadPerSec > 0) {
                const a = Math.pow(GM / (nRadPerSec * nRadPerSec), 1/3); // km
                const v = nRadPerSec * a; // km/s
                if (v < filterOptions.speedMinKmS || v > filterOptions.speedMaxKmS) pass = false;
            } else {
                pass = false;
            }
        }

        // ── Spatial filters ──
        if (pass && spatial) {
            if (sampleDates) {
                // "Any frame in range": propagate to each sample, build per-frame
                // visibility array. Satellite passes filter if visible at ANY sample.
                const samples = new Array(sampleDates.length);
                let onCount = 0;
                for (let s = 0; s < sampleDates.length; s++) {
                    const ecef = satellites.calcSatECEF(satrec, sampleDates[s]);
                    const vis = !!(ecef && checkSpatialFilters(ecef, filterOptions));
                    samples[s] = vis;
                    if (vis) onCount++;
                }
                if (onCount === 0) {
                    pass = false;
                    perSatFrameData.push('off');
                } else if (onCount === sampleDates.length) {
                    perSatFrameData.push('on');
                } else {
                    perSatFrameData.push(samples);
                }
            } else {
                // Current frame: use the satellite's current ECEF position
                if (!satData.ecef || satData.invalidPosition) {
                    pass = false;
                } else {
                    pass = checkSpatialFilters(satData.ecef, filterOptions);
                }
            }
        } else if (perSatFrameData) {
            // Satellite passed non-spatial but no spatial filters active,
            // or failed non-spatial filters entirely.
            perSatFrameData.push(pass ? 'on' : 'off');
        }

        results.push(pass);
    }

    // Store per-frame visibility data on the satellites object for use during rendering.
    // null when not in "any frame in range" mode.
    satellites.tleFilterFrameData = perSatFrameData ? {
        sampleTimesMS,
        perSat: perSatFrameData,
    } : null;

    return results;
}


// ─── Dialog UI ──────────────────────────────────────────────────────────────

/**
 * Show the TLE filter dialog (modeless, draggable).
 * @param {CSatellite} satellites - The CSatellite instance
 * @param {Function} onApply - Called with boolean[] filter results when Apply is clicked
 * @param {Function} onCancel - Called when Cancel is clicked (to restore previous state)
 * @param {Date} currentDate - Current simulation date
 */
export function showTLEFilterDialog(satellites, onApply, onCancel, currentDate) {
    const dialog = makeDraggablePanel();

    const filterOptions = {
        aboveCameraEnabled: false,
        belowCameraEnabled: false,
        altitudeEnabled: false, altMinKm: 200, altMaxKm: 2000,
        frustumEnabled: false,
        centerlineEnabled: false, centerlineMaxDeg: 10,
        hiddenByEarthEnabled: true,
        nameWildcardEnabled: false, nameWildcardPattern: '',
        nameRegexEnabled: false, nameRegexPattern: '',
        eccentricityEnabled: false, eccMin: 0, eccMax: 0.1,
        inclinationEnabled: false, incMin: 0, incMax: 180,
        periodEnabled: false, periodMin: 80, periodMax: 200,
        speedEnabled: false, speedMinKmS: 0, speedMaxKmS: 10,
        anyFrameInRange: false,
    };

    function showProgress() {
        document.body.style.cursor = 'wait';
        dialog.style.cursor = 'wait';
    }

    function hideProgress() {
        document.body.style.cursor = '';
        dialog.style.cursor = 'default';
    }

    // Status line
    const statusLine = document.createElement('div');
    statusLine.style.cssText = 'font-size: 12px; color: #888; margin: 8px 0;';
    const totalSats = satellites.TLEData.satData.length;
    statusLine.textContent = `${totalSats} satellites loaded`;

    let updatePending = null;

    function runFilter() {
        const results = applyTLEFilters(satellites, filterOptions, currentDate);
        const passing = results.filter(Boolean).length;
        const modeLabel = filterOptions.anyFrameInRange && hasSpatialFilter(filterOptions) ? ' (any frame)' : '';
        statusLine.textContent = `${passing} / ${totalSats} satellites match${modeLabel}`;
        onApply(results);
        hideProgress();
    }

    function updatePreview() {
        showProgress();
        if (filterOptions.anyFrameInRange && hasSpatialFilter(filterOptions)) {
            // Expensive path: yield to browser so checkbox + progress bar
            // repaint before the computation blocks the thread.
            if (updatePending) clearTimeout(updatePending);
            updatePending = setTimeout(() => { updatePending = null; runFilter(); }, 0);
        } else {
            // Fast path: run synchronously, no visible delay.
            runFilter();
        }
    }

    // ── Live update polling ──
    // Re-run spatial filters when the camera moves or the frame changes.
    let liveInterval = null;
    let lastCamX = NaN, lastCamY = NaN, lastCamZ = NaN;
    let lastCamQX = NaN, lastCamQY = NaN, lastCamQZ = NaN, lastCamQW = NaN;
    let lastFov = NaN, lastFrame = -1;

    function startLiveUpdates() {
        if (liveInterval) return;
        liveInterval = setInterval(() => {
            if (!hasSpatialFilter(filterOptions)) return;
            try {
                const cam = NodeMan.get('lookCamera').camera;
                const p = cam.position;
                const q = cam.quaternion;
                const fov = cam.fov ?? NaN;
                const changed = p.x !== lastCamX || p.y !== lastCamY || p.z !== lastCamZ
                    || q.x !== lastCamQX || q.y !== lastCamQY || q.z !== lastCamQZ || q.w !== lastCamQW
                    || fov !== lastFov || par.frame !== lastFrame;
                if (!changed) return;
                lastCamX = p.x; lastCamY = p.y; lastCamZ = p.z;
                lastCamQX = q.x; lastCamQY = q.y; lastCamQZ = q.z; lastCamQW = q.w;
                lastFov = fov; lastFrame = par.frame;

                if (filterOptions.anyFrameInRange) {
                    // In range mode, frame data is precalculated — just re-render
                    // so updateAllSatellites picks up the per-frame visibility.
                    setRenderOne(2);
                } else {
                    // Current-frame mode: re-run filters with new camera state
                    updatePreview();
                }
            } catch { /* lookCamera may not exist */ }
        }, 200);
    }

    function stopLiveUpdates() {
        if (liveInterval) {
            clearInterval(liveInterval);
            liveInterval = null;
        }
    }

    startLiveUpdates();

    // ── Spatial Filters ──
    dialog.appendChild(makeSection('Spatial Filters'));

    const anyFrameRow = makeCheckboxRow('Any frame in range', (checked) => {
        filterOptions.anyFrameInRange = checked;
        updatePreview();
    });
    anyFrameRow.row.title = 'When checked, a satellite passes if it meets the spatial criteria at any point during the sitch time range (slower). When unchecked, only the current frame is checked (updates live as you scrub).';
    dialog.appendChild(anyFrameRow.row);

    const aboveRow = makeCheckboxRow('Above Camera', (checked) => {
        filterOptions.aboveCameraEnabled = checked;
        updatePreview();
    });
    dialog.appendChild(aboveRow.row);

    const belowRow = makeCheckboxRow('Below Camera', (checked) => {
        filterOptions.belowCameraEnabled = checked;
        updatePreview();
    });
    dialog.appendChild(belowRow.row);

    const altRow = makeRangeRow('Altitude Range', 200, 2000, 'km', (checked, min, max) => {
        filterOptions.altitudeEnabled = checked;
        filterOptions.altMinKm = min;
        filterOptions.altMaxKm = max;
        updatePreview();
    });
    dialog.appendChild(altRow.row);

    const frustumRow = makeCheckboxRow('Crosses View Frustum', (checked) => {
        filterOptions.frustumEnabled = checked;
        updatePreview();
    });
    dialog.appendChild(frustumRow.row);

    const centerlineRow = makeValueRow('Close to Centerline', 10, 'deg', (checked, val) => {
        filterOptions.centerlineEnabled = checked;
        filterOptions.centerlineMaxDeg = val;
        updatePreview();
    });
    dialog.appendChild(centerlineRow.row);

    const hiddenByEarthRow = makeCheckboxRow('Not Hidden by Earth', (checked) => {
        filterOptions.hiddenByEarthEnabled = checked;
        updatePreview();
    });
    hiddenByEarthRow.checkbox.checked = true; // on by default
    dialog.appendChild(hiddenByEarthRow.row);

    // ── Name Filters ──
    dialog.appendChild(makeSection('Name Filters'));

    const nameWildRow = makeTextRow('Name', 'e.g. STARLINK*', (checked, val) => {
        filterOptions.nameWildcardEnabled = checked;
        filterOptions.nameWildcardPattern = val;
        updatePreview();
    });
    dialog.appendChild(nameWildRow.row);

    const nameReRow = makeTextRow('Name RE', 'regex pattern', (checked, val) => {
        filterOptions.nameRegexEnabled = checked;
        filterOptions.nameRegexPattern = val;
        updatePreview();
    });
    dialog.appendChild(nameReRow.row);

    // ── Orbital Parameters ──
    dialog.appendChild(makeSection('Orbital Parameters'));

    const eccRow = makeRangeRow('Eccentricity', 0, 0.1, '', (checked, min, max) => {
        filterOptions.eccentricityEnabled = checked;
        filterOptions.eccMin = min;
        filterOptions.eccMax = max;
        updatePreview();
    });
    dialog.appendChild(eccRow.row);

    const incRow = makeRangeRow('Inclination', 0, 180, 'deg', (checked, min, max) => {
        filterOptions.inclinationEnabled = checked;
        filterOptions.incMin = min;
        filterOptions.incMax = max;
        updatePreview();
    });
    dialog.appendChild(incRow.row);

    const periodRow = makeRangeRow('Period', 80, 200, 'min', (checked, min, max) => {
        filterOptions.periodEnabled = checked;
        filterOptions.periodMin = min;
        filterOptions.periodMax = max;
        updatePreview();
    });
    dialog.appendChild(periodRow.row);

    const speedRow = makeRangeRow('Speed', 0, 10, 'km/s', (checked, min, max) => {
        filterOptions.speedEnabled = checked;
        filterOptions.speedMinKmS = min;
        filterOptions.speedMaxKmS = max;
        updatePreview();
    });
    dialog.appendChild(speedRow.row);

    // ── Status + Buttons ──
    dialog.appendChild(statusLine);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display: flex; justify-content: flex-end; margin-top: 10px; gap: 4px;';

    btnRow.appendChild(makeButton('Clear All', '#555', () => {
        // Uncheck all checkboxes
        [aboveRow, belowRow, frustumRow, anyFrameRow, hiddenByEarthRow].forEach(r => { r.checkbox.checked = false; });
        [altRow, eccRow, incRow, periodRow, speedRow].forEach(r => { r.checkbox.checked = false; });
        [nameWildRow, nameReRow].forEach(r => { r.checkbox.checked = false; });
        centerlineRow.checkbox.checked = false;
        // Reset all filter flags
        Object.keys(filterOptions).forEach(k => {
            if (k.endsWith('Enabled')) filterOptions[k] = false;
        });
        filterOptions.anyFrameInRange = false;
        updatePreview();
    }));

    btnRow.appendChild(makeButton('Apply', '#1976d2', () => {
        const results = applyTLEFilters(satellites, filterOptions, currentDate);
        onApply(results);
        stopLiveUpdates();
        if (dialog.parentNode) dialog.parentNode.removeChild(dialog);
    }));

    btnRow.appendChild(makeButton('Cancel', '#757575', () => {
        onCancel();
        stopLiveUpdates();
        if (dialog.parentNode) dialog.parentNode.removeChild(dialog);
    }));

    dialog.appendChild(btnRow);

    return dialog;
}
