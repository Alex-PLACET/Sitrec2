import {CVideoData} from "./CVideoData";
import {assert} from "./assert";
import {FileManager} from "./Globals";

export class CVideoImageData extends CVideoData {
    constructor(v, loadedCallback, errorCallback) {
        super(v, loadedCallback, errorCallback);
        assert(v.img, "CVideoImageData: img is undefined");
        this.img = v.img

        this.videoWidth = this.img.width;
        this.videoHeight = this.img.height;
        this.originalVideoWidth = this.img.width;
        this.originalVideoHeight = this.img.height;

        this.filename = v.filename;
        this.deleteAfterUsing = v.deleteAfterUsing ?? true;

        // Cache for rotated image (only created when rotation is applied)
        this.rotatedImage = null;

        // Defer callback until after constructor returns and assignment completes
        // This ensures this.videoData is set before loadedCallback runs
        queueMicrotask(() => loadedCallback(this));
    }

    getImage(frame) {
        const rotation = this.effectiveRotation;

        // If rotation is needed and we don't have a cached rotated image, create one
        if (rotation !== 0 && !this.rotatedImage) {
            this.rotatedImage = this.applyRotationSync(this.img, rotation);
            // Update video dimensions after rotation (90° and 270° swap width/height)
            this.videoWidth = this.rotatedImage.width;
            this.videoHeight = this.rotatedImage.height;
        }

        const img = rotation !== 0 ? this.rotatedImage : this.img;
        return this.getStabilizedImage(frame, img);
    }

    /**
     * Apply rotation to an image synchronously using canvas
     * @param {HTMLImageElement|HTMLCanvasElement} image - Source image
     * @param {number} degrees - Rotation in degrees (90, 180, or 270)
     * @returns {HTMLCanvasElement} Rotated image as canvas
     */
    applyRotationSync(image, degrees) {
        const width = image.width;
        const height = image.height;
        // For 90° and 270° rotations, width and height are swapped
        const swap = (degrees === 90 || degrees === 270);
        const outW = swap ? height : width;
        const outH = swap ? width : height;

        const canvas = document.createElement('canvas');
        canvas.width = outW;
        canvas.height = outH;
        const ctx = canvas.getContext('2d');

        // Move to center, rotate, then draw image centered
        ctx.translate(outW / 2, outH / 2);
        ctx.rotate(degrees * Math.PI / 180);
        ctx.translate(-width / 2, -height / 2);
        ctx.drawImage(image, 0, 0);

        return canvas;
    }

    /**
     * Called when rotation changes - clear cached rotated image
     * @override
     */
    onRotationChanged() {
        super.onRotationChanged();
        this.rotatedImage = null;
        // Reset dimensions to original (will be recalculated in getImage)
        this.videoWidth = this.originalVideoWidth;
        this.videoHeight = this.originalVideoHeight;
    }

    dispose() {
        this.stopStreaming();
        super.dispose();
        if (this.deleteAfterUsing) {
            // we want to delete the image from the file manager
            FileManager.disposeRemove(this.filename);
        }
        this.img = null;
        this.rotatedImage = null;
    }
}