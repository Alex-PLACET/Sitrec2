import {makeDraggable} from "./DragResizeUtils";
import {setRenderOne} from "./Globals";

function getDockContainer() {
    return document.getElementById("Content") ?? document.body;
}

function getInitialPanelLeft(container, panelWidth, margin = 24) {
    const containerWidth = container?.clientWidth ?? window.innerWidth;
    return Math.max(16, containerWidth - panelWidth - margin);
}

function escapeHTML(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function formatImportMetadataValue(value, digits = 2) {
    if (value === undefined || value === null || value === "") return "-";
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "number") {
        return Number.isInteger(value) ? `${value}` : value.toFixed(digits);
    }
    return `${value}`;
}

function buildEXIFInspectorHTML(metadata) {
    if (!metadata) {
        return "<div>No EXIF metadata available</div>";
    }

    const rows = [];
    const pushRow = (label, value) => {
        if (value === undefined || value === null || value === "" || value === "-") return;
        rows.push(`<div><strong>${escapeHTML(label)}:</strong> ${escapeHTML(value)}</div>`);
    };

    const placement = metadata.placement ?? {};
    const optics = metadata.optics ?? {};
    const camera = metadata.camera ?? {};
    const capture = metadata.capture ?? {};

    pushRow("Camera", [camera.make, camera.model].filter(Boolean).join(" "));
    pushRow("Lens", camera.lensModel);
    pushRow("Captured", formatImportMetadataValue(capture.date));
    if (placement.hasLocation) {
        pushRow(
            "GPS",
            `${formatImportMetadataValue(placement.latitude, 6)}, ${formatImportMetadataValue(placement.longitude, 6)} @ ${formatImportMetadataValue(placement.altitude, 1)} m`
        );
    }
    pushRow("Heading", placement.heading !== undefined ? `${formatImportMetadataValue(placement.heading, 1)} deg` : undefined);
    pushRow("Pitch", placement.pitch !== undefined ? `${formatImportMetadataValue(placement.pitch, 1)} deg` : undefined);
    pushRow("Roll", placement.roll !== undefined ? `${formatImportMetadataValue(placement.roll, 1)} deg` : undefined);
    pushRow("Focal Length", optics.focalLengthMm !== undefined ? `${formatImportMetadataValue(optics.focalLengthMm, 1)} mm` : undefined);
    pushRow("35mm Eq", optics.focalLength35mm !== undefined ? `${formatImportMetadataValue(optics.focalLength35mm, 1)} mm` : undefined);
    pushRow("Digital Zoom", optics.digitalZoomRatio !== undefined ? `${formatImportMetadataValue(optics.digitalZoomRatio, 2)}x` : undefined);
    pushRow("Vertical FOV", optics.verticalFovDeg !== undefined ? `${formatImportMetadataValue(optics.verticalFovDeg, 2)} deg` : undefined);
    pushRow("Aperture", optics.fNumber !== undefined ? `f/${formatImportMetadataValue(optics.fNumber, 1)}` : undefined);
    pushRow("ISO", optics.iso);

    if (rows.length === 0) {
        return "<div>No usable EXIF metadata</div>";
    }

    return rows.join("");
}

function buildRawEXIFHTML(metadata) {
    if (!metadata) {
        return "<div>No EXIF metadata available</div>";
    }

    try {
        const rawSource = metadata.raw ?? metadata;
        return `<pre style="margin:0; white-space:pre-wrap; word-break:break-word; user-select:text; -webkit-user-select:text;">${escapeHTML(JSON.stringify(rawSource, null, 2))}</pre>`;
    } catch (error) {
        return `<div>Unable to render raw EXIF metadata: ${escapeHTML(error.message)}</div>`;
    }
}

async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        let copied = false;
        try {
            copied = document.execCommand("copy");
        } finally {
            textarea.remove();
        }
        return copied;
    }
}

export class EXIFInfoPanel {
    constructor(options = {}) {
        this.title = options.title ?? "Image EXIF";
        this.onVisibilityChange = options.onVisibilityChange ?? null;
        this.metadata = null;
        this.filename = "";
        this.visible = false;
        this.mode = "compact";

        this.createPanel();
    }

