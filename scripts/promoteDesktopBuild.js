const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const defaultStagingDir = process.platform === "win32"
    ? path.join(os.tmpdir(), "sitrec-desktop-builds")
    : "/tmp/sitrec-desktop-builds";
const stagingDir = path.resolve(process.env.SITREC_DESKTOP_OUTPUT_DIR || defaultStagingDir);
const finalDir = path.resolve(process.env.SITREC_DESKTOP_FINAL_OUTPUT_DIR || path.join(repoRoot, "apps_dist"));

function removePathIfPresent(targetPath) {
    fs.rmSync(targetPath, {
        force: true,
        maxRetries: 5,
        recursive: true,
        retryDelay: 200,
    });
}

function copyEntry(sourcePath, targetPath) {
    fs.cpSync(sourcePath, targetPath, {
        dereference: false,
        errorOnExist: false,
        force: true,
        recursive: true,
    });
}

function prepareTargetPath(targetPath, sourcePath) {
    if (!fs.existsSync(targetPath)) {
        return null;
    }

    const sourceStats = fs.statSync(sourcePath);
    if (!sourceStats.isDirectory()) {
        removePathIfPresent(targetPath);
        return null;
    }

    const backupPath = `${targetPath}.previous`;
    removePathIfPresent(backupPath);
    fs.renameSync(targetPath, backupPath);
    return backupPath;
}

if (!fs.existsSync(stagingDir)) {
    throw new Error(`Desktop staging directory does not exist: ${stagingDir}`);
}

const entries = fs.readdirSync(stagingDir, {withFileTypes: true})
    .filter((entry) => !entry.name.startsWith("."));

if (entries.length === 0) {
    throw new Error(`Desktop staging directory is empty: ${stagingDir}`);
}

fs.mkdirSync(finalDir, {recursive: true});

for (const entry of entries) {
    const sourcePath = path.join(stagingDir, entry.name);
    const targetPath = path.join(finalDir, entry.name);
    const backupPath = prepareTargetPath(targetPath, sourcePath);

    copyEntry(sourcePath, targetPath);
    if (backupPath) {
        try {
            removePathIfPresent(backupPath);
        } catch (error) {
            console.warn(`Could not remove previous desktop artifact backup at ${backupPath}:`, error);
        }
    }
    console.log(`Promoted ${sourcePath} -> ${targetPath}`);
}

console.log(`Promoted ${entries.length} desktop artifact(s) into ${finalDir}`);
