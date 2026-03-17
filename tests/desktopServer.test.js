const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const { createDesktopServer } = require("../apps/video-viewer/server");

function httpRequest(url) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
            const chunks = [];

            res.on("data", (chunk) => chunks.push(chunk));
            res.on("end", () => {
                resolve({
                    body: Buffer.concat(chunks).toString("utf8"),
                    headers: res.headers,
                    statusCode: res.statusCode,
                });
            });
        });

        req.on("error", reject);
    });
}

describe("desktop server", () => {
    let tempRoot;
    let distDir;
    let terrainDir;
    let server;
    let baseUrl;

    beforeAll(async () => {
        tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sitrec-desktop-server-"));
        distDir = path.join(tempRoot, "dist-serverless");
        terrainDir = path.join(tempRoot, "sitrec-terrain");

        fs.mkdirSync(path.join(distDir, "docs"), { recursive: true });
        fs.mkdirSync(path.join(terrainDir, "elevation", "1", "2"), { recursive: true });

        fs.writeFileSync(path.join(distDir, "index.html"), "<!doctype html><title>Sitrec</title>");
        fs.writeFileSync(path.join(distDir, "manifest.json"), JSON.stringify({ custom: { name: "custom" } }));
        fs.writeFileSync(path.join(distDir, "build-version.txt"), "desktop-test");
        fs.writeFileSync(path.join(terrainDir, "elevation", "1", "2", "3.png"), "terrain");

        server = createDesktopServer({ distDir, terrainDir });
        const serverInfo = await server.start();
        baseUrl = serverInfo.baseUrl;
    });

    afterAll(async () => {
        if (server) {
            await server.stop();
        }

        if (tempRoot) {
            fs.rmSync(tempRoot, { force: true, recursive: true });
        }
    });

    test("serves the manifest endpoint", async () => {
        const response = await httpRequest(`${baseUrl}/api/manifest`);
        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body)).toEqual({ custom: { name: "custom" } });
    });

    test("serves the SPA entry point for sitrec routes", async () => {
        const response = await httpRequest(`${baseUrl}/sitrec/custom-tool`);
        expect(response.statusCode).toBe(200);
        expect(response.body).toContain("<title>Sitrec</title>");
    });

    test("serves packaged terrain assets", async () => {
        const response = await httpRequest(`${baseUrl}/sitrec-terrain/elevation/1/2/3.png`);
        expect(response.statusCode).toBe(200);
        expect(response.body).toBe("terrain");
    });
});
