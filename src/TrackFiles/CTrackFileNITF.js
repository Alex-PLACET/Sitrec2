/**
 * CTrackFileNITF.js - Track file for NITF geolocation metadata
 *
 * Produces a single-point MISB track representing the camera/sensor position
 * derived from NITF image corner coordinates. The camera is placed above the
 * image center at an altitude estimated from ground coverage and assumed FOV.
 */

import {CTrackFile} from "./CTrackFile";
import {MISB, MISBFields} from "../MISBFields";

export class CTrackFileNITF extends CTrackFile {
    /**
     * @param {Object} nitfMeta - Metadata extracted from NITF image segment
     * @param {Array<{lat: number, lon: number}>} nitfMeta.corners - 4 corner coords (UL, UR, LR, LL)
     * @param {Date|null} nitfMeta.datetime - Image acquisition date/time
     * @param {string} nitfMeta.title - Image title/identifier
     * @param {Object} nitfMeta.tres - Tagged Record Extensions
     * @param {number} nitfMeta.width - Image width in pixels
     * @param {number} nitfMeta.height - Image height in pixels
     */
    constructor(nitfMeta) {
        super(null);
        this.corners = nitfMeta.corners;
        this.datetime = nitfMeta.datetime;
        this.title = nitfMeta.title || 'NITF';
        this.imageWidth = nitfMeta.width;
        this.imageHeight = nitfMeta.height;
        this.tres = nitfMeta.tres || {};

        this._calculateGeometry();
    }

    static canHandle(filename, data) {
        // NITF track files are created internally by NITFParser, not by file detection
        return (typeof filename === 'string' && filename.toLowerCase().endsWith('.nitftrack'));
    }

    /**
     * Calculate center point, ground dimensions, GSD, and estimated camera altitude.
     * For satellite imagery the IGEOLO corners form a rotated quadrilateral (the
     * sensor swath), so we derive image heading and true edge lengths rather than
     * using axis-aligned lat/lon ranges.
     */
    _calculateGeometry() {
        if (!this.corners || this.corners.length < 4) return;

        // Corners: [0]=UL, [1]=UR, [2]=LR, [3]=LL (image pixel order)

        // Center point (average of 4 corners)
        this.centerLat = (this.corners[0].lat + this.corners[1].lat +
                          this.corners[2].lat + this.corners[3].lat) / 4;
        this.centerLon = (this.corners[0].lon + this.corners[1].lon +
                          this.corners[2].lon + this.corners[3].lon) / 4;

        // Conversion factors at center latitude
        const metersPerDegLat = 111319.9;
        const metersPerDegLon = 111319.9 * Math.cos(this.centerLat * Math.PI / 180);

        // Compute image heading from corner geometry.
        // The "up" direction of the image runs from bottom to top (LL→UL, LR→UR).
        const leftUpDLat  = this.corners[0].lat - this.corners[3].lat;  // UL - LL
        const leftUpDLon  = this.corners[0].lon - this.corners[3].lon;
        const rightUpDLat = this.corners[1].lat - this.corners[2].lat;  // UR - LR
        const rightUpDLon = this.corners[1].lon - this.corners[2].lon;

        const avgUpDLat = (leftUpDLat + rightUpDLat) / 2;
        const avgUpDLon = (leftUpDLon + rightUpDLon) / 2;
        const upEast  = avgUpDLon * metersPerDegLon;
        const upNorth = avgUpDLat * metersPerDegLat;

        // Bearing of image "up" from geographic north (= satellite heading)
        this.imageHeading = Math.atan2(upEast, upNorth) * 180 / Math.PI;
        if (this.imageHeading < 0) this.imageHeading += 360;

        // Ground dimensions: actual edge lengths, not axis-aligned ranges.
        // Width  = average of top (UL→UR) and bottom (LL→LR) edges
        // Height = average of left (LL→UL) and right (LR→UR) edges
        const edgeLen = (dLat, dLon) =>
            Math.sqrt((dLon * metersPerDegLon) ** 2 + (dLat * metersPerDegLat) ** 2);

        const topWidth = edgeLen(this.corners[1].lat - this.corners[0].lat,
                                  this.corners[1].lon - this.corners[0].lon);
        const botWidth = edgeLen(this.corners[2].lat - this.corners[3].lat,
                                  this.corners[2].lon - this.corners[3].lon);
        this.groundWidth = (topWidth + botWidth) / 2;

        const leftHeight  = edgeLen(leftUpDLat, leftUpDLon);
        const rightHeight = edgeLen(rightUpDLat, rightUpDLon);
        this.groundHeight = (leftHeight + rightHeight) / 2;

        // Ground Sample Distance (meters per pixel)
        this.gsdX = this.imageWidth > 0 ? this.groundWidth / this.imageWidth : 1;
        this.gsdY = this.imageHeight > 0 ? this.groundHeight / this.imageHeight : 1;

        // Try to extract real sensor data from TREs
        this.sensorData = this._parseENGRDA() || {};

        if (this.sensorData.imuLatitude !== undefined) {
            // Real sensor position from ENGRDA TRE
            this.sensorLat = this.sensorData.imuLatitude;
            this.sensorLon = this.sensorData.imuLongitude;
            // ENGRDA altitude is typically in feet
            this.sensorAltitude = this.sensorData.imuAltitude * 0.3048;

            // Compute look direction and FOV from actual angular geometry:
            // find the angular centroid of the four corners as seen from the sensor,
            // which correctly handles oblique views where the sensor is not above center.
            const angularResult = this._computeAngularGeometry();
            this.platformHeading = angularResult.azimuth;
            this.platformPitch = 0;
            this.platformRoll = 0;
            this.sensorElevation = -angularResult.depression;

            console.log(`CTrackFileNITF: ENGRDA sensor at (${this.sensorLat.toFixed(6)}, ${this.sensorLon.toFixed(6)}) ` +
                `alt=${this.sensorAltitude.toFixed(0)}m → angular center az=${angularResult.azimuth.toFixed(1)}° ` +
                `depression=${angularResult.depression.toFixed(1)}° hFOV=${angularResult.hFOV.toFixed(1)}° vFOV=${angularResult.vFOV.toFixed(1)}°`);
        } else {
            // Fallback: assume satellite at 500 km, nadir view
            this.sensorLat = this.centerLat;
            this.sensorLon = this.centerLon;
            this.sensorAltitude = 500000;
            this.platformHeading = this.imageHeading;  // derived from corner geometry
            this.platformPitch = 0;
            this.platformRoll = 0;
            this.sensorElevation = -90;
        }

        // For ENGRDA, FOV was already computed by _computeAngularGeometry;
        // for satellite fallback, use the altitude-based approximation (valid for nadir).
        if (!this.hFOV) {
            this.sensorFOV = this._computeFOVFromAltitude();
        } else {
            this.sensorFOV = Math.max(this.hFOV, this.vFOV);
        }

        console.log(`CTrackFileNITF: center=(${this.centerLat.toFixed(6)}, ${this.centerLon.toFixed(6)}) ` +
            `heading=${this.imageHeading.toFixed(1)}° ` +
            `ground=${this.groundWidth.toFixed(1)}x${this.groundHeight.toFixed(1)}m ` +
            `GSD=${this.gsdX.toFixed(3)}x${this.gsdY.toFixed(3)}m ` +
            `alt=${this.sensorAltitude.toFixed(0)}m hFOV=${this.hFOV.toFixed(2)}° vFOV=${this.vFOV.toFixed(2)}°`);
    }

