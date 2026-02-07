import {CNodeViewUI} from "./CNodeViewUI";
import {Sit} from "../Globals";
import {par} from "../par";

export class CNodeVideoInfoUI extends CNodeViewUI {

    constructor(v) {
        super(v);

        this.doubleClickFullScreen = false;

        this.showInfo = v.showInfo ?? false;
        this.showFrameCounter = v.showFrameCounter ?? false;
        this.showTimecode = v.showTimecode ?? false;
        this.showTimestamp = v.showTimestamp ?? false;
        this.fontSize = v.fontSize ?? 30;

        this.frameCounterX = v.frameCounterX ?? 50;
        this.frameCounterY = v.frameCounterY ?? 8;
        this.timecodeX = v.timecodeX ?? 50;
        this.timecodeY = v.timecodeY ?? 8;
        this.timestampX = v.timestampX ?? 50;
        this.timestampY = v.timestampY ?? 8;

        this.addSimpleSerial("showInfo");
        this.addSimpleSerial("showFrameCounter");
        this.addSimpleSerial("showTimecode");
        this.addSimpleSerial("showTimestamp");
        this.addSimpleSerial("fontSize");
        this.addSimpleSerial("frameCounterX");
        this.addSimpleSerial("frameCounterY");
        this.addSimpleSerial("timecodeX");
        this.addSimpleSerial("timecodeY");
        this.addSimpleSerial("timestampX");
        this.addSimpleSerial("timestampY");

        this.canvas.style.pointerEvents = 'none';

        this.dragging = null;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;

        this.boundHandleMouseDown = (e) => this.handleMouseDown(e);
        this.boundHandleMouseMove = (e) => this.handleMouseMove(e);
        this.boundHandleMouseUp = (e) => this.handleMouseUp(e);

        document.addEventListener('mousemove', this.boundHandleMouseMove);
        document.addEventListener('mouseup', this.boundHandleMouseUp);
        this.canvas.addEventListener('mousedown', this.boundHandleMouseDown);

        this.show(this.showInfo);
    }

    getElementBounds() {
        const bounds = [];
        const padding = 6;
        const fps = Sit.fps || 30;
        const totalSeconds = (Sit.frames || 1) / fps;
        const showHours = totalSeconds >= 3600;

        if (this.showFrameCounter && this._frameCounterBbox) {
            bounds.push({
                id: 'frameCounter',
                x: this._frameCounterBbox.x - padding,
                y: this._frameCounterBbox.y - padding,
                w: this._frameCounterBbox.w + padding * 2,
                h: this._frameCounterBbox.h + padding * 2
            });
        }
        if (this.showTimecode && this._timecodeBbox) {
            bounds.push({
                id: 'timecode',
                x: this._timecodeBbox.x - padding,
                y: this._timecodeBbox.y - padding,
                w: this._timecodeBbox.w + padding * 2,
                h: this._timecodeBbox.h + padding * 2
            });
        }
        if (this.showTimestamp && this._timestampBbox) {
            bounds.push({
                id: 'timestamp',
                x: this._timestampBbox.x - padding,
                y: this._timestampBbox.y - padding,
                w: this._timestampBbox.w + padding * 2,
                h: this._timestampBbox.h + padding * 2
            });
        }
        return bounds;
    }

