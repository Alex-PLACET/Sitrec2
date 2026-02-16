import {CNodeViewCanvas2D} from "./CNodeViewCanvas";
import {setRenderOne} from "../Globals";

export class CNodeGridOverlay extends CNodeViewCanvas2D {
    constructor(v) {
        super(v);
        this.autoClear = true;
        this.separateVisibility = true;
        this.visible = false;
        this.ignoreMouseEvents();

        this.gridSize = 16;
        this.gridSubdivisions = 1;
        this.gridXOffset = 0;
        this.gridYOffset = 0;
        this.gridColor = "#00ff00";
        this.gridShow = false;
    }

    setShow(show) {
        this.gridShow = show;
        this.visible = show;
        if (!show && this.ctx) {
            this.ctx.clearRect(0, 0, this.widthPx, this.heightPx);
        }
        setRenderOne(true);
    }

    renderCanvas(frame) {
        if (!this.gridShow) return;

        super.renderCanvas(frame);

        if (!this.visible) return;

        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.widthPx, this.heightPx);

        const videoView = this.overlayView;
        if (!videoView) return;

        const vw = videoView.videoWidth;
        const vh = videoView.videoHeight;
        if (!vw || !vh) return;

        videoView.getSourceAndDestCoords();
        const {dx, dy, dWidth, dHeight, sx, sy, sWidth, sHeight} = videoView;

        if (dWidth <= 0 || dHeight <= 0) return;

        const size = this.gridSize;
        const subdivisions = this.gridSubdivisions;
        const xOff = this.gridXOffset;
        const yOff = this.gridYOffset;

        const scaleX = dWidth / sWidth;
        const scaleY = dHeight / sHeight;

        const v2cx = (vx) => dx + (vx - sx) * scaleX;
        const v2cy = (vy) => dy + (vy - sy) * scaleY;

        const visMinX = sx;
        const visMaxX = sx + sWidth;
        const visMinY = sy;
        const visMaxY = sy + sHeight;

        ctx.save();

        ctx.beginPath();
        ctx.rect(dx, dy, dWidth, dHeight);
        ctx.clip();

        const drawLines = (step, lineWidth) => {
            ctx.strokeStyle = this.gridColor;
            ctx.lineWidth = lineWidth;
            ctx.beginPath();

            const firstVX = Math.ceil((visMinX - xOff) / step) * step + xOff;
            for (let vx = firstVX; vx <= visMaxX; vx += step) {
                const cx = v2cx(vx);
                ctx.moveTo(cx, dy);
                ctx.lineTo(cx, dy + dHeight);
            }

            const firstVY = Math.ceil((visMinY - yOff) / step) * step + yOff;
            for (let vy = firstVY; vy <= visMaxY; vy += step) {
                const cy = v2cy(vy);
                ctx.moveTo(dx, cy);
                ctx.lineTo(dx + dWidth, cy);
            }

            ctx.stroke();
        };

        drawLines(size, 1);

        if (subdivisions > 1) {
            const subSize = size / subdivisions;

            ctx.strokeStyle = this.gridColor;
            ctx.lineWidth = 0.5;
            ctx.beginPath();

            const firstVX = Math.ceil((visMinX - xOff) / subSize) * subSize + xOff;
            for (let vx = firstVX; vx <= visMaxX; vx += subSize) {
                const relX = ((vx - xOff) % size + size) % size;
                if (Math.abs(relX) < 0.001 || Math.abs(relX - size) < 0.001) continue;
                const cx = v2cx(vx);
                ctx.moveTo(cx, dy);
                ctx.lineTo(cx, dy + dHeight);
            }

            const firstVY = Math.ceil((visMinY - yOff) / subSize) * subSize + yOff;
            for (let vy = firstVY; vy <= visMaxY; vy += subSize) {
                const relY = ((vy - yOff) % size + size) % size;
                if (Math.abs(relY) < 0.001 || Math.abs(relY - size) < 0.001) continue;
                const cy = v2cy(vy);
                ctx.moveTo(dx, cy);
                ctx.lineTo(dx + dWidth, cy);
            }

            ctx.stroke();
        }

        ctx.restore();
    }
}
