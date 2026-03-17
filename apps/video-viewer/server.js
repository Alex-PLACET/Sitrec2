const http = require("http");
const fs = require("fs");
const path = require("path");

const MIME_TYPES = {
    ".bin": "application/octet-stream",
    ".css": "text/css; charset=utf-8",
    ".csv": "text/csv; charset=utf-8",
    ".eot": "application/vnd.ms-fontobject",
    ".gif": "image/gif",
    ".glb": "model/gltf-binary",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".mp4": "video/mp4",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".txt": "text/plain; charset=utf-8",
    ".ttf": "font/ttf",
    ".wasm": "application/wasm",
    ".webm": "video/webm",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
};

const STATIC_EXTENSION_RE = /\.[a-z0-9]+$/i;
const PHP_PREFIXES = ["/sitrecServer/", "/sitrec/sitrecServer/"];

function getMimeType(filePath) {
    return MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function decodePathname(pathname) {
    try {
        return decodeURIComponent(pathname);
    } catch (error) {
        return pathname;
    }
}

function jsonResponse(res, statusCode, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(statusCode, {
        "Cache-Control": "no-store",
        "Content-Length": Buffer.byteLength(body),
        "Content-Type": "application/json; charset=utf-8",
    });
    res.end(body);
}

function redirect(res, location) {
    res.writeHead(302, { Location: location });
    res.end();
}

async function collectFiles(baseDir, relativeDir = "", fileList = []) {
    const dirPath = path.join(baseDir, relativeDir);
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
        if (entry.name === ".DS_Store") {
            continue;
        }

        const relativePath = path.posix.join(relativeDir, entry.name);
        if (entry.isDirectory()) {
            await collectFiles(baseDir, relativePath, fileList);
        } else {
            fileList.push(relativePath);
        }
    }

    return fileList;
}

function resolveStaticPath(baseDir, relativePath) {
    const sanitizedParts = relativePath.split("/").filter(Boolean);
    const basePath = path.resolve(baseDir);
    const resolvedPath = path.resolve(basePath, ...sanitizedParts);

    if (resolvedPath !== basePath && !resolvedPath.startsWith(basePath + path.sep)) {
        return null;
    }

    return resolvedPath;
}

async function tryServeFile(res, filePath, method) {
    try {
        const stats = await fs.promises.stat(filePath);
        if (!stats.isFile()) {
            return false;
        }

        res.writeHead(200, {
            "Cache-Control": "no-store",
            "Content-Length": stats.size,
            "Content-Type": getMimeType(filePath),
        });

        if (method === "HEAD") {
            res.end();
            return true;
        }

        await new Promise((resolve, reject) => {
            const stream = fs.createReadStream(filePath);
            stream.on("error", reject);
            stream.on("end", resolve);
            stream.pipe(res);
        });
        return true;
    } catch (error) {
        return false;
    }
}

function stripPhpPrefix(pathname) {
    for (const prefix of PHP_PREFIXES) {
        if (pathname.startsWith(prefix)) {
            return pathname.slice(prefix.length);
        }
    }
    return null;
}

function handlePhpStub(pathname, searchParams, method, res) {
    const phpPath = stripPhpPrefix(pathname);
    if (phpPath === null) {
        return false;
    }

    switch (phpPath) {
        case "config_paths.php":
            jsonResponse(res, 200, {
                CACHE: "/cache/",
                TERRAIN: "/sitrec-terrain/",
                UPLOAD: "/user-files/",
            });
            return true;

        case "getsitches.php":
            jsonResponse(res, 200, {});
            return true;

        case "record_visit.php":
            jsonResponse(res, 200, { offline: true, ok: true });
            return true;

        case "tile_usage.php":
            jsonResponse(res, 200, {
                disabled: true,
                limits: {},
                remaining: {},
                usage: {},
            });
            return true;

        case "rehost.php":
            if (searchParams.get("getuser") === "1") {
                jsonResponse(res, 200, {
                    loggedIn: false,
                    message: "Offline desktop mode",
                    userGroups: [],
                    userID: 88888888,
                });
                return true;
            }

            jsonResponse(res, 501, {
                error: "File rehosting disabled in offline desktop mode",
                method,
            });
            return true;

        case "settings.php":
            jsonResponse(res, 501, {
                error: "Server-backed settings disabled in offline desktop mode",
            });
            return true;

        case "proxy.php":
        case "proxyStarlink.php":
            jsonResponse(res, 501, {
                error: "Remote proxying disabled in offline desktop mode",
            });
            return true;

        case "user.php":
            jsonResponse(res, 200, {
                loggedIn: false,
                message: "Offline desktop mode",
                userId: 88888888,
            });
            return true;

        default:
            jsonResponse(res, 404, {
                error: "Not Found",
                path: pathname,
            });
            return true;
    }
}