    getElementAtPosition(x, y) {
        const bounds = this.getElementBounds();
        for (const b of bounds) {
            if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
                return b.id;
            }
        }
        return null;
    }

    handleMouseDown(e) {
        if (!this.showInfo) return;

        const canvasRect = this.canvas.getBoundingClientRect();
        const x = e.clientX - canvasRect.left;
        const y = e.clientY - canvasRect.top;

        const element = this.getElementAtPosition(x, y);
        if (element) {
            this.dragging = element;
            const videoRect = this.getVideoRect();
            if (element === 'frameCounter') {
                this.dragOffsetX = x - this.videoPx(this.frameCounterX, videoRect);
                this.dragOffsetY = y - this.videoPy(this.frameCounterY, videoRect);
            } else if (element === 'timecode') {
                this.dragOffsetX = x - this.videoPx(this.timecodeX, videoRect);
                this.dragOffsetY = y - this.videoPy(this.timecodeY, videoRect);
            } else if (element === 'timestamp') {
                this.dragOffsetX = x - this.videoPx(this.timestampX, videoRect);
                this.dragOffsetY = y - this.videoPy(this.timestampY, videoRect);
            }
            this.canvas.style.pointerEvents = 'auto';
            e.stopPropagation();
            e.preventDefault();
        }
    }

    handleMouseMove(e) {
        const canvasRect = this.canvas.getBoundingClientRect();
        const x = e.clientX - canvasRect.left;
        const y = e.clientY - canvasRect.top;

        if (this.dragging) {
            const videoRect = this.getVideoRect();
            const newPctX = ((x - this.dragOffsetX - videoRect.x) / videoRect.w) * 100;
            const newPctY = ((y - this.dragOffsetY - videoRect.y) / videoRect.h) * 100;

            const clampedX = Math.max(5, Math.min(95, newPctX));
            const clampedY = Math.max(5, Math.min(95, newPctY));

            if (this.dragging === 'frameCounter') {
                this.frameCounterX = clampedX;
                this.frameCounterY = clampedY;
            } else if (this.dragging === 'timecode') {
                this.timecodeX = clampedX;
                this.timecodeY = clampedY;
            } else if (this.dragging === 'timestamp') {
                this.timestampX = clampedX;
                this.timestampY = clampedY;
            }
            return;
        }

        if (x >= 0 && x <= canvasRect.width && y >= 0 && y <= canvasRect.height) {
            const element = this.getElementAtPosition(x, y);
            if (element && this.showInfo) {
                this.canvas.style.pointerEvents = 'auto';
                this.canvas.style.cursor = 'move';
            } else {
                this.canvas.style.pointerEvents = 'none';
                this.canvas.style.cursor = '';
            }
        } else {
            this.canvas.style.pointerEvents = 'none';
            this.canvas.style.cursor = '';
        }
    }

    handleMouseUp(e) {
        if (this.dragging) {
            this.dragging = null;
            this.canvas.style.pointerEvents = 'none';
        }
    }

    formatTimecode(frame, fps, showHours) {
        const totalSeconds = frame / fps;
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = Math.floor(totalSeconds % 60);
        const frames = Math.floor(frame % fps);

        const mm = String(minutes).padStart(2, '0');
        const ss = String(seconds).padStart(2, '0');
        const ff = String(frames).padStart(2, '0');

        if (showHours) {
            const hh = String(hours).padStart(2, '0');
            return `${hh}:${mm}:${ss}:${ff}`;
        }
        return `${mm}:${ss}:${ff}`;
    }

    formatTimestamp(frame, fps, showHours) {
        const totalSeconds = frame / fps;
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        const mm = String(minutes).padStart(2, '0');
        const ssDecimal = seconds.toFixed(2).padStart(5, '0');

        if (showHours) {
            const hh = String(hours).padStart(2, '0');
            return `${hh}:${mm}:${ssDecimal}`;
        }
        return `${mm}:${ssDecimal}`;
    }

    getVideoRect() {
        let vx = 0, vy = 0, vw = this.widthPx, vh = this.heightPx;
        const videoView = this.in.relativeTo;
        if (videoView && videoView.getSourceAndDestCoords) {
            videoView.getSourceAndDestCoords();
            vx = videoView.dx;
            vy = videoView.dy;
            vw = videoView.dWidth;
            vh = videoView.dHeight;
        }
        return { x: vx, y: vy, w: vw, h: vh };
    }

    videoPx(pct, rect) {
        return rect.x + (pct / 100) * rect.w;
    }

    videoPy(pct, rect) {
        return rect.y + (pct / 100) * rect.h;
    }

    renderCanvas(frame) {
        if (this.overlayView && !this.overlayView.visible) return;
        if (this.in.relativeTo && !this.in.relativeTo.visible) return;
        if (!this.showInfo) return;

        super.renderCanvas(frame);

        const c = this.ctx;
        const fps = Sit.fps || 30;
        const totalSeconds = (Sit.frames || 1) / fps;
        const showHours = totalSeconds >= 3600;

        const rect = this.getVideoRect();
        const referenceHeight = 1080;
        const scaledFontSize = Math.round(this.fontSize * rect.h / referenceHeight);
        c.font = `${scaledFontSize}px monospace`;
        c.textAlign = 'center';
        c.textBaseline = 'top';

        const padding = Math.round(6 * rect.h / referenceHeight);

        if (this.showFrameCounter) {
            const text = `${Math.floor(par.frame)}`;
            const x = this.videoPx(this.frameCounterX, rect);
            const y = this.videoPy(this.frameCounterY, rect);
            const metrics = c.measureText(text);
            const textHeight = scaledFontSize;
            const bgX = x - metrics.width / 2 - padding;
            const bgY = y - padding;
            const bgW = metrics.width + padding * 2;
            const bgH = textHeight + padding * 2;

            c.fillStyle = 'rgba(0, 0, 0, 0.5)';
            c.fillRect(bgX, bgY, bgW, bgH);
            c.fillStyle = '#FFFFFF';
            c.fillText(text, x, y);

            this._frameCounterBbox = { x: bgX, y: bgY, w: bgW, h: bgH };
        }

        if (this.showTimecode) {
            const text = this.formatTimecode(par.frame, fps, showHours);
            const x = this.videoPx(this.timecodeX, rect);
            const y = this.videoPy(this.timecodeY, rect);
            const metrics = c.measureText(text);
            const textHeight = scaledFontSize;
            const bgX = x - metrics.width / 2 - padding;
            const bgY = y - padding;
            const bgW = metrics.width + padding * 2;
            const bgH = textHeight + padding * 2;

            c.fillStyle = 'rgba(0, 0, 0, 0.5)';
            c.fillRect(bgX, bgY, bgW, bgH);
            c.fillStyle = '#FFFFFF';
            c.fillText(text, x, y);

            this._timecodeBbox = { x: bgX, y: bgY, w: bgW, h: bgH };
        }

        if (this.showTimestamp) {
            const text = this.formatTimestamp(par.frame, fps, showHours);
            const x = this.videoPx(this.timestampX, rect);
            const y = this.videoPy(this.timestampY, rect);
            const metrics = c.measureText(text);
            const textHeight = scaledFontSize;
            const bgX = x - metrics.width / 2 - padding;
            const bgY = y - padding;
            const bgW = metrics.width + padding * 2;
            const bgH = textHeight + padding * 2;

            c.fillStyle = 'rgba(0, 0, 0, 0.5)';
            c.fillRect(bgX, bgY, bgW, bgH);
            c.fillStyle = '#FFFFFF';
            c.fillText(text, x, y);

            this._timestampBbox = { x: bgX, y: bgY, w: bgW, h: bgH };
        }
    }

    dispose() {
        if (this.boundHandleMouseMove) {
            document.removeEventListener('mousemove', this.boundHandleMouseMove);
        }
        if (this.boundHandleMouseUp) {
            document.removeEventListener('mouseup', this.boundHandleMouseUp);
        }
        if (this.canvas && this.boundHandleMouseDown) {
            this.canvas.removeEventListener('mousedown', this.boundHandleMouseDown);
        }
        super.dispose();
    }
}
