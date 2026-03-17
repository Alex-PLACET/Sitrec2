const fs = require("node:fs");
const path = require("node:path");

const InstallPaths = require("../config/config-install");
const { getCurrentTagVersion, normalizeVersion } = require("./desktopVersion");

const repoRoot = path.resolve(__dirname, "..");
const defaultSourceDir = path.join(repoRoot, "apps_dist");
const defaultInstallRoot = path.join(InstallPaths.prod_path, "install");
const supportedExtensions = new Set([".dmg", ".exe"]);

function compareVersionsDescending(leftVersion, rightVersion) {
    const leftParts = normalizeVersion(leftVersion).split(/[.+-]/).map((part) => Number.parseInt(part, 10) || 0);
    const rightParts = normalizeVersion(rightVersion).split(/[.+-]/).map((part) => Number.parseInt(part, 10) || 0);
    const maxLength = Math.max(leftParts.length, rightParts.length);

    for (let index = 0; index < maxLength; index += 1) {
        const leftPart = leftParts[index] || 0;
        const rightPart = rightParts[index] || 0;
        if (leftPart !== rightPart) {
            return rightPart - leftPart;
        }
    }

    return 0;
}

function formatBytes(sizeBytes) {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = sizeBytes;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }

    const digits = unitIndex === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2;
    return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

function encodePathSegment(fileName) {
    return encodeURIComponent(fileName).replace(/%2F/g, "/");
}

function extractVersion(fileName) {
    const versionMatch = fileName.match(/(\d+\.\d+\.\d+)/);
    if (!versionMatch) {
        throw new Error(`Could not determine desktop app version from ${fileName}`);
    }

    return normalizeVersion(versionMatch[1]);
}

function buildPlatformMetadata(fileName) {
    const extension = path.extname(fileName).toLowerCase();

    if (extension === ".dmg") {
        const arch = fileName.includes("universal")
            ? "universal"
            : fileName.includes("arm64")
                ? "arm64"
                : "unknown";

        return {
            arch,
            archLabel: arch === "universal" ? "Universal" : arch === "arm64" ? "Apple Silicon" : "Mac",
            ctaLabel: "Download for Mac",
            installerType: "dmg",
            platform: "macos",
            platformLabel: "macOS",
            sortOrder: 1,
            title: arch === "universal" ? "macOS (Universal)" : "macOS (Apple Silicon)",
        };
    }

    if (extension === ".exe") {
        return {
            arch: "x64",
            archLabel: "x64",
            ctaLabel: "Download for Windows",
            installerType: "exe",
            platform: "windows",
            platformLabel: "Windows",
            sortOrder: 0,
            title: "Windows 10/11",
        };
    }

    throw new Error(`Unsupported desktop installer extension: ${extension}`);
}

function isSupportedInstaller(fileName) {
    const extension = path.extname(fileName).toLowerCase();
    if (!supportedExtensions.has(extension)) {
        return false;
    }

    if (/video viewer/i.test(fileName)) {
        return false;
    }

    return /^Sitrec(?: Setup)?[ -]/.test(fileName);
}

function createInstallerRecord(sourceDir, dirent) {
    const fileName = dirent.name;
    const sourcePath = path.join(sourceDir, fileName);
    const stats = fs.statSync(sourcePath);
    const metadata = buildPlatformMetadata(fileName);
    const version = extractVersion(fileName);

    return {
        ...metadata,
        fileName,
        modifiedAt: stats.mtime.toISOString(),
        sizeBytes: stats.size,
        sizeHuman: formatBytes(stats.size),
        sourcePath,
        url: `./downloads/${encodePathSegment(fileName)}`,
        version,
    };
}

function collectDesktopInstallers(sourceDir = defaultSourceDir) {
    if (!fs.existsSync(sourceDir)) {
        throw new Error(`Desktop artifact directory does not exist: ${sourceDir}`);
    }

    const installers = fs.readdirSync(sourceDir, { withFileTypes: true })
        .filter((dirent) => dirent.isFile() && isSupportedInstaller(dirent.name))
        .map((dirent) => createInstallerRecord(sourceDir, dirent))
        .sort((left, right) => {
            const versionComparison = compareVersionsDescending(left.version, right.version);
            if (versionComparison !== 0) {
                return versionComparison;
            }

            if (left.sortOrder !== right.sortOrder) {
                return left.sortOrder - right.sortOrder;
            }

            return left.fileName.localeCompare(right.fileName);
        });

    if (installers.length === 0) {
        throw new Error(`No installable Sitrec desktop artifacts were found in ${sourceDir}`);
    }

    return installers;
}

function createManifest(downloads, releaseVersion) {
    const latestByPlatform = {};

    for (const download of downloads) {
        if (!latestByPlatform[download.platform]) {
            latestByPlatform[download.platform] = download.fileName;
        }
    }

    return {
        generatedAt: new Date().toISOString(),
        latestByPlatform,
        releaseVersion,
        downloads: downloads.map(({ sourcePath, sortOrder, ...download }) => download),
    };
}

function stageDesktopInstallers({
    sourceDir = defaultSourceDir,
    installRoot = defaultInstallRoot,
    releaseVersion = getCurrentTagVersion(repoRoot),
} = {}) {
    const normalizedReleaseVersion = normalizeVersion(releaseVersion);
    const downloadsDir = path.join(installRoot, "downloads");
    const downloads = collectDesktopInstallers(sourceDir);
    const manifest = createManifest(downloads, normalizedReleaseVersion);

    fs.rmSync(downloadsDir, { force: true, recursive: true });
    fs.mkdirSync(downloadsDir, { recursive: true });

    for (const download of downloads) {
        fs.copyFileSync(download.sourcePath, path.join(downloadsDir, download.fileName));
    }

    fs.writeFileSync(
        path.join(downloadsDir, "manifest.json"),
        `${JSON.stringify(manifest, null, 2)}\n`,
        "utf8",
    );

    return {
        downloadsDir,
        manifest,
    };
}

function main() {
    const sourceDir = path.resolve(process.argv[2] || process.env.SITREC_APP_SOURCE_DIR || defaultSourceDir);
    const installRoot = path.resolve(process.argv[3] || process.env.SITREC_INSTALL_OUTPUT_DIR || defaultInstallRoot);
    const { downloadsDir, manifest } = stageDesktopInstallers({ installRoot, sourceDir });

    console.log(`Staged ${manifest.downloads.length} desktop installer(s) into ${downloadsDir}`);
    console.log(`Release version: ${manifest.releaseVersion}`);
}

if (require.main === module) {
    main();
}

module.exports = {
    buildPlatformMetadata,
    collectDesktopInstallers,
    compareVersionsDescending,
    createManifest,
    extractVersion,
    formatBytes,
    isSupportedInstaller,
    stageDesktopInstallers,
};
