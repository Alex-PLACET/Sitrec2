export class CTrackFile {
    constructor(data) {
        this.data = data;
    }

    doesContainTrack() {
        throw new Error("doesContainTrack must be implemented by subclass");
    }

    toMISB(trackIndex = 0) {
        throw new Error("toMISB must be implemented by subclass");
    }
}
