const en = {
    menus: {
        main: {
            title: "Sitrec",
            tooltip: "Selecting legacy sitches and tools\nSome legacy sitches have controls here by default",
            noTooltip: "No tooltip defined for this sitch",
            legacySitches: {
                label: "Legacy Sitches",
                tooltip: "The Legacy Sitches are older built-in (hard-coded) sitches are predefined situations that often have unique code and assets. Select one to load it.",
            },
            legacyTools: {
                label: "Legacy Tools",
                tooltip: "Tools are special sitches that are used for custom setups like Starlink or with user tracks, and for testing, debugging, or other special purposes. Select one to load it.",
            },
            selectPlaceholder: "-Select-",
        },
        file: {
            title: "File",
            tooltip: "File operations like saving,loading, and exporting",
        },
        view: {
            title: "View",
            tooltip: "Miscellaneous view controls\nLike all menus, this menu can be dragged off the menu bar to make it a floating menu",
        },
        video: {
            title: "Video",
            tooltip: "Video adjustment, effects, and analysis",
        },
        time: {
            title: "Time",
            tooltip: "Time and frame controls\nDragging one time slider past the end will affect the above slider\nNote that the time sliders are UTC",
        },
        objects: {
            title: "Objects",
            tooltip: "3D Objects and their properties\nEach folder is one object. The traverseObject is the object that traverses the lines of sight - i.e. the UAP we are interested in",
            addObject: {
                label: "Add Object",
                tooltip: "Create a new object at specified coordinates",
                prompt: "Enter: [Name] Lat Lon [Alt]\nExamples:\n  MyObject 37.7749 -122.4194 100m\n  37.7749, -122.4194\n  Landmark 37.7749 -122.4194",
                invalidInput: "Invalid input. Please enter coordinates in the format:\n[Name] Lat Lon [Alt]",
            },
        },
        satellites: {
            title: "Satellites",
            tooltip: "Loading and controlling satellites\nThe satellites.\nStarlink, ISS, etc. Controlls for Horizon flares and other satellite effects",
        },
        terrain: {
            title: "Terrain",
            tooltip: "Terrain controls\nThe terrain is the 3D model of the ground. The 'Map' is the 2D image of the ground. The 'Elevation' is the height of the ground above sea level",
        },
        physics: {
            title: "Physics",
            tooltip: "Physics controls\nThe physics of the situation, like wind speed and the physics of the traverse object",
        },
        camera: {
            title: "Camera",
            tooltip: "Camera controls for the look view camera\nThe look view defaults to the lower right window, and is intended to match the video.",
        },
        target: {
            title: "Target",
            tooltip: "Target controls\nPosition and properties of the optional target object",
        },
        traverse: {
            title: "Traverse",
            tooltip: "Traverse controls\nThe traverse object is the object that traverses the lines of sight - i.e. the UAP we are interested in\nThis menu defined how the traverse object moves and behaves",
        },
        showHide: {
            title: "Show/Hide",
            tooltip: "Showing or hiding views, object and other elements",
            views: {
                title: "Views",
                tooltip: "Show or hide views (windows) like the look view, the video, the main view, as well as overlays like the MQ9UI",
            },
            graphs: {
                title: "Graphs",
                tooltip: "Show or hide various graphs",
            },
        },
        effects: {
            title: "Effects",
            tooltip: "Special effects like blur, pixelation, and color adjustments that are applied to the final image in the look view",
        },
        lighting: {
            title: "Lighting",
            tooltip: "The lighting of the scene, like the sun and the ambient light",
        },
        contents: {
            title: "Contents",
            tooltip: "The contents of the scene, mostly used for tracks",
        },
        help: {
            title: "Help",
            tooltip: "Links to the documentation and other help resources",
            documentation: {
                title: "Documentation",
                localTooltip: "Links to the documentation (local)",
                githubTooltip: "Links to the documentation on Github",
                githubLinkLabel: "{{name}} (Github)",
                about: "About Sitrec",
                whatsNew: "What's New",
                uiBasics: "User Interface Basics",
                savingLoading: "Saving and Loading Sitches",
                customSitch: "How to set up a sitch",
                tracks: "Tracks and Data Sources",
                gis: "GIS and Mapping",
                starlink: "How to Investigate Starlink Flares",
                customModels: "Objects and 3D Models (Planes)",
                cameraModes: "Camera Modes (Normal & Satellite)",
                thirdPartyNotices: "Third-Party Notices",
                thirdPartyNoticesTooltip: "Open-source license attributions for bundled third-party software",
                downloadBridge: "Download MCP Bridge",
                downloadBridgeTooltip: "Download the SitrecBridge MCP server + Chrome extension (zero dependencies, just needs Node.js)",
            },
            externalLinks: {
                title: "External Links",
                tooltip: "External help links",
            },
            exportDebugLog: {
                label: "Export Debug Log",
                tooltip: "Download all console output (log, warn, error) as a text file for debugging",
            },
        },
        debug: {
            title: "Debug",
            tooltip: "Debug tools and monitoring\nGPU memory usage, performance metrics, and other debugging information",
        },
    },
    file: {
        newSitch: {
            label: "New Sitch",
            tooltip: "Create a new sitch (will reload this page, resetting everything)",
        },
        savingDisabled: "Saving Disabled (click to log in)",
        importFile: {
            label: "Import File",
            tooltip: "Import a file (or files) from your local system. Same as dragging and dropping a file into the browser window",
        },
        server: {
            open: "Open",
            save: {
                label: "Save",
                tooltip: "Save the current sitch to the server",
            },
            saveAs: {
                label: "Save As",
                tooltip: "Save the current sitch to the server with a new name",
            },
            versions: {
                label: "Versions",
                tooltip: "Load a specific version of the currently selected sitch",
            },
            browseFeatured: "Browse featured sitches",
            browseAll: "Browse all your saved sitches in a searchable, sortable list",
        },
        local: {
            title: "Local",
            titleWithFolder: "Local: {{name}}",
            titleReconnect: "Local: {{name}} (reconnect)",
            status: "Status",
            noFileSelected: "No local file selected",
            noFolderSelected: "No folder selected",
            currentFile: "Current file: {{name}}",
            statusDesktop: "Current local desktop file/save state",
            statusFolder: "Current local folder/save state",
            stateReady: "Ready",
            stateReconnect: "Needs reconnect",
            stateNoFolder: "No folder",
            statusLine: "{{state}} | Folder: {{folder}} | Target: {{target}}",
            saveLocal: {
                label: "Save Local",
                tooltipDesktop: "Save to the current local file, or prompt for a filename if needed",
                tooltipFolder: "Save into the working folder (or prompts for a location if none is set)",
                tooltipSaveBack: "Save back to {{name}}",
                tooltipSaveBackInFolder: "Save back to {{name}} in {{folder}}",
                tooltipSaveInto: "Save into {{folder}} (prompts for sitch name)",
                tooltipPrompt: "Save a local sitch file (prompts for name/location)",
                tooltipSaveTo: "Save the current sitch to a local file",
            },
            saveLocalAs: {
                label: "Save Local As...",
                tooltipDesktop: "Save a local sitch file to a new path",
                tooltipFolder: "Save a local sitch file, choosing the location",
                tooltipInFolder: "Save with a new filename in the current working folder",
                tooltipNewPath: "Save the current sitch to a new local file path",
            },
            openLocal: {
                label: "Open Local Sitch",
                labelShort: "Open Local...",
                tooltipDesktop: "Open a local sitch file from disk",
                tooltipFolder: "Open a sitch file from the current working folder",
                tooltipCurrent: "Open a different local sitch file (current: {{name}})",
                tooltipFromFolder: "Open a sitch file from {{folder}}",
            },
            selectFolder: {
                label: "Select Local Sitch Folder",
                tooltip: "Select a working folder for local save/load operations",
            },
            reconnectFolder: {
                label: "Reconnect Folder",
                tooltip: "Re-grant access to the previously used working folder",
            },
        },
        debug: {
            recalculateAll: "debug recalculate all",
            dumpNodes: "debug dump nodes",
            dumpNodesBackwards: "debug dump nodes backwards",
            dumpRoots: "debug dump Root notes",
        },
    },
    videoExport: {
        notAvailable: "Video Export Not Available",
        folder: {
            title: "Video Render & Export",
            tooltip: "Options for rendering and exporting video files from Sitrec views or full viewport",
        },
        renderView: {
            label: "Render Video View",
            tooltip: "Select which view to export as video",
        },
        renderSingleVideo: {
            label: "Render Single View Video",
            tooltip: "Export the selected view as a video file with all frames",
        },
        videoFormat: {
            label: "Video Format",
            tooltip: "Select the output video format",
        },
        renderViewport: {
            label: "Render Viewport Video",
            tooltip: "Export the entire viewport as a video file with all frames",
        },
        renderFullscreen: {
            label: "Render Fullscreen Video",
            tooltip: "Export the entire viewport in fullscreen mode as a video file with all frames",
        },
        recordWindow: {
            label: "Record Browser Window",
            tooltip: "Record the entire browser window (including menus and UI) as a video with locked framerate",
        },
        retinaExport: {
            label: "Use HD/Retina Export",
            tooltip: "Export at retina/HiDPI resolution (2x on most displays)",
        },
        includeAudio: {
            label: "Include Audio",
            tooltip: "Include audio track from source video if available",
        },
        waitForLoading: {
            label: "Wait for background loading",
            tooltip: "When enabled, rendering waits for terrain/building/background loads before capturing each frame",
        },
        exportFrame: {
            label: "Export Video Frame",
            tooltip: "Export the current video frame as displayed (with effects) as a PNG file",
        },
    },
    jet: {
        frames: {
            time: {
                label: "Time (sec)",
                tooltip: "Current time from the start of the video in seconds (frame / fps)",
            },
            frame: {
                label: "Frame in Video",
                tooltip: "Current frame number in the video",
            },
            paused: {
                label: "Paused",
                tooltip: "Toggle the paused state (also spacebar)",
            },
        },
        controls: {
            pingPong: "A-B Ping-Pong",
            podPitchPhysical: "Pod (Ball) Pitch",
            podRollPhysical: "Pod Head Roll",
            deroFromGlare: "Derotation = Glare Angle",
            jetPitch: "Jet Pitch",
            lookFov: "Narrow FOV",
            elevation: "elevation",
            glareStartAngle: "Glare Start Angle",
            initialGlareRotation: "Glare Initial Rotation",
            scaleJetPitch: "Scale Jet Pitch with Roll",
            horizonMethod: "Horizon Method",
            horizonMethodOptions: {
                humanHorizon: "Human Horizon",
                horizonAngle: "Horizon Angle",
            },
            videoSpeed: "Video Speed",
            podWireframe: "[B]ack Pod Wireframe",
            showVideo: "[V]ideo",
            showGraph: "[G]raph",
            showKeyboardShortcuts: "[K]eyboard Shortcuts",
            showPodHead: "[P]od Head Roll",
            showPodsEye: "Pod's [E]ye views w' dero",
            showLookCam: "[N]AR view w' dero",
            showCueData: "[C]ue Data",
            showGlareGraph: "Sh[o]w Glare Graph",
            showAzGraph: "Show A[Z] Graph",
            declutter: "[D]eclutter]",
            jetOffset: "Jet Y offset",
            tas: "TAS True Airspeed",
            integrate: "Integration Steps",
        },
    },
    motionAnalysis: {
        menu: {
            title: "Motion Analysis",
            analyzeMotion: {
                label: "Analyze Motion",
                tooltip: "Toggle real-time motion analysis overlay on video",
            },
            createTrack: {
                label: "Create Track from Motion",
                tooltip: "Analyze all frames and create a ground track from motion vectors",
            },
            alignWithFlow: {
                label: "Align with Flow",
                tooltip: "Rotate image so motion direction is horizontal",
            },
            panorama: {
                title: "Panorama",
                exportImage: {
                    label: "Export Motion Panorama",
                    tooltip: "Create a panorama image from video frames using motion tracking offsets",
                },
                exportVideo: {
                    label: "Export Pano Video",
                    tooltip: "Create a 4K video showing the panorama with video frame overlay",
                },
                stabilize: {
                    label: "Stabilize Video",
                    disableLabel: "Disable Stabilization",
                    tooltip: "Stabilize video using global motion analysis (removes camera shake)",
                },
                panoFrameStep: {
                    label: "Pano Frame Step",
                    tooltip: "How many frames to step between each panorama frame (1 = every frame)",
                },
                crop: {
                    label: "Panorama Crop",
                    tooltip: "Pixels to crop from each edge of video frames",
                },
                useMask: {
                    label: "Use Mask in Pano",
                    tooltip: "Apply motion tracking mask as transparency when rendering panorama",
                },
                analyzeWithEffects: {
                    label: "Analyze With Effects",
                    tooltip: "Apply video adjustments (contrast, etc.) to frames used for motion analysis",
                },
                exportWithEffects: {
                    label: "Export With Effects",
                    tooltip: "Apply video adjustments to panorama exports",
                },
                removeOuterBlack: {
                    label: "Remove Outer Black",
                    tooltip: "Make black pixels at the edges of each row transparent",
                },
            },
            trackingParameters: {
                title: "Tracking Parameters",
                technique: {
                    label: "Technique",
                    tooltip: "Motion estimation algorithm",
                },
                frameSkip: {
                    label: "Frame Skip",
                    tooltip: "Frames between comparisons (higher = detect slower motion)",
                },
                trackletLength: {
                    label: "Tracklet Length",
                    tooltip: "Number of frames in tracklet (longer = stricter coherence)",
                },
                blurSize: {
                    label: "Blur Size",
                    tooltip: "Gaussian blur for macro features (odd numbers)",
                },
                minMotion: {
                    label: "Min Motion",
                    tooltip: "Minimum motion magnitude (pixels/frame)",
                },
                maxMotion: {
                    label: "Max Motion",
                    tooltip: "Maximum motion magnitude",
                },
                smoothing: {
                    label: "Smoothing",
                    tooltip: "Direction smoothing (higher = more smoothing)",
                },
                minVectorCount: {
                    label: "Min Vector Count",
                    tooltip: "Minimum number of motion vectors for a valid frame",
                },
                minConfidence: {
                    label: "Min Confidence",
                    tooltip: "Minimum consensus confidence for a valid frame",
                },
                maxFeatures: {
                    label: "Max Features",
                    tooltip: "Maximum tracked features",
                },
                minDistance: {
                    label: "Min Distance",
                    tooltip: "Minimum distance between features",
                },
                qualityLevel: {
                    label: "Quality Level",
                    tooltip: "Feature detection quality threshold",
                },
                maxTrackError: {
                    label: "Max Track Error",
                    tooltip: "Maximum tracking error threshold",
                },
                minQuality: {
                    label: "Min Quality",
                    tooltip: "Minimum quality to display arrow",
                },
                staticThreshold: {
                    label: "Static Threshold",
                    tooltip: "Motion below this is considered static (HUD)",
                },
            },
        },
        status: {
            loadingOpenCv: "Loading OpenCV...",
            stopAnalysis: "Stop Analysis",
            analyzingPercent: "Analyzing... {{pct}}%",
            creatingTrack: "Creating track...",
            buildingPanorama: "Building panorama...",
            buildingPanoramaPercent: "Building panorama... {{pct}}%",
            loadingFrame: "Loading frame {{frame}}... ({{current}}/{{total}})",
            loadingFrameSkipped: "Loading frame {{frame}}... ({{current}}/{{total}}) ({{skipped}} skipped)",
            renderingPercent: "Rendering... {{pct}}%",
            panoPercent: "Pano... {{pct}}%",
            renderingVideo: "Rendering video...",
            videoPercent: "Video... {{pct}}%",
            saving: "Saving...",
            buildingStabilization: "Building stabilization...",
            exportProgressTitle: "Exporting pano video...",
        },
        errors: {
            noVideoView: "No video view found.",
            noVideoData: "No video data found.",
            failedToLoadOpenCv: "Failed to load OpenCV: {{message}}",
            noOriginTrack: "No origin track found. Need a target or camera track to determine start position.",
            videoEncodingUnsupported: "Video encoding not supported in this browser",
            exportFailed: "Video export failed: {{reason}}",
            panoVideoExportFailed: "Pano video export failed: {{message}}",
        },
    },
    textExtraction: {
        menu: {
            title: "[BETA] Text Extraction",
            enable: {
                label: "Enable Text Extraction",
                disableLabel: "Disable Text Extraction",
                tooltip: "Toggle text extraction mode on video",
            },
            addRegion: {
                label: "Add Region",
                drawingLabel: "Click and drag on video...",
                tooltip: "Click and drag on video to define a text extraction region",
            },
            removeRegion: {
                label: "Remove Selected Region",
                tooltip: "Remove the currently selected region",
            },
            clearRegions: {
                label: "Clear All Regions",
                tooltip: "Remove all text extraction regions",
            },
            startExtract: {
                label: "Start Extract",
                stopLabel: "Stop Extraction",
                tooltip: "Run OCR on all regions from current frame to end",
            },
            fixedWidthFont: {
                label: "Fixed Width Font",
                tooltip: "Enable character-by-character detection for fixed-width fonts (better for FLIR/sensor overlays)",
            },
            numChars: {
                label: "Num Characters",
                tooltip: "Number of characters in the selected region (divides region evenly)",
            },
            learnTemplates: {
                label: "Learn Templates",
                activeLabel: "Click characters to learn...",
                tooltip: "Click character cells to teach their values (for template matching)",
            },
            clearTemplates: {
                label: "Clear Templates",
                tooltip: "Remove all learned character templates",
            },
            useTemplates: {
                label: "Use Templates",
                tooltip: "Use learned templates for matching (faster & more accurate when trained)",
            },
        },
        prompts: {
            learnCharacter: "Enter character for cell {{index}}:",
        },
        errors: {
            failedToLoadTesseract: "Failed to load Tesseract.js. Make sure it's installed: npm install tesseract.js",
            noVideoView: "Text extraction requires a video view",
        },
    },
};

export default en;