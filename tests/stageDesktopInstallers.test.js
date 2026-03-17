const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    buildPlatformMetadata,
    collectDesktopInstallers,
    compareVersionsDescending,
    extractVersion,
    stageDesktopInstallers,
} = require("../scripts/stageDesktopInstallers");

function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "sitrec-installers-"));
}

afterEach(() => {
    jest.restoreAllMocks();
});

test("collectDesktopInstallers filters unsupported artifacts and sorts newest first", () => {
    const sourceDir = makeTempDir();

    fs.writeFileSync(path.join(sourceDir, "Sitrec-2.34.6-arm64.dmg"), "old");
    fs.writeFileSync(path.join(sourceDir, "Sitrec-2.34.7-arm64.dmg"), "new");
    fs.writeFileSync(path.join(sourceDir, "Sitrec Setup 2.34.7.exe"), "win");
    fs.writeFileSync(path.join(sourceDir, "Sitrec Video Viewer-1.0.0-arm64.dmg"), "ignore");

    const downloads = collectDesktopInstallers(sourceDir);

    expect(downloads.map((download) => download.fileName)).toEqual([
        "Sitrec Setup 2.34.7.exe",
        "Sitrec-2.34.7-arm64.dmg",
        "Sitrec-2.34.6-arm64.dmg",
    ]);
});

test("stageDesktopInstallers copies installers and writes a manifest", () => {
    const sourceDir = makeTempDir();
    const installRoot = makeTempDir();

    fs.writeFileSync(path.join(sourceDir, "Sitrec-2.34.7-arm64.dmg"), "mac");
    fs.writeFileSync(path.join(sourceDir, "Sitrec Setup 2.34.7.exe"), "win");

    const { downloadsDir, manifest } = stageDesktopInstallers({
        installRoot,
        releaseVersion: "2.34.7",
        sourceDir,
    });

    expect(fs.existsSync(path.join(downloadsDir, "Sitrec-2.34.7-arm64.dmg"))).toBe(true);
    expect(fs.existsSync(path.join(downloadsDir, "Sitrec Setup 2.34.7.exe"))).toBe(true);
    expect(fs.existsSync(path.join(downloadsDir, "manifest.json"))).toBe(true);
    expect(manifest.releaseVersion).toBe("2.34.7");
    expect(manifest.latestByPlatform.windows).toBe("Sitrec Setup 2.34.7.exe");
    expect(manifest.latestByPlatform.macos).toBe("Sitrec-2.34.7-arm64.dmg");
});

test("compareVersionsDescending prefers newer semantic versions", () => {
    expect(compareVersionsDescending("2.34.7", "2.34.6")).toBeLessThan(0);
    expect(compareVersionsDescending("2.34.6", "2.34.7")).toBeGreaterThan(0);
    expect(compareVersionsDescending("2.34.7", "2.34.7")).toBe(0);
});

test("buildPlatformMetadata maps supported installers", () => {
    expect(buildPlatformMetadata("Sitrec-2.34.7-arm64.dmg")).toMatchObject({
        arch: "arm64",
        platform: "macos",
        title: "macOS (Apple Silicon)",
    });

    expect(buildPlatformMetadata("Sitrec Setup 2.34.7.exe")).toMatchObject({
        arch: "x64",
        platform: "windows",
        title: "Windows 10/11",
    });
});

test("extractVersion uses the tag number only", () => {
    expect(extractVersion("Sitrec-2.34.7-arm64.dmg")).toBe("2.34.7");
    expect(extractVersion("Sitrec Setup 2.34.7.exe")).toBe("2.34.7");
});
