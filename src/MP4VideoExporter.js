export class MP4VideoExporter {
    constructor(options = {}) {
        this.width = options.width || 640;
        this.height = options.height || 480;
        this.fps = options.fps || 30;
        this.bitrate = options.bitrate || 5_000_000;
        this.keyFrameInterval = options.keyFrameInterval || 30;
        this.videoStartDate = options.videoStartDate || null;

        this.encoder = null;
        this.muxer = null;
        this.encoderError = null;
        this.frameCount = 0;

        this.timestampAccumulatorMicros = 0;
        this.errorAccumulator = 0;

        const fpsRounded = Math.round(this.fps * 1000);
        const is23976 = Math.abs(fpsRounded - 23976) < 10;
        const is29970 = Math.abs(fpsRounded - 29970) < 10;

        if (is23976) {
            this.baseFrameDurationMicros = 41708;
            this.errorStep = 1;
            this.errorThreshold = 3;
            this.errorAdjustment = 1;
        } else if (is29970) {
            this.baseFrameDurationMicros = 33367;
            this.errorStep = 1;
            this.errorThreshold = 3;
            this.errorAdjustment = -1;
        } else {
            this.baseFrameDurationMicros = Math.round(1_000_000 / this.fps);
            this.errorStep = 0;
            this.errorThreshold = 1;
            this.errorAdjustment = 0;
        }
    }

    async initialize() {
        if (typeof VideoEncoder === 'undefined') {
            throw new Error('VideoEncoder API not supported');
        }

        const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');

        const encodedWidth = Math.ceil(this.width / 2) * 2;
        const encodedHeight = Math.ceil(this.height / 2) * 2;

        this.target = new ArrayBufferTarget();
        this.muxer = new Muxer({
            target: this.target,
            video: {
                codec: 'avc',
                width: encodedWidth,
                height: encodedHeight,
            },
            fastStart: 'in-memory',
        });

        this.encoderError = null;
        this.frameCount = 0;
        this.timestampAccumulatorMicros = 0;
        this.errorAccumulator = 0;

        this.encoder = new VideoEncoder({
            output: (chunk, meta) => {
                this.muxer.addVideoChunk(chunk, meta);
            },
            error: (e) => {
                console.error('VideoEncoder error:', e);
                this.encoderError = e;
            }
        });

        const config = {
            codec: 'avc1.640028',
            width: encodedWidth,
            height: encodedHeight,
            framerate: this.fps,
            bitrate: this.bitrate,
            avc: { format: 'avc' },
        };

        const support = await VideoEncoder.isConfigSupported(config);
        if (!support.supported) {
            config.codec = 'avc1.42001f';
            const support2 = await VideoEncoder.isConfigSupported(config);
            if (!support2.supported) {
                throw new Error('H.264 codec not supported by browser');
            }
        }

        this.encoder.configure(config);
        this.encodedWidth = encodedWidth;
        this.encodedHeight = encodedHeight;
    }

    async addFrame(canvas, frameIndex) {
        if (this.encoderError) throw this.encoderError;

        const timestampMicros = this.timestampAccumulatorMicros;

        let frameDurationMicros = this.baseFrameDurationMicros;
        this.errorAccumulator += this.errorStep;
        if (this.errorAccumulator >= this.errorThreshold) {
            frameDurationMicros += this.errorAdjustment;
            this.errorAccumulator -= this.errorThreshold;
        }

        let frameCanvas = canvas;
        if (canvas.width !== this.encodedWidth || canvas.height !== this.encodedHeight) {
            frameCanvas = document.createElement('canvas');
            frameCanvas.width = this.encodedWidth;
            frameCanvas.height = this.encodedHeight;
            const ctx = frameCanvas.getContext('2d');
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, this.encodedWidth, this.encodedHeight);
            ctx.drawImage(canvas, 0, 0);
        }

        const videoFrame = new VideoFrame(frameCanvas, {
            timestamp: timestampMicros,
            duration: frameDurationMicros,
        });

        const isKeyFrame = frameIndex % this.keyFrameInterval === 0;
        this.encoder.encode(videoFrame, { keyFrame: isKeyFrame });
        videoFrame.close();

        this.timestampAccumulatorMicros += frameDurationMicros;
        this.frameCount++;
    }

    async finalize(onProgress = null, onStatus = null) {
        if (onStatus) {
            onStatus('Flushing encoder...');
            await new Promise(r => setTimeout(r, 0));
        }
        await this.encoder.flush();
        this.encoder.close();

        if (onStatus) {
            onStatus('Finalizing MP4...');
            await new Promise(r => setTimeout(r, 0));
        }
        this.muxer.finalize();

        const buffer = this.target.buffer;
        return new Blob([buffer], { type: 'video/mp4' });
    }

    getFrameCount() {
        return this.frameCount;
    }
}
