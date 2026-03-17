const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const defaultStagingDir = process.platform === "win32"
    ? path.join(os.tmpdir(), "sitrec-desktop-builds")
    : "/tmp/sitrec-desktop-builds";
const stagingDir = path.resolve(process.env.SITREC_DESKTOP_OUTPUT_DIR || defaultStagingDir);

const allowedRoots = process.platform === "win32"
    ? [path.resolve(os.tmpdir())]
    : ["/tmp", "/private/tmp"];

if (!allowedRoots.some((root) => stagingDir === root || stagingDir.startsWith(`${root}/`))) {
    throw new Error(`Refusing to clean non-temporary desktop staging directory: ${stagingDir}`);
}

fs.rmSync(stagingDir, {recursive: true, force: true});
fs.mkdirSync(stagingDir, {recursive: true});

console.log(`Prepared desktop staging directory: ${stagingDir}`);
