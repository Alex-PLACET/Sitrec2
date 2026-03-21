// AttributionOverlay.js
// Displays legally required on-screen attribution for active map, elevation,
// and 3D tile data sources.  Renders as a small semi-transparent HTML overlay
// positioned at the bottom-right of the viewport.

let overlayDiv = null;
let currentParts = {map: "", elevation: "", tiles: ""};

function createOverlay() {
    if (overlayDiv) return overlayDiv;

    overlayDiv = document.createElement("div");
    overlayDiv.id = "sitrec-attribution";
    Object.assign(overlayDiv.style, {
        position: "fixed",
        bottom: "2px",
        right: "2px",
        maxWidth: "60vw",
        padding: "1px 4px",
        background: "rgba(0,0,0,0.45)",
        color: "rgba(255,255,255,0.8)",
        fontSize: "10px",
        fontFamily: "sans-serif",
        lineHeight: "1.3",
        pointerEvents: "auto",
        zIndex: "10000",
        borderRadius: "2px",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
    });
    document.body.appendChild(overlayDiv);
    return overlayDiv;
}

function render() {
    const el = createOverlay();
    if (!el) return;
    const parts = [currentParts.map, currentParts.elevation, currentParts.tiles]
        .filter(Boolean);
    if (parts.length === 0) {
        el.style.display = "none";
        return;
    }
    el.style.display = "";
    // Join with a separator, using innerHTML so links are clickable
    el.innerHTML = parts.join(" | ");

    // Style all links
    for (const a of el.querySelectorAll("a")) {
        a.style.color = "rgba(255,255,255,0.8)";
        a.style.textDecoration = "none";
        a.target = "_blank";
        a.rel = "noopener noreferrer";
    }
}

/**
 * Build an HTML snippet from a source definition's attribution/termsURL fields.
 * Returns "" if there is no attribution text.
 */
function formatAttribution(sourceDef) {
    if (!sourceDef || !sourceDef.attribution) return "";
    const text = sourceDef.attribution;
    const url = sourceDef.termsURL;
    if (url) {
        return `<a href="${url}">${text}</a>`;
    }
    return text;
}

export function setMapAttribution(sourceDef) {
    currentParts.map = formatAttribution(sourceDef);
    render();
}

export function setElevationAttribution(sourceDef) {
    currentParts.elevation = formatAttribution(sourceDef);
    render();
}

export function setTilesAttribution(text) {
    currentParts.tiles = text || "";
    render();
}

/**
 * Return the current attribution as plain text (for canvas/video rendering).
 */
export function getAttributionText() {
    const parts = [currentParts.map, currentParts.elevation, currentParts.tiles]
        .filter(Boolean)
        .map(html => html.replace(/<[^>]*>/g, "")); // strip HTML tags
    return parts.join(" | ");
}

/**
 * Draw attribution text onto a 2D canvas context (for video export).
 * Positioned at bottom-right, matching the on-screen overlay style.
 */
export function drawAttributionOnCanvas(ctx, canvasWidth, canvasHeight) {
    const text = getAttributionText();
    if (!text) return;
    ctx.save();
    ctx.font = "10px sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText(text, canvasWidth - 4, canvasHeight - 2);
    ctx.restore();
}

export function disposeAttributionOverlay() {
    if (overlayDiv && overlayDiv.parentNode) {
        overlayDiv.parentNode.removeChild(overlayDiv);
    }
    overlayDiv = null;
    currentParts = {map: "", elevation: "", tiles: ""};
}
