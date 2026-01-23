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
            progressCallback: progressCallback
        };
        this.loadingVideos.set(videoId, entry);
        return entry;
    }

    updateProgress(videoId, progress) {
        LoadingManager.updateProgress(videoId, progress);
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