    /**
     * Compute azimuth and depression angle from sensor position to image center.
     * Returns {azimuth, depression} in degrees.
     * NOTE: only used by the satellite fallback path; ENGRDA uses _computeAngularGeometry().
     */
    _computeLookAngles() {
        const degToRad = Math.PI / 180;
        const metersPerDegLat = 111319.9;
        const metersPerDegLon = 111319.9 * Math.cos(this.sensorLat * degToRad);

        const dx = (this.centerLon - this.sensorLon) * metersPerDegLon; // east
        const dy = (this.centerLat - this.sensorLat) * metersPerDegLat; // north
        const dist = Math.sqrt(dx * dx + dy * dy);

        let azimuth = Math.atan2(dx, dy) / degToRad; // bearing from north
        if (azimuth < 0) azimuth += 360;

        const depression = Math.atan2(this.sensorAltitude, dist) / degToRad;
        return {azimuth, depression};
    }

    /**
     * Compute look direction and FOV using actual 3D angular geometry from the
     * sensor position to the four IGEOLO corners.  This correctly handles oblique
     * views where the sensor is offset from image center and the nadir-based
     * approximation (altitude / ground-extent) breaks down.
     *
     * Returns {azimuth, depression, hFOV, vFOV} in degrees, and also sets
     * this.hFOV / this.vFOV as a side-effect.
     */
    _computeAngularGeometry() {
        const degToRad = Math.PI / 180;
        const metersPerDegLat = 111319.9;
        const metersPerDegLon = 111319.9 * Math.cos(this.sensorLat * degToRad);

        // Unit vectors from sensor to each corner (ENU, corners at ground level)
        const cornerUnits = this.corners.map(c => {
            const e = (c.lon - this.sensorLon) * metersPerDegLon;
            const n = (c.lat - this.sensorLat) * metersPerDegLat;
            const d = -this.sensorAltitude; // down to ground
            const mag = Math.sqrt(e * e + n * n + d * d);
            return {e: e / mag, n: n / mag, d: d / mag};
        });

        // Angular centroid: average of unit vectors, re-normalized.
        // This is the direction that minimises total angular distance to all corners,
        // which is the correct optical-axis direction for a symmetric camera.
        let ae = 0, an = 0, ad = 0;
        for (const u of cornerUnits) { ae += u.e; an += u.n; ad += u.d; }
        const am = Math.sqrt(ae * ae + an * an + ad * ad);
        ae /= am; an /= am; ad /= am;

        let azimuth = Math.atan2(ae, an) / degToRad;
        if (azimuth < 0) azimuth += 360;
        const depression = Math.atan2(Math.abs(ad), Math.sqrt(ae * ae + an * an)) / degToRad;

        // Horizontal FOV: angle between mid-left and mid-right edge vectors.
        // Corners: [0]=UL, [1]=UR, [2]=LR, [3]=LL
        const midOf = (a, b) => ({e: (a.e + b.e) / 2, n: (a.n + b.n) / 2, d: (a.d + b.d) / 2});
        const angleBetween = (a, b) => {
            const ma = Math.sqrt(a.e * a.e + a.n * a.n + a.d * a.d);
            const mb = Math.sqrt(b.e * b.e + b.n * b.n + b.d * b.d);
            const dot = (a.e * b.e + a.n * b.n + a.d * b.d) / (ma * mb);
            return Math.acos(Math.min(1, Math.max(-1, dot))) / degToRad;
        };

        const midLeft  = midOf(cornerUnits[0], cornerUnits[3]); // avg(UL, LL)
        const midRight = midOf(cornerUnits[1], cornerUnits[2]); // avg(UR, LR)
        const midTop   = midOf(cornerUnits[0], cornerUnits[1]); // avg(UL, UR)
        const midBot   = midOf(cornerUnits[3], cornerUnits[2]); // avg(LL, LR)

        this.hFOV = angleBetween(midLeft, midRight);
        this.vFOV = angleBetween(midTop, midBot);

        return {azimuth, depression, hFOV: this.hFOV, vFOV: this.vFOV};
    }

