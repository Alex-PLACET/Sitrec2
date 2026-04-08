const fr = {
    menus: {
        main: {
            title: "Sitrec",
            tooltip: "Sélection des sitches et outils hérités\nCertains sitches hérités ont ici leurs contrôles par défaut",
            noTooltip: "Aucune info-bulle définie pour ce sitch",
            legacySitches: {
                label: "Sitches hérités",
                tooltip: "Les sitches hérités sont d'anciens sitches intégrés (codés en dur), c'est-à-dire des situations prédéfinies qui ont souvent un code et des ressources spécifiques. Sélectionnez-en un pour le charger.",
            },
            legacyTools: {
                label: "Outils hérités",
                tooltip: "Les outils sont des sitches spéciaux utilisés pour les configurations personnalisées comme Starlink ou les pistes utilisateur, ainsi que pour les tests, le débogage et d'autres usages spéciaux. Sélectionnez-en un pour le charger.",
            },
            selectPlaceholder: "-Sélectionner-",
        },
        file: {
            title: "Fichier",
            tooltip: "Opérations de fichier comme enregistrer, charger et exporter",
        },
        view: {
            title: "Vue",
            tooltip: "Commandes diverses d'affichage\nComme tous les menus, celui-ci peut être détaché de la barre pour devenir une fenêtre flottante",
        },
        video: {
            title: "Vidéo",
            tooltip: "Réglages, effets et analyse vidéo",
        },
        time: {
            title: "Temps",
            tooltip: "Commandes de temps et d'image\nFaire glisser un curseur de temps au-delà de la fin affectera le curseur au-dessus\nNotez que les curseurs de temps sont en UTC",
        },
        objects: {
            title: "Objets",
            tooltip: "Objets 3D et leurs propriétés\nChaque dossier correspond à un objet. L'objet de traversée est l'objet qui parcourt les lignes de visée, c'est-à-dire l'UAP qui nous intéresse",
            addObject: {
                label: "Ajouter un objet",
                tooltip: "Créer un nouvel objet à des coordonnées spécifiées",
                prompt: "Saisir : [Nom] Lat Lon [Alt]\nExemples :\n  MonObjet 37.7749 -122.4194 100m\n  37.7749, -122.4194\n  Repère 37.7749 -122.4194",
                invalidInput: "Saisie invalide. Veuillez entrer des coordonnées au format :\n[Nom] Lat Lon [Alt]",
            },
        },
        satellites: {
            title: "Satellites",
            tooltip: "Chargement et contrôle des satellites\nLes satellites.\nStarlink, ISS, etc. Réglages pour les flares d'horizon et autres effets satellites",
        },
        terrain: {
            title: "Terrain",
            tooltip: "Commandes du terrain\nLe terrain est le modèle 3D du sol. La carte est l'image 2D du sol. L'élévation est la hauteur du sol au-dessus du niveau de la mer",
        },
        physics: {
            title: "Physique",
            tooltip: "Commandes physiques\nLa physique de la situation, comme la vitesse du vent et la physique de l'objet de traversée",
        },
        camera: {
            title: "Caméra",
            tooltip: "Commandes de la caméra de la vue look\nLa vue look est par défaut la fenêtre en bas à droite, et doit correspondre à la vidéo.",
        },
        target: {
            title: "Cible",
            tooltip: "Commandes de la cible\nPosition et propriétés de l'objet cible optionnel",
        },
        traverse: {
            title: "Traversée",
            tooltip: "Commandes de traversée\nL'objet de traversée est celui qui parcourt les lignes de visée, c'est-à-dire l'UAP qui nous intéresse\nCe menu définit comment l'objet de traversée se déplace et se comporte",
        },
        showHide: {
            title: "Afficher/Masquer",
            tooltip: "Affichage ou masquage des vues, objets et autres éléments",
            views: {
                title: "Vues",
                tooltip: "Afficher ou masquer les vues (fenêtres) comme la vue look, la vidéo, la vue principale, ainsi que les surcouches comme le MQ9UI",
            },
            graphs: {
                title: "Graphiques",
                tooltip: "Afficher ou masquer divers graphiques",
            },
        },
        effects: {
            title: "Effets",
            tooltip: "Effets spéciaux comme le flou, la pixelisation et les ajustements de couleur appliqués à l'image finale dans la vue look",
        },
        lighting: {
            title: "Éclairage",
            tooltip: "L'éclairage de la scène, comme le soleil et la lumière ambiante",
        },
        contents: {
            title: "Contenu",
            tooltip: "Le contenu de la scène, surtout utilisé pour les pistes",
        },
        help: {
            title: "Aide",
            tooltip: "Liens vers la documentation et d'autres ressources d'aide",
            documentation: {
                title: "Documentation",
                localTooltip: "Liens vers la documentation (locale)",
                githubTooltip: "Liens vers la documentation sur GitHub",
                githubLinkLabel: "{{name}} (GitHub)",
                about: "À propos de Sitrec",
                whatsNew: "Nouveautés",
                uiBasics: "Bases de l'interface utilisateur",
                savingLoading: "Enregistrer et charger des sitches",
                customSitch: "Comment configurer un sitch",
                tracks: "Pistes et sources de données",
                gis: "SIG et cartographie",
                starlink: "Comment analyser les flares Starlink",
                customModels: "Objets et modèles 3D (avions)",
                cameraModes: "Modes de caméra (normal et satellite)",
                thirdPartyNotices: "Mentions tierces",
                thirdPartyNoticesTooltip: "Attributions de licences open source pour les logiciels tiers inclus",
                downloadBridge: "Télécharger MCP Bridge",
                downloadBridgeTooltip: "Télécharger le serveur MCP SitrecBridge + l'extension Chrome (zéro dépendance, Node.js seulement)",
            },
            externalLinks: {
                title: "Liens externes",
                tooltip: "Liens d'aide externes",
            },
            exportDebugLog: {
                label: "Exporter le journal de débogage",
                tooltip: "Télécharger toute la sortie console (log, warn, error) sous forme de fichier texte pour le débogage",
            },
        },
        debug: {
            title: "Débogage",
            tooltip: "Outils de débogage et de surveillance\nUtilisation mémoire GPU, mesures de performance et autres informations de débogage",
        },
    },
    file: {
        newSitch: {
            label: "Nouveau sitch",
            tooltip: "Créer un nouveau sitch (rechargera cette page en réinitialisant tout)",
        },
        savingDisabled: "Sauvegarde désactivée (cliquez pour vous connecter)",
        importFile: {
            label: "Importer un fichier",
            tooltip: "Importer un ou plusieurs fichiers depuis votre système. Identique au glisser-déposer dans la fenêtre du navigateur",
        },
        server: {
            open: "Ouvrir",
            save: {
                label: "Enregistrer",
                tooltip: "Enregistrer le sitch actuel sur le serveur",
            },
            saveAs: {
                label: "Enregistrer sous",
                tooltip: "Enregistrer le sitch actuel sur le serveur sous un nouveau nom",
            },
            versions: {
                label: "Versions",
                tooltip: "Charger une version spécifique du sitch sélectionné",
            },
            browseFeatured: "Parcourir les sitches en vedette",
            browseAll: "Parcourir tous vos sitches enregistrés dans une liste consultable et triable",
        },
        local: {
            title: "Local",
            titleWithFolder: "Local : {{name}}",
            titleReconnect: "Local : {{name}} (reconnecter)",
            status: "État",
            noFileSelected: "Aucun fichier local sélectionné",
            noFolderSelected: "Aucun dossier sélectionné",
            currentFile: "Fichier actuel : {{name}}",
            statusDesktop: "État actuel du fichier/sauvegarde local",
            statusFolder: "État actuel du dossier/sauvegarde local",
            stateReady: "Prêt",
            stateReconnect: "Reconnexion nécessaire",
            stateNoFolder: "Aucun dossier",
            statusLine: "{{state}} | Dossier : {{folder}} | Cible : {{target}}",
            saveLocal: {
                label: "Enregistrer localement",
                tooltipDesktop: "Enregistrer dans le fichier local actuel, ou demander un nom de fichier si nécessaire",
                tooltipFolder: "Enregistrer dans le dossier de travail (ou demander un emplacement si aucun n'est défini)",
                tooltipSaveBack: "Enregistrer dans {{name}}",
                tooltipSaveBackInFolder: "Enregistrer dans {{name}} dans {{folder}}",
                tooltipSaveInto: "Enregistrer dans {{folder}} (demande le nom du sitch)",
                tooltipPrompt: "Enregistrer un fichier sitch local (demande le nom/emplacement)",
                tooltipSaveTo: "Enregistrer le sitch actuel dans un fichier local",
            },
            saveLocalAs: {
                label: "Enregistrer localement sous...",
                tooltipDesktop: "Enregistrer un fichier sitch local vers un nouveau chemin",
                tooltipFolder: "Enregistrer un fichier sitch local en choisissant l'emplacement",
                tooltipInFolder: "Enregistrer avec un nouveau nom dans le dossier de travail actuel",
                tooltipNewPath: "Enregistrer le sitch actuel dans un nouveau chemin local",
            },
            openLocal: {
                label: "Ouvrir un sitch local",
                labelShort: "Ouvrir local...",
                tooltipDesktop: "Ouvrir un fichier sitch local depuis le disque",
                tooltipFolder: "Ouvrir un fichier sitch depuis le dossier de travail actuel",
                tooltipCurrent: "Ouvrir un autre fichier sitch local (actuel : {{name}})",
                tooltipFromFolder: "Ouvrir un fichier sitch depuis {{folder}}",
            },
            selectFolder: {
                label: "Sélectionner le dossier de sitches locaux",
                tooltip: "Sélectionner un dossier de travail pour les opérations de sauvegarde/chargement locales",
            },
            reconnectFolder: {
                label: "Reconnecter le dossier",
                tooltip: "Redonner l'accès au dossier de travail précédemment utilisé",
            },
        },
        debug: {
            recalculateAll: "debug recalculer tout",
            dumpNodes: "debug lister les nœuds",
            dumpNodesBackwards: "debug lister les nœuds à l'envers",
            dumpRoots: "debug lister les nœuds racines",
        },
    },
    videoExport: {
        notAvailable: "Export vidéo non disponible",
        folder: {
            title: "Rendu et export vidéo",
            tooltip: "Options de rendu et d'exportation de fichiers vidéo depuis les vues Sitrec ou la fenêtre complète",
        },
        renderView: {
            label: "Vue de rendu vidéo",
            tooltip: "Sélectionner la vue à exporter en vidéo",
        },
        renderSingleVideo: {
            label: "Rendu vidéo vue unique",
            tooltip: "Exporter la vue sélectionnée en fichier vidéo avec tous les photogrammes",
        },
        videoFormat: {
            label: "Format vidéo",
            tooltip: "Sélectionner le format de sortie vidéo",
        },
        renderViewport: {
            label: "Rendu vidéo fenêtre",
            tooltip: "Exporter la fenêtre entière en fichier vidéo avec tous les photogrammes",
        },
        renderFullscreen: {
            label: "Rendu vidéo plein écran",
            tooltip: "Exporter la fenêtre entière en mode plein écran en fichier vidéo",
        },
        recordWindow: {
            label: "Enregistrer la fenêtre du navigateur",
            tooltip: "Enregistrer toute la fenêtre du navigateur (menus et interface inclus) en vidéo à cadence fixe",
        },
        retinaExport: {
            label: "Export HD/Retina",
            tooltip: "Exporter en résolution Retina/HiDPI (2x sur la plupart des écrans)",
        },
        includeAudio: {
            label: "Inclure l'audio",
            tooltip: "Inclure la piste audio de la vidéo source si disponible",
        },
        waitForLoading: {
            label: "Attendre le chargement en arrière-plan",
            tooltip: "Quand activé, le rendu attend les chargements de terrain/bâtiments/arrière-plan avant chaque image",
        },
        exportFrame: {
            label: "Exporter l'image vidéo",
            tooltip: "Exporter l'image vidéo actuelle telle qu'affichée (avec effets) en fichier PNG",
        },
    },
    jet: {
        frames: {
            time: {
                label: "Temps (sec)",
                tooltip: "Temps courant depuis le début de la vidéo en secondes (image / fps)",
            },
            frame: {
                label: "Image dans la vidéo",
                tooltip: "Numéro de l'image courante dans la vidéo",
            },
            paused: {
                label: "Pause",
                tooltip: "Basculer l'état de pause (également barre d'espace)",
            },
        },
        controls: {
            pingPong: "Ping-pong A-B",
            podPitchPhysical: "Tangage du pod (bille)",
            podRollPhysical: "Roulis de la tête du pod",
            deroFromGlare: "Dérotation = angle d'éclat",
            jetPitch: "Tangage de l'avion",
            lookFov: "Champ de vision étroit",
            elevation: "élévation",
            glareStartAngle: "Angle initial d'éclat",
            initialGlareRotation: "Rotation initiale d'éclat",
            scaleJetPitch: "Mettre à l'échelle le tangage avec le roulis",
            horizonMethod: "Méthode d'horizon",
            horizonMethodOptions: {
                humanHorizon: "Horizon humain",
                horizonAngle: "Angle d'horizon",
            },
            videoSpeed: "Vitesse vidéo",
            podWireframe: "Pod en fil de fer [B]ack",
            showVideo: "[V]idéo",
            showGraph: "[G]raphique",
            showKeyboardShortcuts: "Raccourcis [K]clavier",
            showPodHead: "Roulis de tête du [P]od",
            showPodsEye: "Vues de l'[E]il du pod avec dérotation",
            showLookCam: "Vue [N]AR avec dérotation",
            showCueData: "Données de [C]ible",
            showGlareGraph: "Afficher le graphique d'éclat [o]",
            showAzGraph: "Afficher le graphique A[Z]",
            declutter: "[D]ésencombrer",
            jetOffset: "Décalage Y de l'avion",
            tas: "TAS vitesse air vraie",
            integrate: "Étapes d'intégration",
        },
    },
    motionAnalysis: {
        menu: {
            title: "Analyse du mouvement",
            analyzeMotion: {
                label: "Analyser le mouvement",
                tooltip: "Activer l'analyse du mouvement en temps réel sur la vidéo",
            },
            createTrack: {
                label: "Créer une piste à partir du mouvement",
                tooltip: "Analyser toutes les images et créer une piste au sol à partir des vecteurs de mouvement",
            },
            alignWithFlow: {
                label: "Aligner avec le flux",
                tooltip: "Faire pivoter l'image pour que la direction du mouvement soit horizontale",
            },
            panorama: {
                title: "Panorama",
                exportImage: {
                    label: "Exporter le panorama de mouvement",
                    tooltip: "Créer une image panoramique à partir des images vidéo avec les décalages issus du suivi de mouvement",
                },
                exportVideo: {
                    label: "Exporter la vidéo pano",
                    tooltip: "Créer une vidéo 4K montrant le panorama avec la superposition de l'image vidéo",
                },
                stabilize: {
                    label: "Stabiliser la vidéo",
                    disableLabel: "Désactiver la stabilisation",
                    tooltip: "Stabiliser la vidéo avec l'analyse globale du mouvement (supprime les tremblements de caméra)",
                },
                panoFrameStep: {
                    label: "Pas d'image du pano",
                    tooltip: "Nombre d'images sautées entre chaque image du panorama (1 = chaque image)",
                },
                crop: {
                    label: "Rognage du panorama",
                    tooltip: "Pixels à rogner sur chaque bord des images vidéo",
                },
                useMask: {
                    label: "Utiliser le masque dans le pano",
                    tooltip: "Appliquer le masque de suivi de mouvement comme transparence lors du rendu du panorama",
                },
                analyzeWithEffects: {
                    label: "Analyser avec effets",
                    tooltip: "Appliquer les réglages vidéo (contraste, etc.) aux images utilisées pour l'analyse du mouvement",
                },
                exportWithEffects: {
                    label: "Exporter avec effets",
                    tooltip: "Appliquer les réglages vidéo aux exportations du panorama",
                },
                removeOuterBlack: {
                    label: "Supprimer le noir extérieur",
                    tooltip: "Rendre transparents les pixels noirs sur les bords de chaque ligne",
                },
            },
            trackingParameters: {
                title: "Paramètres de suivi",
                technique: {
                    label: "Technique",
                    tooltip: "Algorithme d'estimation du mouvement",
                },
                frameSkip: {
                    label: "Saut d'images",
                    tooltip: "Nombre d'images entre les comparaisons (plus élevé = détection de mouvements plus lents)",
                },
                trackletLength: {
                    label: "Longueur du tracklet",
                    tooltip: "Nombre d'images dans le tracklet (plus long = cohérence plus stricte)",
                },
                blurSize: {
                    label: "Taille du flou",
                    tooltip: "Flou gaussien pour les macro-caractéristiques (nombres impairs)",
                },
                minMotion: {
                    label: "Mouvement min",
                    tooltip: "Amplitude minimale du mouvement (pixels/image)",
                },
                maxMotion: {
                    label: "Mouvement max",
                    tooltip: "Amplitude maximale du mouvement",
                },
                smoothing: {
                    label: "Lissage",
                    tooltip: "Lissage de direction (plus élevé = plus de lissage)",
                },
                minVectorCount: {
                    label: "Nombre minimal de vecteurs",
                    tooltip: "Nombre minimal de vecteurs de mouvement pour une image valide",
                },
                minConfidence: {
                    label: "Confiance minimale",
                    tooltip: "Confiance minimale du consensus pour une image valide",
                },
                maxFeatures: {
                    label: "Caractéristiques max",
                    tooltip: "Nombre maximal de caractéristiques suivies",
                },
                minDistance: {
                    label: "Distance minimale",
                    tooltip: "Distance minimale entre les caractéristiques",
                },
                qualityLevel: {
                    label: "Niveau de qualité",
                    tooltip: "Seuil de qualité de détection des caractéristiques",
                },
                maxTrackError: {
                    label: "Erreur de suivi max",
                    tooltip: "Seuil maximal d'erreur de suivi",
                },
                minQuality: {
                    label: "Qualité minimale",
                    tooltip: "Qualité minimale pour afficher la flèche",
                },
                staticThreshold: {
                    label: "Seuil statique",
                    tooltip: "Un mouvement inférieur à ce seuil est considéré comme statique (HUD)",
                },
            },
        },
        status: {
            loadingOpenCv: "Chargement d'OpenCV...",
            stopAnalysis: "Arrêter l'analyse",
            analyzingPercent: "Analyse... {{pct}}%",
            creatingTrack: "Création de la piste...",
            buildingPanorama: "Construction du panorama...",
            buildingPanoramaPercent: "Construction du panorama... {{pct}}%",
            loadingFrame: "Chargement de l'image {{frame}}... ({{current}}/{{total}})",
            loadingFrameSkipped: "Chargement de l'image {{frame}}... ({{current}}/{{total}}) ({{skipped}} ignorées)",
            renderingPercent: "Rendu... {{pct}}%",
            panoPercent: "Pano... {{pct}}%",
            renderingVideo: "Rendu vidéo...",
            videoPercent: "Vidéo... {{pct}}%",
            saving: "Enregistrement...",
            buildingStabilization: "Construction de la stabilisation...",
            exportProgressTitle: "Exportation de la vidéo pano...",
        },
        errors: {
            noVideoView: "Aucune vue vidéo trouvée.",
            noVideoData: "Aucune donnée vidéo trouvée.",
            failedToLoadOpenCv: "Impossible de charger OpenCV : {{message}}",
            noOriginTrack: "Aucune piste d'origine trouvée. Une piste cible ou caméra est nécessaire pour déterminer la position initiale.",
            videoEncodingUnsupported: "L'encodage vidéo n'est pas pris en charge dans ce navigateur",
            exportFailed: "Échec de l'export vidéo : {{reason}}",
            panoVideoExportFailed: "Échec de l'export de la vidéo pano : {{message}}",
        },
    },
    textExtraction: {
        menu: {
            title: "[BETA] Extraction de texte",
            enable: {
                label: "Activer l'extraction de texte",
                disableLabel: "Désactiver l'extraction de texte",
                tooltip: "Activer le mode d'extraction de texte sur la vidéo",
            },
            addRegion: {
                label: "Ajouter une région",
                drawingLabel: "Cliquer et faire glisser sur la vidéo...",
                tooltip: "Cliquer et faire glisser sur la vidéo pour définir une région d'extraction de texte",
            },
            removeRegion: {
                label: "Supprimer la région sélectionnée",
                tooltip: "Supprimer la région actuellement sélectionnée",
            },
            clearRegions: {
                label: "Effacer toutes les régions",
                tooltip: "Supprimer toutes les régions d'extraction de texte",
            },
            startExtract: {
                label: "Démarrer l'extraction",
                stopLabel: "Arrêter l'extraction",
                tooltip: "Lancer l'OCR sur toutes les régions de l'image courante jusqu'à la fin",
            },
            fixedWidthFont: {
                label: "Police à largeur fixe",
                tooltip: "Activer la détection caractère par caractère pour les polices à largeur fixe (mieux pour les surimpressions FLIR/capteurs)",
            },
            numChars: {
                label: "Nombre de caractères",
                tooltip: "Nombre de caractères dans la région sélectionnée (divise la région uniformément)",
            },
            learnTemplates: {
                label: "Apprendre les modèles",
                activeLabel: "Cliquer sur les caractères à apprendre...",
                tooltip: "Cliquer sur les cellules de caractères pour apprendre leurs valeurs (pour l'appariement de modèles)",
            },
            clearTemplates: {
                label: "Effacer les modèles",
                tooltip: "Supprimer tous les modèles de caractères appris",
            },
            useTemplates: {
                label: "Utiliser les modèles",
                tooltip: "Utiliser les modèles appris pour l'appariement (plus rapide et plus précis une fois entraîné)",
            },
        },
        prompts: {
            learnCharacter: "Entrer le caractère pour la cellule {{index}} :",
        },
        errors: {
            failedToLoadTesseract: "Impossible de charger Tesseract.js. Vérifiez qu'il est installé : npm install tesseract.js",
            noVideoView: "L'extraction de texte nécessite une vue vidéo",
        },
    },
};

export default fr;