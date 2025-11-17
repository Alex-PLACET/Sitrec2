import {CVideoAndAudio} from "./CVideoAndAudio.js";
import {MP4Demuxer, MP4Source} from "./js/mp4-decode/mp4_demuxer";
import {Sit} from "./Globals.js";
import {EventManager} from "./CEventManager.js";
import {updateSitFrames} from "./UpdateSitFrames";

/**
 * Audio-only video class that plays audio files (mp4, m4a) with a black video frame
 * Extends CVideoAndAudio to provide audio playback with minimal video overhead
 * 
 * Key features:
 * - Supports MP4 and M4A audio files
 * - Returns black frames for video display
 * - Full audio playback functionality
 * - Minimal memory usage (no video decoding)
 * - Compatible with existing video player controls
 */
export class CVideoAudioOnly extends CVideoAndAudio {
    constructor(v, loadedCallback, errorCallback) {
        super(v);
        
        this.loaded = false;
        this.loadedCallback = loadedCallback;
        this.errorCallback = errorCallback;
        this.demuxer = null;
        this.blackFrame = null;
        this.originalFps = 30; // Default fps for audio-only files
        
        // Store filename for debugging
        this.filename = v.dropFile ? v.dropFile.name : (v.filename || "Unknown");
        
        console.log(`[CVideoAudioOnly] Constructor: id=${this.id}, filename=${this.filename}`);
        
        // Set default video dimensions for black frame
        this.videoWidth = 640;
        this.videoHeight = 360;
        
        // Initialize based on source type
        if (v.dropFile) {
            console.log(`[CVideoAudioOnly] Loading from dropped file: ${v.dropFile.name}`);
            this.loadFromFile(v.dropFile);
        } else if (v.filename) {
            console.log(`[CVideoAudioOnly] Loading from URL: ${v.filename}`);
            this.loadFromURL(v.filename);
        } else {
            console.warn(`[CVideoAudioOnly] No file or filename provided`);
        }
    }
    
    /**
     * Load audio from a dropped file
     * @param {File} file - The audio file to load
     */
    loadFromFile(file) {
        const fileName = file.name.toLowerCase();
        console.log(`[CVideoAudioOnly.loadFromFile] Starting: ${file.name}, size=${file.size}`);
        
        // Check if it's an MP3 file
        if (fileName.endsWith('.mp3')) {
            console.log(`[CVideoAudioOnly.loadFromFile] MP3 file detected, using direct audio element playback`);
            this.loadMP3File(file);
        } else {
            console.log(`[CVideoAudioOnly.loadFromFile] Non-MP3 file detected, using MP4 demuxer (M4A, MP4, etc)`);
            // Use MP4 demuxer for M4A and MP4 audio files
            const source = new MP4Source();
            
            console.log(`[CVideoAudioOnly.loadFromFile] Creating FileReader for: ${file.name}`);
            // Read the file as ArrayBuffer and append to MP4Source
            const reader = new FileReader();
            reader.readAsArrayBuffer(file);
            reader.onloadend = () => {
                const buffer = reader.result;
                console.log(`[CVideoAudioOnly.loadFromFile] FileReader onloadend: buffer size=${buffer.byteLength}`);
                buffer.fileStart = 0;
                console.log(`[CVideoAudioOnly.loadFromFile] Appending buffer to MP4Source...`);
                source.file.appendBuffer(buffer);
                console.log(`[CVideoAudioOnly.loadFromFile] Flushing MP4Source...`);
                source.file.flush();
                console.log(`[CVideoAudioOnly.loadFromFile] Flush complete, waiting for source.getInfo()...`);
                
                // Wait for MP4Source to be ready using getInfo() promise
                const infoPromise = source.getInfo();
                console.log(`[CVideoAudioOnly.loadFromFile] getInfo() returned promise:`, infoPromise);
                
                infoPromise.then((info) => {
                    console.log(`[CVideoAudioOnly.loadFromFile] source.getInfo() resolved with info:`, info ? 'YES' : 'NO', typeof info);
                    this.startAudioExtraction(source);
                }).catch((error) => {
                    console.error(`[CVideoAudioOnly.loadFromFile] source.getInfo() error:`, error);
                    if (this.errorCallback) {
                        this.errorCallback(error);
                    }
                });
                
                console.log(`[CVideoAudioOnly.loadFromFile] Promise chain set up, waiting for resolution...`);
            };
            reader.onerror = (error) => {
                console.error(`[CVideoAudioOnly.loadFromFile] FileReader error:`, error);
                if (this.errorCallback) {
                    this.errorCallback(error);
                }
            };
        }
    }
    
