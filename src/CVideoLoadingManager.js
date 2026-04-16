import {LoadingManager} from "./CLoadingManager";

class CVideoLoadingManagerClass {
    constructor() {
        this.loadingVideos = new Map();
    }

    registerLoading(videoId, fileName, progressCallback) {
        console.log(`[VideoLoadingManager] registerLoading: ${videoId}, file: ${fileName}`);
        LoadingManager.registerLoading(videoId, fileName, "Video");
        const entry = {
            fileName: this.getShortFileName(fileName),
            fullPath: fileName,
            progressCallback: progressCallback,
            status: "registered",
            statusTime: performance.now(),
            startTime: performance.now(),
        };
        this.loadingVideos.set(videoId, entry);
        return entry;
    }

    updateProgress(videoId, progress) {
        LoadingManager.updateProgress(videoId, progress);
    }

    /**
     * Record a milestone for a loading video. Used by the pending-actions
     * diagnostic to pinpoint where a stalled load is stuck.
     */
    setStatus(videoId, status) {
        const entry = this.loadingVideos.get(videoId);
        if (entry) {
            entry.status = status;
            entry.statusTime = performance.now();
            console.log(`[VideoLoad] ${entry.fileName}: ${status}`);
        }
    }

    /**
     * Compact summary of active video loads for diagnostic logging.
     * Format: "foo.mp4:configuring decoder (stuck 3.2s, total 5.1s); bar.mp4:..."
     */
    getActiveLoadsSummary() {
        if (this.loadingVideos.size === 0) return "";
        const now = performance.now();
        const parts = [];
        for (const [, entry] of this.loadingVideos) {
            const stuck = ((now - (entry.statusTime || entry.startTime)) / 1000).toFixed(1);
            const total = ((now - entry.startTime) / 1000).toFixed(1);
            parts.push(`${entry.fileName}:${entry.status || "?"} (stuck ${stuck}s, total ${total}s)`);
        }
        return parts.join("; ");
    }

    completeLoading(videoId) {
        console.log(`[VideoLoadingManager] completeLoading called for: ${videoId}, was registered: ${this.loadingVideos.has(videoId)}`);
        this.loadingVideos.delete(videoId);
        LoadingManager.completeLoading(videoId);
    }

    isLoading(videoId) {
        return this.loadingVideos.has(videoId);
    }

    getLoadingCount() {
        return this.loadingVideos.size;
    }

    getShortFileName(fileName) {
        return LoadingManager.getShortName(fileName);
    }

    createLoadingImage(width = 640, height = 480, text = "Loading...") {
        return LoadingManager.createLoadingImage(width, height, text);
    }

    createLoadingImageForVideo(fileName, width = 640, height = 480) {
        const shortName = this.getShortFileName(fileName);
        return this.createLoadingImage(width, height, `Loading: ${shortName}`);
    }

    dispose() {
        for (const videoId of this.loadingVideos.keys()) {
            LoadingManager.completeLoading(videoId);
        }
        this.loadingVideos.clear();
    }
}

export const VideoLoadingManager = new CVideoLoadingManagerClass();