    createPanel() {
        const container = getDockContainer();
        const panelWidth = 380;
        const initialLeft = getInitialPanelLeft(container, panelWidth);

        this.panel = document.createElement("div");
        this.panel.style.cssText = `
            position: absolute;
            top: 16px;
            left: ${initialLeft}px;
            width: ${panelWidth}px;
            min-width: 300px;
            min-height: 220px;
            max-height: calc(100% - 32px);
            display: none;
            flex-direction: column;
            background: rgba(20, 24, 29, 0.96);
            color: #eef2f6;
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 10px;
            box-shadow: 0 14px 40px rgba(0, 0, 0, 0.45);
            overflow: hidden;
            resize: both;
            z-index: 2000;
            backdrop-filter: blur(8px);
        `;

        this.header = document.createElement("div");
        this.header.className = "exif-info-panel-header";
        this.header.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 8px;
            padding: 10px 12px 8px;
            background: rgba(255, 255, 255, 0.05);
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            font-size: 13px;
            font-weight: 600;
        `;

        this.titleRow = document.createElement("div");
        this.titleRow.style.cssText = `
            display: flex;
            align-items: center;
            gap: 12px;
            cursor: move;
            user-select: none;
        `;

        this.titleElement = document.createElement("div");
        this.titleElement.textContent = this.title;
        this.titleElement.style.cssText = `
            flex: 1 1 auto;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        `;
        this.titleRow.appendChild(this.titleElement);

        this.closeButton = this.createActionButton("Close", () => this.hide());
        this.titleRow.appendChild(this.closeButton);
        this.header.appendChild(this.titleRow);

        this.toolbar = document.createElement("div");
        this.toolbar.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
        `;

        this.copyGPSButton = this.createActionButton("Copy GPS", () => this.copyGPS());
        this.copyTimeButton = this.createActionButton("Copy Time", () => this.copyCaptureTime());
        this.copyRawButton = this.createActionButton("Copy Raw", () => this.copyRaw());
        this.modeButton = this.createActionButton("Show Raw", () => this.toggleMode());

        this.toolbar.appendChild(this.copyGPSButton);
        this.toolbar.appendChild(this.copyTimeButton);
        this.toolbar.appendChild(this.copyRawButton);
        this.toolbar.appendChild(this.modeButton);
        this.header.appendChild(this.toolbar);

        this.status = document.createElement("div");
        this.status.style.cssText = `
            min-height: 18px;
            padding: 6px 12px 0;
            color: rgba(238, 242, 246, 0.74);
            font-size: 11px;
        `;

        this.content = document.createElement("div");
        this.content.style.cssText = `
            flex: 1 1 auto;
            min-height: 0;
            padding: 12px;
            overflow-x: auto;
            overflow-y: scroll;
            line-height: 1.45;
            font-size: 12px;
            white-space: normal;
            user-select: text;
            -webkit-user-select: text;
        `;

        this.panel.appendChild(this.header);
        this.panel.appendChild(this.status);
        this.panel.appendChild(this.content);
        container.appendChild(this.panel);

        // Prevent mouse/wheel events from passing through to views underneath.
        // Pointer events are excluded — makeDraggable relies on document-level
        // pointerup to end drags, which stopPropagation would break.
        for (const eventType of ["mousedown", "mouseup", "click", "dblclick", "wheel"]) {
            this.panel.addEventListener(eventType, (e) => e.stopPropagation());
        }

        makeDraggable(this.panel, {
            handle: this.titleRow,
            excludeElements: [this.closeButton, this.toolbar],
        });
    }

    createActionButton(label, onClick) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.style.cssText = `
            border: 0;
            border-radius: 6px;
            padding: 4px 8px;
            background: rgba(255, 255, 255, 0.08);
            color: inherit;
            cursor: pointer;
            font: inherit;
        `;
        button.addEventListener("click", async (event) => {
            event.stopPropagation();
            await onClick();
        });
        return button;
    }

    getGPSValue() {
        const placement = this.metadata?.placement;
        if (!placement?.hasLocation) return null;
        return `${formatImportMetadataValue(placement.latitude, 6)}, ${formatImportMetadataValue(placement.longitude, 6)} @ ${formatImportMetadataValue(placement.altitude, 1)} m`;
    }

    getCaptureTimeValue() {
        return this.metadata?.capture?.date ? formatImportMetadataValue(this.metadata.capture.date) : null;
    }

    setStatus(message) {
        this.status.textContent = message ?? "";
    }

    async copyGPS() {
        const value = this.getGPSValue();
        if (!value) {
            this.setStatus("No GPS data to copy");
            return;
        }
        this.setStatus(await copyText(value) ? "GPS copied" : "Unable to copy GPS");
    }

    async copyCaptureTime() {
        const value = this.getCaptureTimeValue();
        if (!value) {
            this.setStatus("No capture time to copy");
            return;
        }
        this.setStatus(await copyText(value) ? "Capture time copied" : "Unable to copy capture time");
    }

    async copyRaw() {
        if (this.mode !== "raw") {
            this.setStatus("Switch to raw view to copy the raw EXIF text");
            return;
        }

        const rawElement = this.content.querySelector("pre");
        const value = rawElement?.textContent ?? "";
        if (!value) {
            this.setStatus("No raw EXIF data to copy");
            return;
        }

        this.setStatus(await copyText(value) ? "Raw EXIF copied" : "Unable to copy raw EXIF");
    }

    toggleMode() {
        this.mode = this.mode === "compact" ? "raw" : "compact";
        this.renderContent();
    }

    renderContent() {
        this.titleElement.textContent = this.filename ? `${this.title}: ${this.filename}` : this.title;
        this.content.innerHTML = this.mode === "raw"
            ? buildRawEXIFHTML(this.metadata)
            : buildEXIFInspectorHTML(this.metadata);
        this.modeButton.textContent = this.mode === "raw" ? "Show Compact" : "Show Raw";
        this.copyGPSButton.disabled = !this.getGPSValue();
        this.copyTimeButton.disabled = !this.getCaptureTimeValue();
        this.copyRawButton.disabled = this.mode !== "raw";
        this.copyGPSButton.style.opacity = this.copyGPSButton.disabled ? "0.5" : "1";
        this.copyTimeButton.style.opacity = this.copyTimeButton.disabled ? "0.5" : "1";
        this.copyRawButton.style.opacity = this.copyRawButton.disabled ? "0.5" : "1";
    }

    setMetadata(metadata, filename = "") {
        this.metadata = metadata ?? null;
        this.filename = filename ?? "";
        this.setStatus("");
        this.renderContent();

        if (!this.metadata) {
            this.hide();
        }
    }

    show() {
        if (!this.metadata) {
            return;
        }
        this.visible = true;
        this.panel.style.display = "flex";
        this.onVisibilityChange?.(true);
        setRenderOne(true);
    }

    hide() {
        this.visible = false;
        this.panel.style.display = "none";
        this.onVisibilityChange?.(false);
        setRenderOne(true);
    }

    toggle() {
        if (this.visible) {
            this.hide();
        } else {
            this.show();
        }
    }

    destroy() {
        this.panel.remove();
    }
}
