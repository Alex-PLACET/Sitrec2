const fs = require("node:fs");
const path = require("node:path");

const stagingDir = path.resolve(process.env.SITREC_DESKTOP_OUTPUT_DIR || "/tmp/sitrec-desktop-builds");
const allowedRoots = ["/tmp", "/private/tmp"];

if (!allowedRoots.some((root) => stagingDir === root || stagingDir.startsWith(`${root}/`))) {
    throw new Error(`Refusing to clean non-temporary desktop staging directory: ${stagingDir}`);
}

fs.rmSync(stagingDir, {recursive: true, force: true});
fs.mkdirSync(stagingDir, {recursive: true});

console.log(`Prepared desktop staging directory: ${stagingDir}`);
