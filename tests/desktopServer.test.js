const fs = require("fs");
const os = require("os");
const path = require("path");
const { PassThrough } = require("stream");

const { createDesktopRequestHandler } = require("../apps/video-viewer/server");

function invokeRequest(handler, url, method = "GET") {
    return new Promise((resolve, reject) => {
        const req = new PassThrough();
        req.method = method;
        req.url = url;

        const res = new PassThrough();
        const chunks = [];
        let headers = {};
        let statusCode = 200;

        res.writeHead = (status, nextHeaders) => {
            statusCode = status;
            headers = nextHeaders;
        };

        res.on("data", (chunk) => chunks.push(chunk));
        res.on("finish", () => {
            resolve({
                body: Buffer.concat(chunks).toString("utf8"),
                headers,
                statusCode,
            });
        });
        res.on("error", reject);

        handler(req, res).catch(reject);
    });
}

describe("desktop server", () => {
    let tempRoot;
    let distDir;
    let terrainDir;
    let handler;

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

        handler = createDesktopRequestHandler({
            baseUrl: "http://127.0.0.1:43123",
            distDir,
            terrainDir,
        });
    });

    afterAll(async () => {
        if (tempRoot) {
            fs.rmSync(tempRoot, { force: true, recursive: true });
        }
    });

    test("serves the manifest endpoint", async () => {
        const response = await invokeRequest(handler, "/api/manifest");
        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body)).toEqual({ custom: { name: "custom" } });
    });

    test("serves the SPA entry point for sitrec routes", async () => {
        const response = await invokeRequest(handler, "/sitrec/custom-tool");
        expect(response.statusCode).toBe(200);
        expect(response.body).toContain("<title>Sitrec</title>");
    });

    test("serves packaged terrain assets", async () => {
        const response = await invokeRequest(handler, "/sitrec-terrain/elevation/1/2/3.png");
        expect(response.statusCode).toBe(200);
        expect(response.body).toBe("terrain");
    });
});