    /**
     * Load audio from a URL
     * @param {string} url - The URL of the audio file
     */
    loadFromURL(url) {
        const urlLower = url.toLowerCase();
        
        // Check if it's an MP3 file
        if (urlLower.endsWith('.mp3')) {
            console.log("MP3 URL detected, using direct audio element playback");
            this.loadMP3URL(url);
        } else {
            // Use MP4 demuxer for M4A and MP4 audio files
            const source = new MP4Source();
            source.onReady = (info) => {
                console.log("Audio file ready from URL:", info);
                this.startAudioExtraction(source);
            };
            source.onError = (error) => {
                console.error("Error loading audio from URL:", error);
                if (this.errorCallback) {
                    this.errorCallback(error);
                }
            };
            source.loadURL(url);
        }
    }
    
    /**
     * Load MP3 file using HTML5 Audio element
     * @param {File} file - The MP3 file to load
     */
    loadMP3File(file) {
        const url = URL.createObjectURL(file);
        this.loadMP3URL(url, true);
    }
    
    /**
     * Load MP3 from URL using HTML5 Audio element
     * @param {string} url - The URL of the MP3 file
     * @param {boolean} isObjectURL - Whether the URL is an object URL that needs cleanup
     */
    loadMP3URL(url, isObjectURL = false) {
        console.log(`[CVideoAudioOnly.loadMP3URL] Starting: url=${url}, isObjectURL=${isObjectURL}`);
        // Create an audio element to get duration and metadata
        const audio = new Audio();
        audio.src = url;
        
        audio.addEventListener('loadedmetadata', () => {
            console.log(`[CVideoAudioOnly.loadMP3URL] loadedmetadata event fired, duration=${audio.duration}s`);
            
            // Calculate frame count based on audio duration
            this.frames = Math.ceil(audio.duration * this.originalFps);
            this.frames = Math.max(1, this.frames); // At least 1 frame
            
            console.log(`[CVideoAudioOnly.loadMP3URL] Frames calculated: ${this.frames} (fps=${this.originalFps})`);
            
            // Apply video speed multiplier
            this.frames *= this.videoSpeed;
            console.log(`[CVideoAudioOnly.loadMP3URL] After speed multiplier (${this.videoSpeed}x): ${this.frames} frames`);
            
            // Update global frame count
            Sit.videoFrames = this.frames;
            Sit.fps = this.originalFps;
            updateSitFrames();
            
            // Initialize a simple audio handler for MP3
            console.log(`[CVideoAudioOnly.loadMP3URL] Initializing MP3 audio handler...`);
            this.initializeMP3Audio(audio, url, isObjectURL);
            
            // Dispatch videoLoaded event for view setup
            console.log(`[CVideoAudioOnly.loadMP3URL] Dispatching videoLoaded event...`);
            EventManager.dispatchEvent("videoLoaded", {
                videoData: this, 
                width: this.videoWidth, 
                height: this.videoHeight
            });
            
            // Mark as loaded
            console.log(`[CVideoAudioOnly.loadMP3URL] Marking as loaded and calling loadedCallback...`);
            this.loaded = true;
            if (this.loadedCallback) {
                this.loadedCallback(this);
            }
            console.log(`[CVideoAudioOnly.loadMP3URL] Complete!`);
        });
        
        audio.addEventListener('error', (e) => {
            console.error(`[CVideoAudioOnly.loadMP3URL] Audio element error:`, e);
            if (isObjectURL) {
                console.log(`[CVideoAudioOnly.loadMP3URL] Revoking object URL`);
                URL.revokeObjectURL(url);
            }
            if (this.errorCallback) {
                this.errorCallback("Error loading MP3 file");
            }
        });
        
        // Start loading the audio
        console.log(`[CVideoAudioOnly.loadMP3URL] Calling audio.load()...`);
        audio.load();
    }
    
