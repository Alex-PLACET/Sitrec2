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
     */
    _calculateGeometry() {
        if (!this.corners || this.corners.length < 4) return;

        // Center point (average of 4 corners)
        this.centerLat = (this.corners[0].lat + this.corners[1].lat +
                          this.corners[2].lat + this.corners[3].lat) / 4;
        this.centerLon = (this.corners[0].lon + this.corners[1].lon +
                          this.corners[2].lon + this.corners[3].lon) / 4;

        // Ground dimensions in meters
        const metersPerDegLat = 111319.9;
        const metersPerDegLon = 111319.9 * Math.cos(this.centerLat * Math.PI / 180);

        // Use diagonal corners to get full extent
        const latRange = Math.abs(this.corners[0].lat - this.corners[2].lat);
        const lonRange = Math.abs(this.corners[1].lon - this.corners[0].lon);

        this.groundHeight = latRange * metersPerDegLat;
        this.groundWidth = lonRange * metersPerDegLon;

        // Ground Sample Distance (meters per pixel)
        this.gsdX = this.imageWidth > 0 ? this.groundWidth / this.imageWidth : 1;
        this.gsdY = this.imageHeight > 0 ? this.groundHeight / this.imageHeight : 1;

        // Use a typical GEOINT satellite altitude, then compute the FOV
        // needed to fit the image footprint from that altitude.
        // When TREs with real sensor data are present, those should override these estimates.
        this.sensorAltitude = this._estimateAltitude();
        this.sensorFOV = this._computeFOVFromAltitude();

        console.log(`CTrackFileNITF: center=(${this.centerLat.toFixed(6)}, ${this.centerLon.toFixed(6)}) ` +
            `ground=${this.groundWidth.toFixed(1)}x${this.groundHeight.toFixed(1)}m ` +
            `GSD=${this.gsdX.toFixed(3)}x${this.gsdY.toFixed(3)}m ` +
            `est. alt=${this.sensorAltitude.toFixed(0)}m FOV=${this.sensorFOV.toFixed(4)}°`);
    }

    /**
     * Estimate sensor altitude. Uses a typical GEOINT satellite altitude (~500 km).
     * Real altitude would come from SENSRB or RPC TREs if present.
     */
    _estimateAltitude() {
        // TODO: extract from TREs (SENSRB, USE00A) when available
        // Default: typical reconnaissance/commercial satellite orbit
        return 500000; // 500 km in meters
    }

    /**
     * Compute the FOV needed to see the image footprint from the estimated altitude.
     * FOV = 2 * atan(groundHalfExtent / altitude)
     */
    _computeFOVFromAltitude() {
        const maxExtent = Math.max(this.groundWidth, this.groundHeight);
        const fovRad = 2 * Math.atan((maxExtent / 2) / this.sensorAltitude);
        return fovRad * 180 / Math.PI;
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

        const timestamp = this.datetime ? this.datetime.getTime() : Date.now();

        const makeRow = (ts) => {
            const row = new Array(MISBFields).fill(null);

            row[MISB.UnixTimeStamp] = ts;
            row[MISB.SensorLatitude] = this.centerLat;
            row[MISB.SensorLongitude] = this.centerLon;
            row[MISB.SensorTrueAltitude] = this.sensorAltitude;

            // Platform is level (typical satellite orientation)
            row[MISB.PlatformHeadingAngle] = 0;   // North-aligned
            row[MISB.PlatformPitchAngle] = 0;     // Level flight
            row[MISB.PlatformRollAngle] = 0;

            // Sensor/gimbal points straight down from the level platform
            row[MISB.SensorRelativeAzimuthAngle] = 0;
            row[MISB.SensorRelativeElevationAngle] = -90;  // Nadir
            row[MISB.SensorRelativeRollAngle] = 0;

            // FOV scaled by aspect ratio
            const aspect = this.imageWidth / this.imageHeight;
            if (aspect >= 1) {
                row[MISB.SensorHorizontalFieldofView] = this.sensorFOV;
                row[MISB.SensorVerticalFieldofView] = this.sensorFOV / aspect;
            } else {
                row[MISB.SensorVerticalFieldofView] = this.sensorFOV;
                row[MISB.SensorHorizontalFieldofView] = this.sensorFOV * aspect;
            }

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
