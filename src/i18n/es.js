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
    file: {
        newSitch: {
            label: "Nuevo sitch",
            tooltip: "Crear un nuevo sitch (recargará esta página, restableciendo todo)",
        },
        savingDisabled: "Guardado desactivado (haga clic para iniciar sesión)",
        importFile: {
            label: "Importar archivo",
            tooltip: "Importar uno o varios archivos desde su sistema. Igual que arrastrar y soltar un archivo en la ventana del navegador",
        },
        server: {
            open: "Abrir",
            save: {
                label: "Guardar",
                tooltip: "Guardar el sitch actual en el servidor",
            },
            saveAs: {
                label: "Guardar como",
                tooltip: "Guardar el sitch actual en el servidor con un nuevo nombre",
            },
            versions: {
                label: "Versiones",
                tooltip: "Cargar una versión específica del sitch seleccionado",
            },
            browseFeatured: "Explorar sitches destacados",
            browseAll: "Explorar todos sus sitches guardados en una lista buscable y ordenable",
        },
        local: {
            title: "Local",
            titleWithFolder: "Local: {{name}}",
            titleReconnect: "Local: {{name}} (reconectar)",
            status: "Estado",
            noFileSelected: "Ningún archivo local seleccionado",
            noFolderSelected: "Ninguna carpeta seleccionada",
            currentFile: "Archivo actual: {{name}}",
            statusDesktop: "Estado actual del archivo/guardado local",
            statusFolder: "Estado actual de la carpeta/guardado local",
            stateReady: "Listo",
            stateReconnect: "Necesita reconexión",
            stateNoFolder: "Sin carpeta",
            statusLine: "{{state}} | Carpeta: {{folder}} | Destino: {{target}}",
            saveLocal: {
                label: "Guardar local",
                tooltipDesktop: "Guardar en el archivo local actual, o solicitar un nombre de archivo si es necesario",
                tooltipFolder: "Guardar en la carpeta de trabajo (o solicitar ubicación si no hay ninguna definida)",
                tooltipSaveBack: "Guardar en {{name}}",
                tooltipSaveBackInFolder: "Guardar en {{name}} en {{folder}}",
                tooltipSaveInto: "Guardar en {{folder}} (solicita el nombre del sitch)",
                tooltipPrompt: "Guardar un archivo sitch local (solicita nombre/ubicación)",
                tooltipSaveTo: "Guardar el sitch actual en un archivo local",
            },
            saveLocalAs: {
                label: "Guardar local como...",
                tooltipDesktop: "Guardar un archivo sitch local en una nueva ruta",
                tooltipFolder: "Guardar un archivo sitch local eligiendo la ubicación",
                tooltipInFolder: "Guardar con un nuevo nombre en la carpeta de trabajo actual",
                tooltipNewPath: "Guardar el sitch actual en una nueva ruta local",
            },
            openLocal: {
                label: "Abrir sitch local",
                labelShort: "Abrir local...",
                tooltipDesktop: "Abrir un archivo sitch local desde el disco",
                tooltipFolder: "Abrir un archivo sitch desde la carpeta de trabajo actual",
                tooltipCurrent: "Abrir otro archivo sitch local (actual: {{name}})",
                tooltipFromFolder: "Abrir un archivo sitch desde {{folder}}",
            },
            selectFolder: {
                label: "Seleccionar carpeta de sitches locales",
                tooltip: "Seleccionar una carpeta de trabajo para operaciones de guardado/carga locales",
            },
            reconnectFolder: {
                label: "Reconectar carpeta",
                tooltip: "Volver a conceder acceso a la carpeta de trabajo usada anteriormente",
            },
        },
        debug: {
            recalculateAll: "debug recalcular todo",
            dumpNodes: "debug listar nodos",
            dumpNodesBackwards: "debug listar nodos en reversa",
            dumpRoots: "debug listar nodos raíz",
        },
    },
    videoExport: {
        notAvailable: "Exportación de vídeo no disponible",
        folder: {
            title: "Renderizado y exportación de vídeo",
            tooltip: "Opciones para renderizar y exportar archivos de vídeo desde las vistas de Sitrec o la ventana completa",
        },
        renderView: {
            label: "Vista de renderizado de vídeo",
            tooltip: "Seleccionar qué vista exportar como vídeo",
        },
        renderSingleVideo: {
            label: "Renderizar vídeo de vista única",
            tooltip: "Exportar la vista seleccionada como archivo de vídeo con todos los fotogramas",
        },
        videoFormat: {
            label: "Formato de vídeo",
            tooltip: "Seleccionar el formato de salida de vídeo",
        },
        renderViewport: {
            label: "Renderizar vídeo de ventana",
            tooltip: "Exportar toda la ventana como archivo de vídeo con todos los fotogramas",
        },
        renderFullscreen: {
            label: "Renderizar vídeo a pantalla completa",
            tooltip: "Exportar toda la ventana en modo pantalla completa como archivo de vídeo",
        },
        recordWindow: {
            label: "Grabar ventana del navegador",
            tooltip: "Grabar toda la ventana del navegador (incluyendo menús e interfaz) como vídeo a velocidad fija",
        },
        retinaExport: {
            label: "Exportación HD/Retina",
            tooltip: "Exportar a resolución Retina/HiDPI (2x en la mayoría de pantallas)",
        },
        includeAudio: {
            label: "Incluir audio",
            tooltip: "Incluir la pista de audio del vídeo fuente si está disponible",
        },
        waitForLoading: {
            label: "Esperar carga en segundo plano",
            tooltip: "Cuando está activado, el renderizado espera a que se carguen terreno/edificios/fondo antes de capturar cada fotograma",
        },
        exportFrame: {
            label: "Exportar fotograma de vídeo",
            tooltip: "Exportar el fotograma de vídeo actual tal como se muestra (con efectos) como archivo PNG",
        },
    },
    tracking: {
        enable: {
            label: "Activar seguimiento automático",
            disableLabel: "Desactivar seguimiento automático",
            tooltip: "Mostrar/ocultar el cursor de seguimiento automático en el vídeo",
        },
        start: {
            label: "Iniciar seguimiento automático",
            stopLabel: "Detener seguimiento automático",
            tooltip: "Seguir automáticamente el objeto dentro del cursor durante la reproducción",
        },
        clearFromHere: {
            label: "Borrar desde aquí",
            tooltip: "Borrar todas las posiciones rastreadas desde el fotograma actual hasta el final",
        },
        clearTrack: {
            label: "Borrar pista",
            tooltip: "Borrar todas las posiciones rastreadas y empezar de nuevo",
        },
        stabilize: {
            label: "Estabilizar",
            tooltip: "Aplicar posiciones rastreadas para estabilizar el vídeo",
        },
        stabilizeToggle: {
            enableLabel: "Activar estabilización",
            disableLabel: "Desactivar estabilización",
            tooltip: "Activar/desactivar la estabilización de vídeo",
        },
        stabilizeCenters: {
            label: "Centrar estabilización",
            tooltip: "Cuando está marcado, el punto estabilizado queda fijo en el centro. Si no, permanece en su posición inicial.",
        },
        renderStabilized: {
            label: "Renderizar vídeo estabilizado",
            tooltip: "Exportar vídeo estabilizado a tamaño original (el punto rastreado queda fijo, bordes negros posibles)",
        },
        renderStabilizedExpanded: {
            label: "Renderizar estabilizado expandido",
            tooltip: "Exportar vídeo estabilizado con lienzo ampliado para no perder píxeles",
        },
        trackRadius: {
            label: "Radio de seguimiento",
            tooltip: "Tamaño de la plantilla a buscar (tamaño del objeto)",
        },
        searchRadius: {
            label: "Radio de búsqueda",
            tooltip: "Distancia de búsqueda desde la posición anterior (aumentar para movimientos rápidos)",
        },
        trackingMethod: {
            label: "Método de seguimiento",
            tooltip: "Coincidencia de plantilla (OpenCV) o flujo óptico (jsfeat Lucas-Kanade)",
        },
        centerOnBright: {
            label: "Centrar en píxeles brillantes",
            tooltip: "Seguir el centroide de píxeles brillantes (mejor para estrellas/luces puntuales)",
        },
        centerOnDark: {
            label: "Centrar en píxeles oscuros",
            tooltip: "Seguir el centroide de píxeles oscuros",
        },
        brightnessThreshold: {
            label: "Umbral de brillo",
            tooltip: "Umbral de brillo (0-255). Usado en los modos centrar en brillante/oscuro",
        },
        status: {
            loadingJsfeat: "Cargando jsfeat...",
            loadingOpenCv: "Cargando OpenCV...",
            sam2Connecting: "SAM2: Conectando...",
            sam2Uploading: "SAM2: Subiendo...",
        },
    },
    trackManager: {
        removeTrack: "Eliminar pista",
        createSpline: "Crear spline",
        editTrack: "Editar pista",
        constantSpeed: "Velocidad constante",
        extrapolateTrack: "Extrapolar pista",
        curveType: "Tipo de curva",
        altLockAGL: "Bloqueo alt. AGL",
        deleteTrack: "Eliminar pista",
    },
    gpuMonitor: {
        enabled: "Monitor activado",
        total: "Memoria total",
        geometries: "Geometrías",
        textures: "Texturas",
        peak: "Memoria máxima",
        average: "Memoria promedio",
        reset: "Restablecer historial",
    },
    situationSetup: {
        mainFov: {
            label: "FOV principal",
            tooltip: "Campo de visión de la cámara de la vista principal (VERTICAL)",
        },
        lookCameraFov: "FOV cámara look",
        azimuth: "acimut",
        jetPitch: "Cabeceo del avión",
    },
    featureManager: {
        labelText: "Texto de etiqueta",
        latitude: "Latitud",
        longitude: "Longitud",
        altitude: "Altitud (m)",
        arrowLength: "Longitud de la flecha",
        arrowColor: "Color de la flecha",
        textColor: "Color del texto",
        deleteFeature: "Eliminar característica",
    },
    panoramaExport: {
        exportLookPanorama: {
            label: "Exportar panorama look",
            tooltip: "Crear una imagen panorámica desde la vista look a través de todos los fotogramas según la posición del fondo",
        },
    },
    dateTime: {
        liveMode: {
            label: "Modo en vivo",
            tooltip: "Si el modo en vivo está activado, la reproducción siempre estará sincronizada con la hora actual.\nPausar o desplazar el tiempo desactivará el modo en vivo",
        },
        startTime: {
            tooltip: "La hora de INICIO del primer fotograma del vídeo, en formato UTC",
        },
        currentTime: {
            tooltip: "La hora ACTUAL del vídeo. Es a lo que se refieren la fecha y hora siguientes",
        },
        year: "Año del fotograma actual",
        month: "Mes (1-12)",
        day: "Día del mes",
        hour: "Hora (0-23)",
        minute: "Minuto (0-59)",
        second: "Segundo (0-59)",
        millisecond: "Milisegundo (0-999)",
        useTimeZone: {
            label: "Usar zona horaria en la interfaz",
            tooltip: "Usar la zona horaria en la interfaz superior\nEsto cambiará la fecha y hora a la zona horaria seleccionada, en lugar de UTC.\nÚtil para mostrar la fecha y hora en una zona horaria específica.",
        },
        timeZone: {
            label: "Zona horaria",
            tooltip: "La zona horaria para mostrar la fecha y hora en la vista look\nTambién en la interfaz si 'Usar zona horaria' está marcado",
        },
        simSpeed: {
            label: "Velocidad de simulación",
            tooltip: "La velocidad de la simulación, 1 es tiempo real, 2 es el doble de rápido, etc.\nEsto no cambia la velocidad de reproducción del vídeo, solo los cálculos de tiempo para la simulación.",
        },
        sitchFrames: {
            label: "Fotogramas del sitch",
            tooltip: "El número de fotogramas en el sitch. Si hay un vídeo, será el número de fotogramas del vídeo, pero puede cambiarlo si desea añadir más fotogramas o usar el sitch sin vídeo",
        },
        sitchDuration: {
            label: "Duración del sitch",
            tooltip: "Duración del sitch en formato HH:MM:SS.sss",
        },
        aFrame: {
            label: "Fotograma A",
            tooltip: "Limitar la reproducción entre A y B, mostrados en verde y rojo en el deslizador de fotogramas",
        },
        bFrame: {
            label: "Fotograma B",
            tooltip: "Limitar la reproducción entre A y B, mostrados en verde y rojo en el deslizador de fotogramas",
        },
        videoFps: {
            label: "FPS de vídeo",
            tooltip: "Los fotogramas por segundo del vídeo. Esto cambiará la velocidad de reproducción (ej: 30 fps, 25 fps, etc). También cambiará la duración del sitch ya que modifica la duración de un fotograma individual\nDerivado del vídeo cuando es posible, pero modificable",
        },
        syncTimeTo: {
            label: "Sincronizar tiempo con",
            tooltip: "Sincronizar la hora de inicio del vídeo con la hora de inicio original, la hora actual, o la hora de inicio de una pista (si está cargada)",
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
    custom: {
        balloons: {
            count: { label: "Cantidad", tooltip: "Cantidad de estaciones cercanas a importar" },
            source: { label: "Fuente", tooltip: "uwyo = University of Wyoming (necesita proxy PHP)\nigra2 = Archivo NOAA NCEI (descarga directa)" },
            getNearby: { label: "Obtener globos sonda cercanos", tooltip: "Importar los N sondeos de globos meteorológicos más cercanos a la posición actual de la cámara.\nUsa el lanzamiento más reciente antes de la hora de inicio del sitch + 1 hora." },
            importSounding: { label: "Importar sondeo...", tooltip: "Selector manual de estación: elija estación, fecha, fuente e importe un sondeo específico." },
        },
        showHide: {
            keyboardShortcuts: { label: "Atajos de [K]teclado", tooltip: "Mostrar u ocultar la superposición de atajos de teclado" },
            toggleExtendToGround: { label: "Alternar TODOS [E]xtender al suelo", tooltip: "Alternar 'Extender al suelo' para todas las pistas\nDesactivará todas si alguna está activada\nActivará todas si ninguna está activada" },
            showAllTracksInLook: { label: "Mostrar todas las pistas en la vista look", tooltip: "Mostrar todas las pistas de aeronaves en la vista look/cámara" },
            showCompassElevation: { label: "Mostrar elevación de brújula", tooltip: "Mostrar la elevación de la brújula (ángulo sobre el plano del suelo local) además del rumbo (acimut)" },
            filterTracks: { label: "Filtrar pistas", tooltip: "Mostrar/ocultar pistas según altitud, dirección o intersección con el frustum" },
            removeAllTracks: { label: "Eliminar todas las pistas", tooltip: "Eliminar todas las pistas de la escena\nEsto no eliminará los objetos, solo las pistas\nPuede volver a añadirlas arrastrando y soltando los archivos" },
        },
        objects: {
            globalScale: { label: "Escala global", tooltip: "Factor de escala aplicado a todos los objetos 3D de la escena - útil para encontrar cosas. Volver a 1 para el tamaño real" },
        },
        admin: {
            dashboard: { label: "Panel de administración", tooltip: "Abrir el panel de administración" },
            validateAllSitches: { label: "Validar todos los sitches", tooltip: "Cargar todos los sitches guardados con terreno local para buscar errores" },
            testUserID: { label: "ID de usuario de prueba", tooltip: "Operar como este ID de usuario (0 = desactivado, debe ser > 1)" },
            addMissingScreenshots: { label: "Añadir capturas faltantes", tooltip: "Cargar cada sitch sin captura de pantalla, renderizarlo y subir una captura" },
            feature: { label: "Destacar", tooltip: "Alternar el estado de destacado para el sitch cargado actualmente" },
        },
        viewPreset: { label: "Preajuste de vista", tooltip: "Cambiar entre diferentes preajustes de vista\nLado a lado, arriba y abajo, etc." },
        subSitches: {
            folder: { tooltip: "Gestionar múltiples configuraciones de cámara/vista dentro de este sitch" },
            updateCurrent: { label: "Actualizar sub actual", tooltip: "Actualizar el sub sitch seleccionado con la configuración de vista actual" },
            updateAndAddNew: { label: "Actualizar actual y añadir nuevo sub", tooltip: "Actualizar el sub sitch actual, luego duplicarlo en un nuevo sub sitch" },
            discardAndAddNew: { label: "Descartar cambios y añadir nuevo", tooltip: "Descartar cambios del sub sitch actual y crear un nuevo sub sitch desde el estado actual" },
            renameCurrent: { label: "Renombrar sub actual", tooltip: "Renombrar el sub sitch seleccionado actualmente" },
            deleteCurrent: { label: "Eliminar sub actual", tooltip: "Eliminar el sub sitch seleccionado actualmente" },
            syncSaveDetails: { label: "Sincronizar detalles de guardado", tooltip: "Eliminar del sub actual los nodos no habilitados en los detalles de guardado" },
        },
        contextMenu: {
            setCameraAbove: "Colocar cámara arriba",
            setCameraOnGround: "Colocar cámara en el suelo",
            setTargetAbove: "Colocar objetivo arriba",
            setTargetOnGround: "Colocar objetivo en el suelo",
            dropPin: "Fijar pin / Añadir característica",
            createTrackWithObject: "Crear pista con objeto",
            createTrackNoObject: "Crear pista (sin objeto)",
            addBuilding: "Añadir edificio",
            addClouds: "Añadir nubes",
            addGroundOverlay: "Añadir superposición terrestre",
            centerTerrain: "Centrar cuadro de terreno aquí",
            googleMapsHere: "Google Maps aquí",
            googleEarthHere: "Google Earth aquí",
            removeClosestPoint: "Eliminar punto más cercano",
            exitEditMode: "Salir del modo edición",
        },
    },
    view3d: {
        northUp: { label: "Vista look norte arriba", tooltip: "La vista look se orienta con el norte arriba, en lugar del mundo arriba.\nPara vistas de satélite y similares, mirando directamente hacia abajo.\nNo se aplica en modo PTZ" },
        atmosphere: { label: "Atmósfera", tooltip: "Atenuación por distancia que mezcla el terreno y los objetos 3D hacia el color del cielo actual" },
        atmoVisibility: { label: "Visibilidad atmo (km)", tooltip: "Distancia donde el contraste atmosférico cae a aproximadamente 50% (más pequeño = atmósfera más densa)" },
        atmoHDR: { label: "Atmo HDR", tooltip: "Niebla/tone mapping HDR físicamente realista para reflejos solares a través de la bruma" },
        atmoExposure: { label: "Exposición atmo", tooltip: "Multiplicador de exposición de tone mapping HDR para suavizado de luces altas" },
        startXR: { label: "Iniciar VR/XR", tooltip: "Iniciar sesión WebXR para pruebas (funciona con Immersive Web Emulator)" },
        effects: { label: "Efectos", tooltip: "Activar/desactivar todos los efectos" },
        focusTrack: { label: "Pista de enfoque", tooltip: "Seleccionar una pista para que la cámara la mire y gire a su alrededor" },
        lockTrack: { label: "Bloquear en pista", tooltip: "Seleccionar una pista para bloquear la cámara en ella, de modo que se mueva con la pista" },
        debug: {
            clearBackground: "Limpiar fondo", renderSky: "Renderizar cielo", renderDaySky: "Renderizar cielo diurno",
            renderMainScene: "Renderizar escena principal", renderEffects: "Renderizar efectos", copyToScreen: "Copiar a pantalla",
            updateCameraMatrices: "Actualizar matrices de cámara", mainUseLookLayers: "Principal usa capas look",
            sRGBOutputEncoding: "Codificación de salida sRGB", tileLoadDelay: "Retardo de carga de teselas (s)",
            updateStarScales: "Actualizar escalas de estrellas", updateSatelliteScales: "Actualizar escalas de satélites",
            renderNightSky: "Renderizar cielo nocturno", renderFullscreenQuad: "Renderizar quad pantalla completa", renderSunSky: "Renderizar cielo solar",
        },
        celestial: {
            raHours: "AR (horas)", decDegrees: "Dec (grados)", magnitude: "Magnitud",
            noradNumber: "Número NORAD", name: "Nombre",
        },
    },
};

export default es;
