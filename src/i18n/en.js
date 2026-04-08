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
    tracking: {
        enable: {
            label: "Enable Auto Tracking",
            disableLabel: "Disable Auto Tracking",
            tooltip: "Toggle display of the auto tracking cursor on video",
        },
        start: {
            label: "Start Auto Tracking",
            stopLabel: "Stop Auto Tracking",
            tooltip: "Automatically track the object inside the cursor as video plays",
        },
        clearFromHere: {
            label: "Clear from Here",
            tooltip: "Clear all tracked positions from current frame to end",
        },
        clearTrack: {
            label: "Clear Track",
            tooltip: "Clear all auto-tracked positions and start fresh",
        },
        stabilize: {
            label: "Stabilize",
            tooltip: "Apply auto-tracked positions to stabilize the video",
        },
        stabilizeToggle: {
            enableLabel: "Enable Stabilization",
            disableLabel: "Disable Stabilization",
            tooltip: "Toggle video stabilization on/off",
        },
        stabilizeCenters: {
            label: "Stabilize Centers",
            tooltip: "When checked, the stabilized point is fixed at the center of the view. When unchecked, it stays at its initial position.",
        },
        renderStabilized: {
            label: "Render Stabilized Video",
            tooltip: "Export stabilized video at original size (tracked point stays fixed, edges may show black)",
        },
        renderStabilizedExpanded: {
            label: "Render Stabilized Expanded",
            tooltip: "Export stabilized video with expanded canvas so no pixels are lost",
        },
        trackRadius: {
            label: "Track Radius",
            tooltip: "Size of the template to match (object size)",
        },
        searchRadius: {
            label: "Search Radius",
            tooltip: "How far from previous position to search (increase for fast motion)",
        },
        trackingMethod: {
            label: "Tracking Method",
            tooltip: "Template Match (OpenCV) or Optical Flow (jsfeat Lucas-Kanade)",
        },
        centerOnBright: {
            label: "Center on Bright",
            tooltip: "Track centroid of bright pixels (better for stars/point lights)",
        },
        centerOnDark: {
            label: "Center on Dark",
            tooltip: "Track centroid of dark pixels",
        },
        brightnessThreshold: {
            label: "Brightness Threshold",
            tooltip: "Brightness threshold (0-255). Used in Center on Bright/Dark modes",
        },
        status: {
            loadingJsfeat: "Loading jsfeat...",
            loadingOpenCv: "Loading OpenCV...",
            sam2Connecting: "SAM2: Connecting...",
            sam2Uploading: "SAM2: Uploading...",
        },
    },
    trackManager: {
        removeTrack: "Remove Track",
        createSpline: "Create Spline",
        editTrack: "Edit Track",
        constantSpeed: "Constant Speed",
        extrapolateTrack: "Extrapolate Track",
        curveType: "Curve Type",
        altLockAGL: "Alt Lock AGL",
        deleteTrack: "Delete Track",
    },
    gpuMonitor: {
        enabled: "Monitor Enabled",
        total: "Total Memory",
        geometries: "Geometries",
        textures: "Textures",
        peak: "Peak Memory",
        average: "Average Memory",
        reset: "Reset History",
    },
    situationSetup: {
        mainFov: {
            label: "Main FOV",
            tooltip: "Field of View of the main view's camera (VERTICAL)",
        },
        lookCameraFov: "Look Camera FOV",
        azimuth: "azimuth",
        jetPitch: "Jet Pitch",
    },
    featureManager: {
        labelText: "Label Text",
        latitude: "Latitude",
        longitude: "Longitude",
        altitude: "Altitude (m)",
        arrowLength: "Arrow Length",
        arrowColor: "Arrow Color",
        textColor: "Text Color",
        deleteFeature: "Delete Feature",
    },
    panoramaExport: {
        exportLookPanorama: {
            label: "Export Look Panorama",
            tooltip: "Create a panorama image from lookView across all frames based on background position",
        },
    },
    dateTime: {
        liveMode: {
            label: "Live Mode",
            tooltip: "If Live Mode is on, then the playback will always be synced to the current time.\nPausing or scrubbing the time will disable live mode",
        },
        startTime: {
            tooltip: "The START time of first frame of the video, in UTC format",
        },
        currentTime: {
            tooltip: "The CURRENT time of the video. This is what the below date and time refer to",
        },
        year: "Year of the current frame",
        month: "Month (1-12)",
        day: "Day of month",
        hour: "Hour (0-23)",
        minute: "Minute (0-59)",
        second: "Second (0-59)",
        millisecond: "Millisecond (0-999)",
        useTimeZone: {
            label: "Use Time Zone in UI",
            tooltip: "Use the time zone in the UI above\nThis will change the date and time to be in the selected time zone, rather than UTC.\nThis is useful for displaying the date and time in a specific time zone, such as the local time zone of the video or the location.",
        },
        timeZone: {
            label: "Time Zone",
            tooltip: "The time zone to display the date and time in in the look view\nAlso in the UI if the 'Use Time Zone in UI' is checked",
        },
        simSpeed: {
            label: "Simulation Speed",
            tooltip: "The speed of the simulation, 1 is real time, 2 is twice as fast, etc\nThis does not change the video replay speed, just the time calculations for the simulation.",
        },
        sitchFrames: {
            label: "Sitch Frames",
            tooltip: "The number of frames in the sitch. If there's a video then this will be the number of frames in the video, but you can change it if you want to add more frames to the sitch, or if you want to use the sitch without a video",
        },
        sitchDuration: {
            label: "Sitch Duration",
            tooltip: "Duration of the sitch in HH:MM:SS.sss format",
        },
        aFrame: {
            label: "A Frame",
            tooltip: "limited the playback to between A and B, displayed as green and red on the frame slider",
        },
        bFrame: {
            label: "B Frame",
            tooltip: "limited the playback to between A and B, displayed as green and red on the frame slider",
        },
        videoFps: {
            label: "Video FPS",
            tooltip: "The frames per second of the video. This will change the playback speed of the video (e.g. 30 fps, 25 fps, etc). It will also change the duration of the sitch (in secods) as it changes how long an individual frame is\n This is derived from the video were possible, but you can change it if you want to speed up or slow down the video",
        },
        syncTimeTo: {
            label: "Sync Time to",
            tooltip: "Sync the video start time to the original start time, the current time, or the start time of a track track (if loaded)",
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
    custom: {
        balloons: {
            count: { label: "Count", tooltip: "Number of nearby stations to import" },
            source: { label: "Source", tooltip: "uwyo = University of Wyoming (needs PHP proxy)\nigra2 = NOAA NCEI archive (direct download)" },
            getNearby: { label: "Get Nearby Weather Balloons", tooltip: "Import the N closest weather balloon soundings to the current camera position.\nUses the most recent launch before the sitch start time + 1 hour." },
            importSounding: { label: "Import Sounding...", tooltip: "Manual station picker: choose station, date, source, and import a specific sounding." },
        },
        showHide: {
            keyboardShortcuts: { label: "[K]eyboard Shortcuts", tooltip: "Show or hide the keyboard shortcuts overlay" },
            toggleExtendToGround: { label: "Toggle ALL [E]xtend To Ground", tooltip: "Toggle 'Extend to Ground' for all tracks\nWill set all off if any are on\nWill set all on if none are on" },
            showAllTracksInLook: { label: "Show All Tracks in Look View", tooltip: "Display all aircraft tracks in the look/camera view" },
            showCompassElevation: { label: "Show Compass Elevation", tooltip: "Show compass elevation (angle above the local ground plane) in addition to bearing (azimuth)" },
            filterTracks: { label: "Filter Tracks", tooltip: "Show/hide tracks based on altitude, direction, or frustum intersection" },
            removeAllTracks: { label: "Remove All Tracks", tooltip: "Remove all tracks from the scene\nThis will not remove the objects, just the tracks\nYou can add them back later by dragging and dropping the files again" },
        },
        objects: {
            globalScale: { label: "Global Scale", tooltip: "Scale factor applied to all 3D objects in the scene - useful for finding things. Set back to 1 for real size" },
        },
        admin: {
            dashboard: { label: "Admin Dashboard", tooltip: "Open the admin dashboard" },
            validateAllSitches: { label: "Validate All Sitches", tooltip: "Load all saved sitches with local terrain to check for errors" },
            testUserID: { label: "Test User ID", tooltip: "Operate as this user ID (0 = disabled, must be > 1)" },
            addMissingScreenshots: { label: "Add Missing Screenshots", tooltip: "Load each sitch that has no screenshot, render it, and upload a screenshot" },
            feature: { label: "Feature", tooltip: "Toggle Featured status for the currently loaded sitch" },
        },
        viewPreset: { label: "View Preset", tooltip: "Switch between different view presets\nSide-by-side, Top and Bottom, etc." },
        subSitches: {
            folder: { tooltip: "Manage multiple camera/view configurations within this sitch" },
            updateCurrent: { label: "Update Current Sub", tooltip: "Update the currently selected Sub Sitch with the current view settings" },
            updateAndAddNew: { label: "Update Current and Add New Sub", tooltip: "Update current Sub Sitch, then duplicate it into a new Sub Sitch" },
            discardAndAddNew: { label: "Discard Changes and Add New", tooltip: "Discard changes to current Sub Sitch, and invoke a new Sub Sitch from current state" },
            renameCurrent: { label: "Rename Current Sub", tooltip: "Rename the currently selected Sub Sitch" },
            deleteCurrent: { label: "Delete Current Sub", tooltip: "Delete the currently selected Sub Sitch" },
            syncSaveDetails: { label: "Sync Sub Save Details", tooltip: "Remove from current sub any nodes not enabled in Sub Saving Details" },
        },
        contextMenu: {
            setCameraAbove: "Set Camera Above",
            setCameraOnGround: "Set Camera on Ground",
            setTargetAbove: "Set Target Above",
            setTargetOnGround: "Set Target on Ground",
            dropPin: "Drop Pin / Add Feature",
            createTrackWithObject: "Create Track with Object",
            createTrackNoObject: "Create Track (No Object)",
            addBuilding: "Add Building",
            addClouds: "Add Clouds",
            addGroundOverlay: "Add Ground Overlay",
            centerTerrain: "Center Terrain square here",
            googleMapsHere: "Google Maps Here",
            googleEarthHere: "Google Earth Here",
            removeClosestPoint: "Remove Closest Point",
            exitEditMode: "Exit Edit Mode",
        },
    },
};

export default en;