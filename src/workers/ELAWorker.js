"use strict";

let sourceCanvas = null;
let sourceCtx = null;
let recompressedCanvas = null;
let recompressedCtx = null;
let outputCanvas = null;
let outputCtx = null;

function ensureCanvases(width, height) {
    if (!sourceCanvas) {
        sourceCanvas = new OffscreenCanvas(width, height);
        sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
        recompressedCanvas = new OffscreenCanvas(width, height);
        recompressedCtx = recompressedCanvas.getContext("2d", { willReadFrequently: true });
        outputCanvas = new OffscreenCanvas(width, height);
        outputCtx = outputCanvas.getContext("2d", { willReadFrequently: true });
        return;
    }

    if (sourceCanvas.width !== width || sourceCanvas.height !== height) {
        sourceCanvas.width = width;
        sourceCanvas.height = height;
        recompressedCanvas.width = width;
        recompressedCanvas.height = height;
        outputCanvas.width = width;
        outputCanvas.height = height;
    }
}

async function processELA(bitmap, jpegQuality, errorScale, expandMethod, clipPercent, requestId, key) {
    const width = bitmap.width;
    const height = bitmap.height;
    ensureCanvases(width, height);

    sourceCtx.clearRect(0, 0, width, height);
    sourceCtx.drawImage(bitmap, 0, 0, width, height);
    const sourcePixels = sourceCtx.getImageData(0, 0, width, height).data;

    const jpegBlob = await sourceCanvas.convertToBlob({
        type: "image/jpeg",
        quality: jpegQuality
    });

    const recompressedBitmap = await createImageBitmap(jpegBlob);
    recompressedCtx.clearRect(0, 0, width, height);
    recompressedCtx.drawImage(recompressedBitmap, 0, 0, width, height);
    recompressedBitmap.close?.();

    const recompressedPixels = recompressedCtx.getImageData(0, 0, width, height).data;
    const outputImageData = outputCtx.createImageData(width, height);
    const outputPixels = outputImageData.data;

    for (let i = 0; i < outputPixels.length; i += 4) {
        outputPixels[i] = Math.min(255, Math.abs(sourcePixels[i] - recompressedPixels[i]) * errorScale);
        outputPixels[i + 1] = Math.min(255, Math.abs(sourcePixels[i + 1] - recompressedPixels[i + 1]) * errorScale);
        outputPixels[i + 2] = Math.min(255, Math.abs(sourcePixels[i + 2] - recompressedPixels[i + 2]) * errorScale);
        outputPixels[i + 3] = 255;
    }

    // Send progress with raw diff before expansion is applied
    if (expandMethod !== 'none') {
        outputCtx.putImageData(outputImageData, 0, 0);
        const progressBitmap = await createImageBitmap(outputCanvas);
        self.postMessage({
            type: "progress",
            requestId,
            key,
            bitmap: progressBitmap
        }, [progressBitmap]);
    }

    applyELAOutputExpansion(outputPixels, width, height, expandMethod, clipPercent);
    outputCtx.putImageData(outputImageData, 0, 0);

    if (outputCanvas.transferToImageBitmap) {
        return outputCanvas.transferToImageBitmap();
    }
    return createImageBitmap(outputCanvas);
}

function applyELAOutputExpansion(pixels, width, height, method, clipPercent) {
    switch (method) {
        case "histogramEqualization":
            applyHistogramEqualization(pixels, width, height);
            break;
        case "autoContrast":
            applyAutoContrast(pixels, width, height, clipPercent);
            break;
        case "autoContrastChannels":
            applyAutoContrastChannels(pixels, width, height, clipPercent);
            break;
        case "none":
        default:
            break;
    }
}