    /**
     * Parse ENGRDA TRE to extract sensor position and orientation.
     * Returns object with imuLatitude, imuLongitude, imuAltitude, imuYaw, imuPitch, imuRoll
     * or null if ENGRDA is not present.
     */
    _parseENGRDA() {
        const tre = this.tres && this.tres['ENGRDA'];
        if (!tre || !tre.raw) return null;

        const raw = tre.raw;
        const readStr = (pos, len) => {
            let str = '';
            for (let i = 0; i < len && pos + i < raw.length; i++) {
                str += String.fromCharCode(raw[pos + i]);
            }
            return str;
        };

        try {
            let pos = 0;
            pos += 20; // RESRC
            const recnt = parseInt(readStr(pos, 3).trim(), 10); pos += 3;
            const result = {};

            for (let r = 0; r < recnt && pos < raw.length; r++) {
                const engln = parseInt(readStr(pos, 2).trim(), 10); pos += 2;
                const englbl = readStr(pos, engln).trim(); pos += engln;
                pos += 4 + 4; // ENGMTXC + ENGMTXR
                const engtyp = readStr(pos, 1); pos += 1;
                pos += 1; // ENGDTS
                pos += 2; // ENGDATU
                const engdatc = parseInt(readStr(pos, 8).trim(), 10); pos += 8;
                const engdata = readStr(pos, engdatc).trim(); pos += engdatc;

                if (engtyp === 'A') {
                    const num = parseFloat(engdata);
                    result[englbl] = isNaN(num) ? engdata : num;
                }
            }
            return Object.keys(result).length > 0 ? result : null;
        } catch (e) {
            console.warn('CTrackFileNITF: Failed to parse ENGRDA TRE:', e);
            return null;
        }
    }

    /**
     * Compute the FOV needed to see the image footprint from the estimated altitude.
     * Computes both horizontal and vertical FOV independently from the actual
     * ground dimensions (not pixel dimensions) to avoid non-square pixel distortion.
     */
    _computeFOVFromAltitude() {
        this.hFOV = 2 * Math.atan((this.groundWidth / 2) / this.sensorAltitude) * 180 / Math.PI;
        this.vFOV = 2 * Math.atan((this.groundHeight / 2) / this.sensorAltitude) * 180 / Math.PI;
        return Math.max(this.hFOV, this.vFOV);
    }

