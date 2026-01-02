import {WebMVideoExporter} from "./WebMVideoExporter";
import {MP4VideoExporter} from "./MP4VideoExporter";

export const VideoFormats = {
    'mp4-h264': {
        name: 'MP4 (H.264)',
        extension: 'mp4',
        exporter: 'mp4',
    },
    'webm-vp8': {
        name: 'WebM (VP8)',
        extension: 'webm',
        exporter: 'webm',
    },
};

export const DefaultVideoFormat = 'mp4-h264';

export async function createVideoExporter(formatId, options) {
    const format = VideoFormats[formatId];
    if (!format) {
        throw new Error(`Unknown video format: ${formatId}`);
    }

    if (format.exporter === 'webm') {
        return new WebMVideoExporter(options);
    } else if (format.exporter === 'mp4') {
        return new MP4VideoExporter(options);
    }

    throw new Error(`Unknown exporter type: ${format.exporter}`);
}

export function getVideoExtension(formatId) {
    const format = VideoFormats[formatId];
    return format ? format.extension : 'mp4';
}

export function getVideoFormatOptions() {
    return Object.entries(VideoFormats).reduce((acc, [key, value]) => {
        acc[value.name] = key;
        return acc;
    }, {});
}
