const path = require("path");
const {
    createDesktopDirectoryHandle,
    isDesktopFileSystemAvailable,
} = require("../src/DesktopFileSystem");

describe("DesktopFileSystem", () => {
    let files;
    let directories;

    beforeEach(() => {
        files = new Map();
        directories = new Set(["/tmp", "/tmp/sitrec"]);

        global.window = {
            sitrecDesktop: {
                fs: {
                    async ensureDirectory(dirPath) {
                        directories.add(dirPath);
                        return { kind: "directory", name: path.basename(dirPath), path: dirPath };
                    },
                    async readFile(filePath) {
                        if (!files.has(filePath)) {
                            const error = new Error(`File not found: ${filePath}`);
                            error.name = "NotFoundError";
                            throw error;
                        }
                        return new Uint8Array(files.get(filePath));
                    },
                    async resolvePath(basePath, relativePath) {
                        return path.resolve(basePath, relativePath);
                    },
                    async stat(targetPath) {
                        if (directories.has(targetPath)) {
                            return { exists: true, kind: "directory", path: targetPath };
                        }
                        if (files.has(targetPath)) {
                            return { exists: true, kind: "file", path: targetPath };
                        }
                        return { exists: false, kind: null, path: targetPath };
                    },
                    async writeFile(filePath, data) {
                        directories.add(path.dirname(filePath));
                        files.set(filePath, Buffer.from(data));
                        return { kind: "file", name: path.basename(filePath), path: filePath };
                    },
                },
            },
        };
    });

    afterEach(() => {
        delete global.window;
    });

    test("reports desktop bridge availability", () => {
        expect(isDesktopFileSystemAvailable()).toBe(true);
    });

    test("creates nested directory and file handles backed by the desktop bridge", async () => {
        const root = createDesktopDirectoryHandle("/tmp/sitrec");
        const localDir = await root.getDirectoryHandle("local", { create: true });
        const fileHandle = await localDir.getFileHandle("custom.json", { create: true });
        const writable = await fileHandle.createWritable();

        await writable.write(new TextEncoder().encode("{\"ok\":true}"));
        await writable.close();

        const file = await fileHandle.getFile();
        expect(file.name).toBe("custom.json");
        expect(await file.text()).toBe("{\"ok\":true}");
    });

    test("throws NotFoundError for missing desktop directory entries", async () => {
        const root = createDesktopDirectoryHandle("/tmp/sitrec");

        await expect(root.getFileHandle("missing.json")).rejects.toMatchObject({
            name: "NotFoundError",
        });
    });
});