    doesContainTrack() {
        return !!(this.corners && this.corners.length >= 4);
    }

    /**
     * Convert to MISB array format.
     * Returns two identical rows with timestamps 30 seconds apart so the track
     * system has enough points for interpolation (it requires length > 1).
     * The sensor position is constant since this is a still image.
     */
    toMISB(trackIndex = 0) {
        if (trackIndex !== 0) return false;
        if (!this.doesContainTrack()) return false;

        // Use the image datetime if valid (post-1970).  Pre-epoch dates like
        // 1950-01-01 (ECRG placeholder) fail MISB validation, so we synthesise
        // a stable fallback: 2026-03-30 at local solar noon based on longitude.
        // If the original date has an invalid year but a valid time-of-day,
        // we keep that time and only replace the date portion.
        let timestamp;
        const dtValid = this.datetime && !isNaN(this.datetime.getTime());
        if (dtValid && this.datetime.getTime() >= 0) {
            timestamp = this.datetime.getTime();
        } else {
            // Local solar noon: UTC 12:00 minus longitude-based offset (15°/hr)
            const noonOffsetMs = (this.centerLon / 15) * 3600000;
            const baseDate = Date.UTC(2026, 2, 30, 12, 0, 0) - noonOffsetMs;
            if (dtValid) {
                // Keep original time-of-day if it looks valid (non-midnight)
                const h = this.datetime.getUTCHours();
                const m = this.datetime.getUTCMinutes();
                const s = this.datetime.getUTCSeconds();
                if (h !== 0 || m !== 0 || s !== 0) {
                    timestamp = Date.UTC(2026, 2, 30, h, m, s);
                } else {
                    timestamp = baseDate;
                }
            } else {
                timestamp = baseDate;
            }
        }

        const makeRow = (ts) => {
            const row = new Array(MISBFields).fill(null);

            row[MISB.UnixTimeStamp] = ts;
            row[MISB.SensorLatitude] = this.sensorLat;
            row[MISB.SensorLongitude] = this.sensorLon;
            row[MISB.SensorTrueAltitude] = this.sensorAltitude;

            // Platform orientation (from ENGRDA if available, else default nadir)
            row[MISB.PlatformHeadingAngle] = this.platformHeading;
            row[MISB.PlatformPitchAngle] = this.platformPitch;
            row[MISB.PlatformRollAngle] = this.platformRoll;

            // Sensor look direction: for ENGRDA, computed from sensor to image center;
            // for satellite fallback, nadir (-90°)
            row[MISB.SensorRelativeAzimuthAngle] = 0;
            row[MISB.SensorRelativeElevationAngle] = this.sensorElevation;
            row[MISB.SensorRelativeRollAngle] = 0;

            // FOV from ground dimensions (not pixel dimensions, to avoid
            // distortion from non-square ground sample distances)
            row[MISB.SensorHorizontalFieldofView] = this.hFOV;
            row[MISB.SensorVerticalFieldofView] = this.vFOV;

            // Frame center on the ground
            row[MISB.FrameCenterLatitude] = this.centerLat;
            row[MISB.FrameCenterLongitude] = this.centerLon;
            row[MISB.FrameCenterElevation] = 0;

            // Corner coordinates
            row[MISB.CornerLatitudePoint1] = this.corners[0].lat;
            row[MISB.CornerLongitudePoint1] = this.corners[0].lon;
            row[MISB.CornerLatitudePoint2] = this.corners[1].lat;
            row[MISB.CornerLongitudePoint2] = this.corners[1].lon;
            row[MISB.CornerLatitudePoint3] = this.corners[2].lat;
            row[MISB.CornerLongitudePoint3] = this.corners[2].lon;
            row[MISB.CornerLatitudePoint4] = this.corners[3].lat;
            row[MISB.CornerLongitudePoint4] = this.corners[3].lon;

            return row;
        };

        // Two rows 30 seconds apart — same position, satisfies the >1 row requirement
        return [makeRow(timestamp), makeRow(timestamp + 30000)];
    }

    getShortName(trackIndex = 0, trackFileName = '') {
        if (this.title && this.title.length > 0 && this.title.length < 40) {
            return this.title;
        }
        if (trackFileName) {
            return trackFileName.replace(/\.[^/.]+$/, '');
        }
        return 'NITF Track';
    }

    hasMoreTracks(trackIndex = 0) {
        return false;
    }

    getTrackCount() {
        return 1;
    }

    /** Signal to TrackManager that this track should auto-select as the camera track */
    get autoSelectAsCamera() { return true; }

    extractObjects() {
        // No additional features to extract
    }
}