    /**
     * Initialize simple audio playback for MP3 files
     * @param {HTMLAudioElement} audio - The audio element
     * @param {string} url - The audio URL
     * @param {boolean} isObjectURL - Whether to clean up object URL
     */
    initializeMP3Audio(audio, url, isObjectURL) {
        // Store the audio element for playback control
        this.mp3Audio = audio;
        this.mp3URL = url;
        this.isObjectURL = isObjectURL;
        
        // Override audio handler methods for MP3
        this.audioHandler = {
            isPlaying: false,
            isMuted: false,
            volume: 1.0,
            
            play: (startFrame, fps) => {
                const startTime = startFrame / fps;
                this.mp3Audio.currentTime = startTime;
                this.mp3Audio.play();
                this.audioHandler.isPlaying = true;
            },
            
            pause: () => {
                this.mp3Audio.pause();
                this.audioHandler.isPlaying = false;
            },
            
            stop: () => {
                this.mp3Audio.pause();
                this.mp3Audio.currentTime = 0;
                this.audioHandler.isPlaying = false;
            },
            
            setVolume: (volume) => {
                this.mp3Audio.volume = volume;
                this.audioHandler.volume = volume;
            },
            
            setMuted: (muted) => {
                this.mp3Audio.muted = muted;
                this.audioHandler.isMuted = muted;
            },
            
            dispose: () => {
                this.mp3Audio.pause();
                this.mp3Audio.src = '';
                if (isObjectURL) {
                    URL.revokeObjectURL(url);
                }
            }
        };
    }
    
    /**
     * Start extracting audio from the MP4 source
     * @param {MP4Source} source - The MP4 source containing audio
     */
    startAudioExtraction(source) {
        console.log(`[CVideoAudioOnly.startAudioExtraction] Starting...`);
        this.demuxer = new MP4Demuxer(source);
        console.log(`[CVideoAudioOnly.startAudioExtraction] MP4Demuxer created`);
        
        // Get audio configuration
        console.log(`[CVideoAudioOnly.startAudioExtraction] Calling demuxer.getAudioConfig()...`);
        this.demuxer.getAudioConfig().then(audioConfig => {
            console.log(`[CVideoAudioOnly.startAudioExtraction] getAudioConfig resolved with:`, audioConfig);
            if (!audioConfig) {
                console.warn(`[CVideoAudioOnly.startAudioExtraction] No audio track found in file`);
                if (this.errorCallback) {
                    this.errorCallback("No audio track found");
                }
                return;
            }
            
            console.log(`[CVideoAudioOnly.startAudioExtraction] Audio config:`, audioConfig);
            
            // Calculate frame count based on audio duration
            const duration = this.demuxer.source.duration || 0;
            console.log(`[CVideoAudioOnly.startAudioExtraction] Duration from source: ${duration} microseconds`);
            this.frames = Math.ceil(duration * this.originalFps / 1000000); // duration is in microseconds
            this.frames = Math.max(1, this.frames); // At least 1 frame
            
            console.log(`[CVideoAudioOnly.startAudioExtraction] Frames calculated: ${this.frames} (${this.originalFps} fps)`);
            
            // Apply video speed multiplier
            this.frames *= this.videoSpeed;
            console.log(`[CVideoAudioOnly.startAudioExtraction] After speed multiplier (${this.videoSpeed}x): ${this.frames} frames`);
            
            // Update global frame count
            Sit.videoFrames = this.frames;
            Sit.fps = this.originalFps;
            updateSitFrames();
            
            // Initialize audio handler
            console.log(`[CVideoAudioOnly.startAudioExtraction] Initializing audio handler...`);
            this.initializeAudioHandler(this);
            if (this.audioHandler) {
                this.audioHandler.originalFps = this.originalFps;
            }
            
            // Dispatch videoLoaded event for view setup
            console.log(`[CVideoAudioOnly.startAudioExtraction] Dispatching videoLoaded event...`);
            EventManager.dispatchEvent("videoLoaded", {
                videoData: this, 
                width: this.videoWidth, 
                height: this.videoHeight
            });
            
            // Initialize audio and start extraction
            console.log(`[CVideoAudioOnly.startAudioExtraction] Calling audioHandler.initializeAudio()...`);
            this.audioHandler.initializeAudio(this.demuxer).then(() => {
                console.log(`[CVideoAudioOnly.startAudioExtraction] Audio handler initialized for audio-only playback`);
                
                // Set expected audio sample count
                if (this.demuxer.audioTrack) {
                    console.log(`[CVideoAudioOnly.startAudioExtraction] Setting expected audio samples: ${this.demuxer.audioTrack.nb_samples}`);
                    this.audioHandler.setExpectedAudioSamples(this.demuxer.audioTrack.nb_samples);
                }
                
                // Start extraction with audio-only callback
                console.log(`[CVideoAudioOnly.startAudioExtraction] Starting demuxer extraction...`);
                this.demuxer.start(
                    null, // No video chunks
                    (track_id, samples) => {
                        // Audio samples callback
                        console.log(`[CVideoAudioOnly.startAudioExtraction] Audio samples callback: ${samples.length} samples`);
                        if (this.audioHandler) {
                            this.audioHandler.decodeAudioSamples(samples, this.demuxer);
                        }
                    },
                    () => {
                        // Extraction complete
                        console.log(`[CVideoAudioOnly.startAudioExtraction] Extraction complete callback fired`);
                        this.waitForAudioDecoding();
                    }
                );
            }).catch(error => {
                console.error(`[CVideoAudioOnly.startAudioExtraction] Error initializing audio:`, error);
                if (this.errorCallback) {
                    this.errorCallback(error);
                }
            });
        }).catch(error => {
            console.error(`[CVideoAudioOnly.startAudioExtraction] Error getting audio config:`, error);
            if (this.errorCallback) {
                this.errorCallback(error);
            }
        });
    }
    
