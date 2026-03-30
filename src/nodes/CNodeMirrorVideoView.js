import {CNodeVideoView} from "./CNodeVideoView";

export class CNodeMirrorVideoView extends CNodeVideoView {
    constructor(v) {
        super(v);
        this.input("mirror")

        // a mirror video just shows the same frames as another video view
        // so we are just reusing the data, and should not have to recalculate anything.

        this.videoData = this.in.mirror.videoData;
        
        // Mirror videos are overlays and should not intercept pointer events
        // This allows touch/mouse events to pass through to the underlying 3D view
        this.ignoreMouseEvents();
    }

    // update just checks to see if the video has changed
    // use the new video if it has, and sync pan offset
    update() {
        if (this.in.mirror.videoData !== this.videoData) {
            this.videoData = this.in.mirror.videoData;
        }
        // Sync pan offset from mirrored view so overlay matches
        this.panOffsetX = this.in.mirror.panOffsetX ?? 0;
        this.panOffsetY = this.in.mirror.panOffsetY ?? 0;
    }
}