const es = {
    menus: {
        main: {
            title: "Sitrec",
            tooltip: "Selección de sitches y herramientas heredadas\nAlgunos sitches heredados tienen controles aquí por defecto",
            noTooltip: "No hay descripción emergente definida para este sitch",
            legacySitches: {
                label: "Sitches heredados",
                tooltip: "Los sitches heredados son sitches antiguos integrados (codificados) que son situaciones predefinidas con código y recursos específicos. Seleccione uno para cargarlo.",
            },
            legacyTools: {
                label: "Herramientas heredadas",
                tooltip: "Las herramientas son sitches especiales utilizados para configuraciones personalizadas como Starlink o con pistas de usuario, y para pruebas, depuración u otros propósitos especiales. Seleccione una para cargarla.",
            },
            selectPlaceholder: "-Seleccionar-",
        },
        file: {
            title: "Archivo",
            tooltip: "Operaciones de archivo como guardar, cargar y exportar",
        },
        view: {
            title: "Vista",
            tooltip: "Controles de vista diversos\nComo todos los menús, este puede arrastrarse fuera de la barra para convertirse en una ventana flotante",
        },
        video: {
            title: "Vídeo",
            tooltip: "Ajustes, efectos y análisis de vídeo",
        },
        time: {
            title: "Tiempo",
            tooltip: "Controles de tiempo y fotogramas\nArrastrar un control deslizante de tiempo más allá del final afectará al control superior\nTenga en cuenta que los controles de tiempo están en UTC",
        },
        objects: {
            title: "Objetos",
            tooltip: "Objetos 3D y sus propiedades\nCada carpeta corresponde a un objeto. El objeto de travesía es el que recorre las líneas de visión, es decir, el UAP que nos interesa",
            addObject: {
                label: "Añadir objeto",
                tooltip: "Crear un nuevo objeto en las coordenadas especificadas",
                prompt: "Introduzca: [Nombre] Lat Lon [Alt]\nEjemplos:\n  MiObjeto 37.7749 -122.4194 100m\n  37.7749, -122.4194\n  Referencia 37.7749 -122.4194",
                invalidInput: "Entrada no válida. Introduzca las coordenadas en el formato:\n[Nombre] Lat Lon [Alt]",
            },
        },
        satellites: {
            title: "Satélites",
            tooltip: "Carga y control de satélites\nLos satélites.\nStarlink, ISS, etc. Controles para destellos en el horizonte y otros efectos de satélites",
        },
        terrain: {
            title: "Terreno",
            tooltip: "Controles del terreno\nEl terreno es el modelo 3D del suelo. El mapa es la imagen 2D del suelo. La elevación es la altura del suelo sobre el nivel del mar",
        },
        physics: {
            title: "Física",
            tooltip: "Controles de física\nLa física de la situación, como la velocidad del viento y la física del objeto de travesía",
        },
        camera: {
            title: "Cámara",
            tooltip: "Controles de la cámara de la vista look\nLa vista look está por defecto en la ventana inferior derecha y debe coincidir con el vídeo.",
        },
        target: {
            title: "Objetivo",
            tooltip: "Controles del objetivo\nPosición y propiedades del objeto objetivo opcional",
        },
        traverse: {
            title: "Travesía",
            tooltip: "Controles de travesía\nEl objeto de travesía es el que recorre las líneas de visión, es decir, el UAP que nos interesa\nEste menú define cómo se mueve y se comporta el objeto de travesía",
        },
        showHide: {
            title: "Mostrar/Ocultar",
            tooltip: "Mostrar u ocultar vistas, objetos y otros elementos",
            views: {
                title: "Vistas",
                tooltip: "Mostrar u ocultar vistas (ventanas) como la vista look, el vídeo, la vista principal, así como superposiciones como el MQ9UI",
            },
            graphs: {
                title: "Gráficos",
                tooltip: "Mostrar u ocultar varios gráficos",
            },
        },
        effects: {
            title: "Efectos",
            tooltip: "Efectos especiales como desenfoque, pixelación y ajustes de color aplicados a la imagen final en la vista look",
        },
        lighting: {
            title: "Iluminación",
            tooltip: "La iluminación de la escena, como el sol y la luz ambiental",
        },
        contents: {
            title: "Contenido",
            tooltip: "El contenido de la escena, usado principalmente para pistas",
        },
        help: {
            title: "Ayuda",
            tooltip: "Enlaces a la documentación y otros recursos de ayuda",
            documentation: {
                title: "Documentación",
                localTooltip: "Enlaces a la documentación (local)",
                githubTooltip: "Enlaces a la documentación en GitHub",
                githubLinkLabel: "{{name}} (GitHub)",
                about: "Acerca de Sitrec",
                whatsNew: "Novedades",
                uiBasics: "Conceptos básicos de la interfaz",
                savingLoading: "Guardar y cargar sitches",
                customSitch: "Cómo configurar un sitch",
                tracks: "Pistas y fuentes de datos",
                gis: "SIG y cartografía",
                starlink: "Cómo investigar destellos Starlink",
                customModels: "Objetos y modelos 3D (aviones)",
                cameraModes: "Modos de cámara (normal y satélite)",
                thirdPartyNotices: "Avisos de terceros",
                thirdPartyNoticesTooltip: "Atribuciones de licencias de código abierto para software de terceros incluido",
                downloadBridge: "Descargar MCP Bridge",
                downloadBridgeTooltip: "Descargar el servidor MCP SitrecBridge + extensión de Chrome (sin dependencias, solo necesita Node.js)",
            },
            externalLinks: {
                title: "Enlaces externos",
                tooltip: "Enlaces de ayuda externos",
            },
            exportDebugLog: {
                label: "Exportar registro de depuración",
                tooltip: "Descargar toda la salida de consola (log, warn, error) como archivo de texto para depuración",
            },
        },
        debug: {
            title: "Depuración",
            tooltip: "Herramientas de depuración y monitorización\nUso de memoria GPU, métricas de rendimiento y otra información de depuración",
        },
    },
    jet: {
        frames: {
            time: {
                label: "Tiempo (seg)",
                tooltip: "Tiempo actual desde el inicio del vídeo en segundos (fotograma / fps)",
            },
            frame: {
                label: "Fotograma en vídeo",
                tooltip: "Número del fotograma actual en el vídeo",
            },
            paused: {
                label: "Pausa",
                tooltip: "Alternar el estado de pausa (también barra espaciadora)",
            },
        },
        controls: {
            pingPong: "Ping-pong A-B",
            podPitchPhysical: "Cabeceo del pod (bola)",
            podRollPhysical: "Alabeo de la cabeza del pod",
            deroFromGlare: "Derotación = ángulo de destello",
            jetPitch: "Cabeceo del avión",
            lookFov: "Campo de visión estrecho",
            elevation: "elevación",
            glareStartAngle: "Ángulo inicial de destello",
            initialGlareRotation: "Rotación inicial de destello",
            scaleJetPitch: "Escalar cabeceo con alabeo",
            horizonMethod: "Método de horizonte",
            horizonMethodOptions: {
                humanHorizon: "Horizonte humano",
                horizonAngle: "Ángulo de horizonte",
            },
            videoSpeed: "Velocidad de vídeo",
            podWireframe: "Pod en malla de alambre [B]ack",
            showVideo: "[V]ídeo",
            showGraph: "[G]ráfico",
            showKeyboardShortcuts: "Atajos de [K]teclado",
            showPodHead: "Alabeo de cabeza del [P]od",
            showPodsEye: "Vistas del [E]ojo del pod con derotación",
            showLookCam: "Vista [N]AR con derotación",
            showCueData: "Datos de [C]objetivo",
            showGlareGraph: "Mostrar gráfico de destello [o]",
            showAzGraph: "Mostrar gráfico A[Z]",
            declutter: "[D]espejar",
            jetOffset: "Desplazamiento Y del avión",
            tas: "TAS velocidad real",
            integrate: "Pasos de integración",
        },
    },
    motionAnalysis: {
        menu: {
            title: "Análisis de movimiento",
            analyzeMotion: {
                label: "Analizar movimiento",
                tooltip: "Activar la superposición de análisis de movimiento en tiempo real sobre el vídeo",
            },
            createTrack: {
                label: "Crear pista a partir del movimiento",
                tooltip: "Analizar todos los fotogramas y crear una pista terrestre a partir de vectores de movimiento",
            },
            alignWithFlow: {
                label: "Alinear con el flujo",
                tooltip: "Rotar la imagen para que la dirección del movimiento sea horizontal",
            },
            panorama: {
                title: "Panorama",
                exportImage: {
                    label: "Exportar panorama de movimiento",
                    tooltip: "Crear una imagen panorámica a partir de fotogramas de vídeo usando desplazamientos de seguimiento de movimiento",
                },
                exportVideo: {
                    label: "Exportar vídeo panorámico",
                    tooltip: "Crear un vídeo 4K mostrando el panorama con superposición del fotograma de vídeo",
                },
                stabilize: {
                    label: "Estabilizar vídeo",
                    disableLabel: "Desactivar estabilización",
                    tooltip: "Estabilizar vídeo usando análisis global de movimiento (elimina temblor de cámara)",
                },
                panoFrameStep: {
                    label: "Paso de fotograma del panorama",
                    tooltip: "Cuántos fotogramas saltar entre cada fotograma del panorama (1 = cada fotograma)",
                },
                crop: {
                    label: "Recorte del panorama",
                    tooltip: "Píxeles a recortar de cada borde de los fotogramas de vídeo",
                },
                useMask: {
                    label: "Usar máscara en panorama",
                    tooltip: "Aplicar la máscara de seguimiento de movimiento como transparencia al renderizar el panorama",
                },
                analyzeWithEffects: {
                    label: "Analizar con efectos",
                    tooltip: "Aplicar ajustes de vídeo (contraste, etc.) a los fotogramas usados para el análisis de movimiento",
                },
                exportWithEffects: {
                    label: "Exportar con efectos",
                    tooltip: "Aplicar ajustes de vídeo a las exportaciones del panorama",
                },
                removeOuterBlack: {
                    label: "Eliminar negro exterior",
                    tooltip: "Hacer transparentes los píxeles negros en los bordes de cada fila",
                },
            },
            trackingParameters: {
                title: "Parámetros de seguimiento",
                technique: {
                    label: "Técnica",
                    tooltip: "Algoritmo de estimación de movimiento",
                },
                frameSkip: {
                    label: "Salto de fotogramas",
                    tooltip: "Fotogramas entre comparaciones (mayor = detectar movimiento más lento)",
                },
                trackletLength: {
                    label: "Longitud del tracklet",
                    tooltip: "Número de fotogramas en el tracklet (más largo = coherencia más estricta)",
                },
                blurSize: {
                    label: "Tamaño de desenfoque",
                    tooltip: "Desenfoque gaussiano para macro características (números impares)",
                },
                minMotion: {
                    label: "Movimiento mín.",
                    tooltip: "Magnitud mínima de movimiento (píxeles/fotograma)",
                },
                maxMotion: {
                    label: "Movimiento máx.",
                    tooltip: "Magnitud máxima de movimiento",
                },
                smoothing: {
                    label: "Suavizado",
                    tooltip: "Suavizado de dirección (mayor = más suavizado)",
                },
                minVectorCount: {
                    label: "Número mín. de vectores",
                    tooltip: "Número mínimo de vectores de movimiento para un fotograma válido",
                },
                minConfidence: {
                    label: "Confianza mínima",
                    tooltip: "Confianza mínima del consenso para un fotograma válido",
                },
                maxFeatures: {
                    label: "Características máx.",
                    tooltip: "Número máximo de características rastreadas",
                },
                minDistance: {
                    label: "Distancia mínima",
                    tooltip: "Distancia mínima entre características",
                },
                qualityLevel: {
                    label: "Nivel de calidad",
                    tooltip: "Umbral de calidad de detección de características",
                },
                maxTrackError: {
                    label: "Error de seguimiento máx.",
                    tooltip: "Umbral máximo de error de seguimiento",
                },
                minQuality: {
                    label: "Calidad mínima",
                    tooltip: "Calidad mínima para mostrar la flecha",
                },
                staticThreshold: {
                    label: "Umbral estático",
                    tooltip: "Un movimiento inferior a este valor se considera estático (HUD)",
                },
            },
        },
        status: {
            loadingOpenCv: "Cargando OpenCV...",
            stopAnalysis: "Detener análisis",
            analyzingPercent: "Analizando... {{pct}}%",
            creatingTrack: "Creando pista...",
            buildingPanorama: "Construyendo panorama...",
            buildingPanoramaPercent: "Construyendo panorama... {{pct}}%",
            loadingFrame: "Cargando fotograma {{frame}}... ({{current}}/{{total}})",
            loadingFrameSkipped: "Cargando fotograma {{frame}}... ({{current}}/{{total}}) ({{skipped}} omitidos)",
            renderingPercent: "Renderizando... {{pct}}%",
            panoPercent: "Panorama... {{pct}}%",
            renderingVideo: "Renderizando vídeo...",
            videoPercent: "Vídeo... {{pct}}%",
            saving: "Guardando...",
            buildingStabilization: "Construyendo estabilización...",
            exportProgressTitle: "Exportando vídeo panorámico...",
        },
        errors: {
            noVideoView: "No se encontró vista de vídeo.",
            noVideoData: "No se encontraron datos de vídeo.",
            failedToLoadOpenCv: "Error al cargar OpenCV: {{message}}",
            noOriginTrack: "No se encontró pista de origen. Se necesita una pista de objetivo o de cámara para determinar la posición inicial.",
            videoEncodingUnsupported: "La codificación de vídeo no es compatible con este navegador",
            exportFailed: "Error en la exportación de vídeo: {{reason}}",
            panoVideoExportFailed: "Error en la exportación del vídeo panorámico: {{message}}",
        },
    },
    textExtraction: {
        menu: {
            title: "[BETA] Extracción de texto",
            enable: {
                label: "Activar extracción de texto",
                disableLabel: "Desactivar extracción de texto",
                tooltip: "Activar el modo de extracción de texto en el vídeo",
            },
            addRegion: {
                label: "Añadir región",
                drawingLabel: "Haga clic y arrastre sobre el vídeo...",
                tooltip: "Haga clic y arrastre sobre el vídeo para definir una región de extracción de texto",
            },
            removeRegion: {
                label: "Eliminar región seleccionada",
                tooltip: "Eliminar la región actualmente seleccionada",
            },
            clearRegions: {
                label: "Borrar todas las regiones",
                tooltip: "Eliminar todas las regiones de extracción de texto",
            },
            startExtract: {
                label: "Iniciar extracción",
                stopLabel: "Detener extracción",
                tooltip: "Ejecutar OCR en todas las regiones desde el fotograma actual hasta el final",
            },
            fixedWidthFont: {
                label: "Fuente de ancho fijo",
                tooltip: "Activar detección carácter por carácter para fuentes de ancho fijo (mejor para superposiciones FLIR/sensores)",
            },
            numChars: {
                label: "Número de caracteres",
                tooltip: "Número de caracteres en la región seleccionada (divide la región uniformemente)",
            },
            learnTemplates: {
                label: "Aprender plantillas",
                activeLabel: "Haga clic en los caracteres para aprender...",
                tooltip: "Haga clic en las celdas de caracteres para enseñar sus valores (para coincidencia de plantillas)",
            },
            clearTemplates: {
                label: "Borrar plantillas",
                tooltip: "Eliminar todas las plantillas de caracteres aprendidas",
            },
            useTemplates: {
                label: "Usar plantillas",
                tooltip: "Usar plantillas aprendidas para la coincidencia (más rápido y preciso una vez entrenado)",
            },
        },
        prompts: {
            learnCharacter: "Introduzca el carácter para la celda {{index}}:",
        },
        errors: {
            failedToLoadTesseract: "Error al cargar Tesseract.js. Asegúrese de que está instalado: npm install tesseract.js",
            noVideoView: "La extracción de texto requiere una vista de vídeo",
        },
    },
};

export default es;
