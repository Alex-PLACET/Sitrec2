const fs = require("node:fs");
const path = require("node:path");
const {execFileSync} = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const stagingDir = path.resolve(process.env.SITREC_DESKTOP_OUTPUT_DIR || "/tmp/sitrec-desktop-builds");
const finalDir = path.resolve(process.env.SITREC_DESKTOP_FINAL_OUTPUT_DIR || path.join(repoRoot, "apps_dist"));

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

    fs.rmSync(targetPath, {recursive: true, force: true});
    execFileSync("ditto", [sourcePath, targetPath], {stdio: "inherit"});
    console.log(`Promoted ${sourcePath} -> ${targetPath}`);
}

console.log(`Promoted ${entries.length} desktop artifact(s) into ${finalDir}`);
