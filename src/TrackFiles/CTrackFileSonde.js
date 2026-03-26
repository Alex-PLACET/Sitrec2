import {CTrackFile} from "./CTrackFile";
import {MISB, MISBFields} from "../MISBFields";
import {detectSondeFormat, parseIGRA2, parseUWYOList, parseUWYOCSV, countIGRA2Soundings, stripIGRA2Preamble} from "../ParseSonde";
import {reconstructTrajectory} from "../SondeTrajectory";

/**
 * Track file handler for radiosonde (weather balloon) sounding data.
 *
 * Supports three formats:
 *   - IGRA2 fixed-width text (NOAA NCEI)
 *   - UWYO TEXT:LIST (University of Wyoming HTML table)
 *   - UWYO TEXT:CSV (University of Wyoming per-second GPS CSV)
 *
 * For IGRA2 files with multiple soundings, initially imports just the first one.
 * Use soundingIndex parameter for multi-sounding selection.
 */
export class CTrackFileSonde extends CTrackFile {

    /**
     * Detect whether this data is a sonde format we can handle.
     * Must be specific enough to avoid matching TLE, SRT, or other text formats.
     */
    static canHandle(filename, data) {
        if (!data || typeof data !== 'string') return false;
        return detectSondeFormat(data) !== null;
    }

    constructor(data) {
        super(data);
        this.soundings = [];     // parsed SondeData[]
        this.trajectories = [];  // reconstructed trajectory arrays
        this.format = null;
        this._parse();
    }

    _parse() {
        this.format = detectSondeFormat(this.data);
        if (!this.format) return;

        // Strip any preamble lines before the first IGRA2 header
        if (this.format === "igra2") {
            this.data = stripIGRA2Preamble(this.data);
        }

        switch (this.format) {
            case "igra2": {
                // For now, import all soundings (capped at reasonable limit)
                const count = Math.min(countIGRA2Soundings(this.data), 100);
                for (let i = 0; i < count; i++) {
                    const sonde = parseIGRA2(this.data, i);
                    if (sonde && sonde.levels.length > 0) {
                        this.soundings.push(sonde);
                        this.trajectories.push(reconstructTrajectory(sonde));
                    }
                }
                // If there are too many, just use the first
                if (this.soundings.length > 10) {
                    this.soundings = [this.soundings[0]];
                    this.trajectories = [this.trajectories[0]];
                }
                break;
            }
            case "uwyo-list": {
                const sonde = parseUWYOList(this.data);
                if (sonde && sonde.levels.length > 0) {
                    this.soundings.push(sonde);
                    this.trajectories.push(reconstructTrajectory(sonde));
                }
                break;
            }
            case "uwyo-csv": {
                const sonde = parseUWYOCSV(this.data);
                if (sonde && sonde.levels.length > 0) {
                    this.soundings.push(sonde);
                    this.trajectories.push(reconstructTrajectory(sonde));
                }
                break;
            }
        }
    }

    /**
     * Async refinement: load the IGRA2 station database and re-reconstruct
     * UWYO LIST trajectories with precise coordinates.
     * Called from handleParsedFile before the track is added to TrackManager.
     */
    async refineStationCoords() {
        if (this.format !== "uwyo-list") return;
        const {loadStationList} = await import("../SondeFetch");
        const stations = await loadStationList();
        for (let i = 0; i < this.soundings.length; i++) {
            const sonde = this.soundings[i];
            const match = stations.find(s => s.wmo === sonde.station.id);
            if (match) {
                sonde.station.lat = match.lat;
                sonde.station.lon = match.lon;
                if (match.elev) sonde.station.elev = match.elev;
                this.trajectories[i] = reconstructTrajectory(sonde);
            }
        }
    }

    doesContainTrack() {
        return this.trajectories.length > 0 && this.trajectories[0].length > 1;
    }

    toMISB(trackIndex = 0) {
        if (trackIndex >= this.trajectories.length) return false;
        const trajectory = this.trajectories[trackIndex];
        if (!trajectory || trajectory.length === 0) return false;

        const misb = [];
        for (const point of trajectory) {
            const row = new Array(MISBFields).fill(null);
            row[MISB.UnixTimeStamp] = point.time;  // epoch milliseconds
            row[MISB.SensorLatitude] = point.lat;
            row[MISB.SensorLongitude] = point.lon;
            row[MISB.SensorTrueAltitude] = point.alt;

            // Store atmospheric data in relevant MISB fields
            if (point.windDir != null) row[MISB.WindDirection] = point.windDir;
            if (point.windSpeed != null) row[MISB.WindSpeed] = point.windSpeed;
            if (point.pressure != null) row[MISB.StaticPressure] = point.pressure;
            if (point.temp != null) row[MISB.OutsideAirTemperature] = point.temp;

            misb.push(row);
        }
        return misb;
    }

    getShortName(trackIndex = 0, trackFileName = "") {
        if (trackIndex < this.soundings.length) {
            const sonde = this.soundings[trackIndex];
            const dateStr = sonde.datetime.toISOString().slice(0, 10);
            const hour = sonde.datetime.getUTCHours().toString().padStart(2, '0');
            const id = sonde.station.id || 'sonde';
            return `${id}_${dateStr}_${hour}Z`;
        }
        if (trackFileName) {
            return trackFileName.replace(/\.[^/.]+$/, "");
        }
        return "Sonde_Track";
    }

    hasMoreTracks(trackIndex = 0) {
        return trackIndex < this.trajectories.length - 1;
    }

    getTrackCount() {
        return this.trajectories.length;
    }

    extractObjects() {
        // No additional objects to extract for sonde data
    }

    /**
     * Get the format type for display/debugging.
     * @returns {string}
     */
    getFormat() {
        return this.format;
    }

    /**
     * Check if this is a sonde track file (for display customization).
     * @returns {boolean}
     */
    isSondeTrack() {
        return true;
    }

    /**
     * Get the sonde data for a specific track (for balloon expansion calculation).
     * @param {number} trackIndex
     * @returns {import('../ParseSonde').SondeData|null}
     */
    getSondeData(trackIndex = 0) {
        return this.soundings[trackIndex] || null;
    }

    /**
     * Get the reconstructed trajectory for a specific track.
     * @param {number} trackIndex
     * @returns {Array|null}
     */
    getTrajectory(trackIndex = 0) {
        return this.trajectories[trackIndex] || null;
    }
}