function applyHistogramEqualization(pixels, width, height) {
    const hist = buildLuminanceHistogram(pixels);
    const pixelCount = width * height;
    if (pixelCount <= 1) return;

    let cdf = 0;
    let cdfMin = -1;
    const lut = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
        cdf += hist[i];
        if (cdfMin < 0 && cdf > 0) cdfMin = cdf;
        if (cdfMin < 0 || cdf === cdfMin) {
            lut[i] = 0;
        } else {
            lut[i] = clampByte(((cdf - cdfMin) * 255) / (pixelCount - cdfMin));
        }
    }

    for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        const luma = getLuma(r, g, b);
        const newLuma = lut[luma];
        if (luma <= 0) {
            pixels[i] = newLuma;
            pixels[i + 1] = newLuma;
            pixels[i + 2] = newLuma;
            continue;
        }
        const scale = newLuma / luma;
        pixels[i] = clampByte(r * scale);
        pixels[i + 1] = clampByte(g * scale);
        pixels[i + 2] = clampByte(b * scale);
    }
}

function applyAutoContrast(pixels, width, height, clipPercent) {
    const hist = buildLuminanceHistogram(pixels);
    const pixelCount = width * height;
    const { low, high } = findLowHighFromHistogram(hist, pixelCount, clipPercent);
    if (high <= low) return;

    const range = high - low;
    for (let i = 0; i < pixels.length; i += 4) {
        pixels[i] = clampByte(((pixels[i] - low) * 255) / range);
        pixels[i + 1] = clampByte(((pixels[i + 1] - low) * 255) / range);
        pixels[i + 2] = clampByte(((pixels[i + 2] - low) * 255) / range);
    }
}

function applyAutoContrastChannels(pixels, width, height, clipPercent) {
    const pixelCount = width * height;
    const channelRanges = [];

    for (let c = 0; c < 3; c++) {
        const hist = new Uint32Array(256);
        for (let i = c; i < pixels.length; i += 4) {
            hist[pixels[i]]++;
        }
        channelRanges[c] = findLowHighFromHistogram(hist, pixelCount, clipPercent);
    }

    for (let i = 0; i < pixels.length; i += 4) {
        for (let c = 0; c < 3; c++) {
            const { low, high } = channelRanges[c];
            if (high <= low) continue;
            pixels[i + c] = clampByte(((pixels[i + c] - low) * 255) / (high - low));
        }
    }
}

function buildLuminanceHistogram(pixels) {
    const hist = new Uint32Array(256);
    for (let i = 0; i < pixels.length; i += 4) {
        hist[getLuma(pixels[i], pixels[i + 1], pixels[i + 2])]++;
    }
    return hist;
}

function findLowHighFromHistogram(hist, sampleCount, clipPercent = 0) {
    const clipCount = Math.floor(sampleCount * Math.max(0, clipPercent) / 100);

    let low = 0;
    let cumulativeLow = 0;
    while (low < 255 && cumulativeLow + hist[low] <= clipCount) {
        cumulativeLow += hist[low];
        low++;
    }

    let high = 255;
    let cumulativeHigh = 0;
    while (high > 0 && cumulativeHigh + hist[high] <= clipCount) {
        cumulativeHigh += hist[high];
        high--;
    }

    return { low, high };
}

function getLuma(r, g, b) {
    return clampByte(0.299 * r + 0.587 * g + 0.114 * b);
}

function clampByte(value) {
    if (value <= 0) return 0;
    if (value >= 255) return 255;
    return Math.round(value);
}

self.onmessage = async (event) => {
    const msg = event.data;

    if (msg.type === "dispose") {
        self.close();
        return;
    }

    if (msg.type !== "process") return;

    const { requestId, key, bitmap, jpegQuality, errorScale, expandMethod, clipPercent } = msg;
    try {
        const resultBitmap = await processELA(bitmap, jpegQuality, errorScale, expandMethod, clipPercent, requestId, key);
        bitmap?.close?.();
        self.postMessage({
            type: "result",
            requestId,
            key,
            bitmap: resultBitmap
        }, [resultBitmap]);
    } catch (err) {
        bitmap?.close?.();
        self.postMessage({
            type: "error",
            requestId,
            key,
            message: err?.message || String(err)
        });
    }
};