    /**
     * Wait for audio decoding to complete before marking as loaded
     */
    waitForAudioDecoding() {
        console.log(`[CVideoAudioOnly.waitForAudioDecoding] Checking decoding status...`);
        if (this.audioHandler && this.audioHandler.checkDecodingComplete()) {
            console.log(`[CVideoAudioOnly.waitForAudioDecoding] Audio decoding complete! Marking as loaded...`);
            this.loaded = true;
            if (this.loadedCallback) {
                console.log(`[CVideoAudioOnly.waitForAudioDecoding] Calling loadedCallback...`);
                this.loadedCallback(this);
            }
            console.log(`[CVideoAudioOnly.waitForAudioDecoding] Complete!`);
        } else if (this.audioHandler && this.audioHandler.expectedAudioSamples > 0) {
            // Audio still decoding, wait a bit
            const decoded = this.audioHandler.decodedAudioData ? this.audioHandler.decodedAudioData.length : 0;
            console.log(`[CVideoAudioOnly.waitForAudioDecoding] Still decoding... expected=${this.audioHandler.expectedAudioSamples}, decoded=${decoded}, waiting 100ms...`);
            this._audioWaitTimeout = setTimeout(() => {
                this.waitForAudioDecoding();
            }, 100);
        } else {
            // No audio or no samples expected, just mark as loaded
            console.log(`[CVideoAudioOnly.waitForAudioDecoding] No audio samples expected, marking as loaded...`);
            this.loaded = true;
            if (this.loadedCallback) {
                console.log(`[CVideoAudioOnly.waitForAudioDecoding] Calling loadedCallback...`);
                this.loadedCallback(this);
            }
            console.log(`[CVideoAudioOnly.waitForAudioDecoding] Complete!`);
        }
    }
    
    /**
     * Create a black frame canvas
     * @returns {HTMLCanvasElement} A black canvas
     */
    createBlackFrame() {
        if (!this.blackFrame) {
            this.blackFrame = document.createElement('canvas');
            this.blackFrame.width = this.videoWidth;
            this.blackFrame.height = this.videoHeight;
            const ctx = this.blackFrame.getContext('2d');
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, this.videoWidth, this.videoHeight);
        }
        return this.blackFrame;
    }
    
    /**
     * Get the image for a specific frame
     * Always returns a black frame for audio-only files
     * @param {number} frame - Frame number (ignored)
     * @returns {HTMLCanvasElement} A black canvas
     */
    getImage(frame) {
        return this.createBlackFrame();
    }
    
    /**
     * Update method - handles audio playback state
     */
    update() {
        // Audio playback is handled by the audio handler
        // No video-specific updates needed
    }
    
    /**
     * Clean up resources
     */
    dispose() {
        // Clear the black frame
        if (this.blackFrame) {
            this.blackFrame = null;
        }
        
        // Clean up MP3 audio if it exists
        if (this.mp3Audio) {
            this.mp3Audio.pause();
            this.mp3Audio.src = '';
            if (this.isObjectURL && this.mp3URL) {
                URL.revokeObjectURL(this.mp3URL);
            }
            this.mp3Audio = null;
            this.mp3URL = null;
        }
        
        // Stop the demuxer if it exists
        if (this.demuxer) {
            if (this.demuxer.source && this.demuxer.source.file) {
                try {
                    this.demuxer.source.file.stop();
                } catch (e) {
                    // Ignore errors during cleanup
                }
            }
            this.demuxer = null;
        }
        
        // Clear callbacks
        this.loadedCallback = null;
        this.errorCallback = null;
        
        // Call parent dispose (handles audio cleanup)
        super.dispose();
    }
}