"use strict";

let sourceCanvas = null;
let sourceCtx = null;
let outputCanvas = null;
let outputCtx = null;

function ensureCanvases(width, height) {
    if (!sourceCanvas) {
        sourceCanvas = new OffscreenCanvas(width, height);
        sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
        outputCanvas = new OffscreenCanvas(width, height);
        outputCtx = outputCanvas.getContext("2d", { willReadFrequently: true });
        return;
    }

    if (sourceCanvas.width !== width || sourceCanvas.height !== height) {
        sourceCanvas.width = width;
        sourceCanvas.height = height;
        outputCanvas.width = width;
        outputCanvas.height = height;
    }
}

/**
 * Noise Analysis Worker
 *
 * Extracts the noise residual from an image using a Laplacian high-pass filter,
 * then either visualizes the residual directly or computes a block-based noise
 * heatmap showing local noise level consistency.
 *
 * Modes:
 * - "residual": Shows the amplified noise residual (grey = no noise, bright = noise)
 * - "heatmap": Color-coded blocks showing local noise deviation from the global median
 */

async function processNoise(bitmap, blockSize, noiseScale, displayMode) {
    const width = bitmap.width;
    const height = bitmap.height;
    ensureCanvases(width, height);

    sourceCtx.clearRect(0, 0, width, height);
    sourceCtx.drawImage(bitmap, 0, 0, width, height);
    const sourcePixels = sourceCtx.getImageData(0, 0, width, height).data;

    // Convert to greyscale luminance
    const grey = new Float32Array(width * height);
    for (let i = 0; i < grey.length; i++) {
        const idx = i * 4;
        grey[i] = 0.299 * sourcePixels[idx] + 0.587 * sourcePixels[idx + 1] + 0.114 * sourcePixels[idx + 2];
    }

    // Apply 3x3 Laplacian high-pass filter to extract noise residual
    // Kernel: [0, -1, 0, -1, 4, -1, 0, -1, 0]
    const laplacian = new Float32Array(width * height);
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;
            laplacian[idx] =
                4 * grey[idx]
                - grey[idx - 1]
                - grey[idx + 1]
                - grey[idx - width]
                - grey[idx + width];
        }
    }

    const outputImageData = outputCtx.createImageData(width, height);
    const outputPixels = outputImageData.data;

    if (displayMode === "residual") {
        renderResidual(laplacian, outputPixels, width, height, noiseScale);
    } else {
        renderHeatmap(laplacian, outputPixels, width, height, blockSize);
    }

    outputCtx.putImageData(outputImageData, 0, 0);

    if (outputCanvas.transferToImageBitmap) {
        return outputCanvas.transferToImageBitmap();
    }
    return createImageBitmap(outputCanvas);
}

/**
 * Render amplified noise residual. Centered at grey (128), deviations shown
 * as brighter or darker. Useful for visually inspecting noise patterns.
 */
function renderResidual(laplacian, outputPixels, width, height, noiseScale) {
    for (let i = 0; i < laplacian.length; i++) {
        const val = clampByte(128 + laplacian[i] * noiseScale);
        const idx = i * 4;
        outputPixels[idx] = val;
        outputPixels[idx + 1] = val;
        outputPixels[idx + 2] = val;
        outputPixels[idx + 3] = 255;
    }
}

/**
 * Render block-based noise heatmap. Each block's local noise standard deviation
 * is compared to the global median noise level. Blocks are colored:
 * - Blue: significantly lower noise than median (possibly smoothed/synthetic)
 * - Green: noise consistent with median (expected for natural imagery)
 * - Red/Yellow: significantly higher noise (possible artifact/different source)
 */
function renderHeatmap(laplacian, outputPixels, width, height, blockSize) {
    const blocksX = Math.ceil(width / blockSize);
    const blocksY = Math.ceil(height / blockSize);
    const blockStdDevs = new Float32Array(blocksX * blocksY);

    // Compute standard deviation of Laplacian values in each block
    for (let by = 0; by < blocksY; by++) {
        for (let bx = 0; bx < blocksX; bx++) {
            const x0 = bx * blockSize;
            const y0 = by * blockSize;
            const x1 = Math.min(x0 + blockSize, width);
            const y1 = Math.min(y0 + blockSize, height);

            let sum = 0;
            let sumSq = 0;
            let count = 0;

            for (let y = y0; y < y1; y++) {
                for (let x = x0; x < x1; x++) {
                    const val = laplacian[y * width + x];
                    sum += val;
                    sumSq += val * val;
                    count++;
                }
            }

            if (count > 0) {
                const mean = sum / count;
                const variance = sumSq / count - mean * mean;
                blockStdDevs[by * blocksX + bx] = Math.sqrt(Math.max(0, variance));
            }
        }
    }

    // Find median standard deviation as robust global noise estimate
    const sorted = Array.from(blockStdDevs).filter(v => v > 0).sort((a, b) => a - b);
    const medianNoise = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 1;

    // Color each pixel based on its block's deviation from the median
    for (let by = 0; by < blocksY; by++) {
        for (let bx = 0; bx < blocksX; bx++) {
            const stdDev = blockStdDevs[by * blocksX + bx];
            const ratio = medianNoise > 0 ? stdDev / medianNoise : 1;

            // Map ratio to color: <0.5 = blue, 1.0 = green, >2.0 = red
            const rgb = ratioToColor(ratio);

            const x0 = bx * blockSize;
            const y0 = by * blockSize;
            const x1 = Math.min(x0 + blockSize, width);
            const y1 = Math.min(y0 + blockSize, height);

            for (let y = y0; y < y1; y++) {
                for (let x = x0; x < x1; x++) {
                    const idx = (y * width + x) * 4;
                    outputPixels[idx] = rgb[0];
                    outputPixels[idx + 1] = rgb[1];
                    outputPixels[idx + 2] = rgb[2];
                    outputPixels[idx + 3] = 255;
                }
            }
        }
    }
}

/**
 * Map a noise ratio to a color on a blue → green → yellow → red gradient.
 * ratio < 0.5: deep blue (unusually low noise)
 * ratio ≈ 1.0: green (consistent with median)
 * ratio > 2.0: red (unusually high noise)
 */
function ratioToColor(ratio) {
    // Normalize to 0..1 range where 0 = ratio 0.25, 1 = ratio 3.0
    const t = Math.max(0, Math.min(1, (ratio - 0.25) / 2.75));

    let r, g, b;
    if (t < 0.27) {
        // Blue to Cyan (ratio ~0.25 to ~1.0)
        const s = t / 0.27;
        r = 0;
        g = Math.round(s * 200);
        b = Math.round(200 - s * 100);
    } else if (t < 0.55) {
        // Cyan/Green to Yellow (ratio ~1.0 to ~1.75)
        const s = (t - 0.27) / 0.28;
        r = Math.round(s * 255);
        g = 200;
        b = Math.round(100 * (1 - s));
    } else {
        // Yellow to Red (ratio ~1.75 to ~3.0)
        const s = (t - 0.55) / 0.45;
        r = 255;
        g = Math.round(200 * (1 - s));
        b = 0;
    }

    return [r, g, b];
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

    const { requestId, key, bitmap, blockSize, noiseScale, displayMode } = msg;
    try {
        const resultBitmap = await processNoise(bitmap, blockSize, noiseScale, displayMode);
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