async function handleRequest(req, res, options) {
    const requestUrl = new URL(req.url, "http://127.0.0.1");
    const pathname = decodePathname(requestUrl.pathname);
    const method = req.method || "GET";

    if (!["GET", "HEAD", "POST"].includes(method)) {
        jsonResponse(res, 405, { error: "Method Not Allowed", method });
        return;
    }

    if (pathname === "/") {
        redirect(res, "/sitrec/");
        return;
    }

    if (pathname === "/sitrec") {
        redirect(res, "/sitrec/");
        return;
    }

    if (pathname === "/api/health" || pathname === "/sitrec/api/health") {
        jsonResponse(res, 200, {
            mode: "desktop-offline",
            offline: true,
            status: "ok",
            timestamp: new Date().toISOString(),
            version: "1.0.0-desktop",
        });
        return;
    }

    if (pathname === "/api/manifest" || pathname === "/sitrec/api/manifest") {
        const manifestPath = path.join(options.distDir, "manifest.json");
        try {
            const manifestText = await fs.promises.readFile(manifestPath, "utf8");
            jsonResponse(res, 200, JSON.parse(manifestText));
        } catch (error) {
            jsonResponse(res, 200, {});
        }
        return;
    }

    if (pathname === "/api/debug/status" || pathname === "/sitrec/api/debug/status") {
        jsonResponse(res, 200, {
            frontend: {
                buildDir: options.distDir,
                buildExists: fs.existsSync(options.distDir),
                terrainDir: options.terrainDir,
                terrainExists: fs.existsSync(options.terrainDir),
            },
            mode: "desktop-offline",
            timestamp: new Date().toISOString(),
            url: options.baseUrl ? `${options.baseUrl}/sitrec/` : null,
        });
        return;
    }

    if (pathname === "/api/debug/files" || pathname === "/sitrec/api/debug/files") {
        try {
            const files = await collectFiles(options.distDir);
            jsonResponse(res, 200, {
                buildDir: options.distDir,
                fileCount: files.length,
                files: files.sort().slice(0, 200),
            });
        } catch (error) {
            jsonResponse(res, 500, {
                error: error.message,
            });
        }
        return;
    }

    if (handlePhpStub(pathname, requestUrl.searchParams, method, res)) {
        return;
    }

    if (pathname.startsWith("/sitrec-terrain/")) {
        const terrainPath = resolveStaticPath(options.terrainDir, pathname.slice("/sitrec-terrain/".length));
        if (terrainPath && await tryServeFile(res, terrainPath, method)) {
            return;
        }

        jsonResponse(res, 404, {
            error: "Terrain asset not found",
            path: pathname,
        });
        return;
    }

    if (pathname.startsWith("/sitrec/")) {
        const relativePath = pathname.slice("/sitrec/".length);
        if (relativePath && await tryServeFile(res, resolveStaticPath(options.distDir, relativePath), method)) {
            return;
        }

        if (!relativePath || !STATIC_EXTENSION_RE.test(pathname)) {
            await tryServeFile(res, path.join(options.distDir, "index.html"), method);
            return;
        }
    }

    const rootRelativePath = pathname.replace(/^\/+/, "");
    if (rootRelativePath && await tryServeFile(res, resolveStaticPath(options.distDir, rootRelativePath), method)) {
        return;
    }

    jsonResponse(res, 404, {
        error: "Not Found",
        path: pathname,
    });
}

function createDesktopServer({
    distDir,
    host = "127.0.0.1",
    port = 0,
    terrainDir,
}) {
    let activeBaseUrl = null;
    let activeServer = null;

    return {
        async start() {
            if (activeServer) {
                return {
                    baseUrl: activeBaseUrl,
                    host,
                    port: activeServer.address().port,
                };
            }

            activeServer = http.createServer((req, res) => {
                handleRequest(req, res, {
                    baseUrl: activeBaseUrl,
                    distDir,
                    terrainDir,
                }).catch((error) => {
                    console.error("[desktop-server] request failed", error);
                    jsonResponse(res, 500, {
                        error: "Internal Server Error",
                        message: error.message,
                    });
                });
            });

            await new Promise((resolve, reject) => {
                activeServer.once("error", reject);
                activeServer.listen(port, host, () => {
                    activeServer.off("error", reject);
                    resolve();
                });
            });

            const address = activeServer.address();
            activeBaseUrl = `http://${host}:${address.port}`;

            return {
                baseUrl: activeBaseUrl,
                host,
                port: address.port,
            };
        },

        async stop() {
            if (!activeServer) {
                return;
            }

            const serverToClose = activeServer;
            activeServer = null;
            activeBaseUrl = null;

            await new Promise((resolve, reject) => {
                serverToClose.close((error) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    resolve();
                });
            });
        },

        getBaseUrl() {
            return activeBaseUrl;
        },
    };
}

module.exports = {
    createDesktopServer,
};
