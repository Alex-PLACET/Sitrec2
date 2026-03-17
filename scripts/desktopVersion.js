const { execFileSync } = require("node:child_process");
const path = require("node:path");

const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

function normalizeVersion(tag) {
    if (typeof tag !== "string") {
        throw new TypeError("Desktop app version must be a string");
    }

    const normalized = tag.trim().replace(/^v/i, "");
    if (!SEMVER_PATTERN.test(normalized)) {
        throw new Error(`Git tag is not a valid desktop app version: ${tag}`);
    }

    return normalized;
}

function getCurrentTagVersion(repoRoot = path.resolve(__dirname, "..")) {
    const gitTag = execFileSync("git", ["describe", "--tags", "--abbrev=0"], {
        cwd: repoRoot,
        encoding: "utf8",
    });

    return normalizeVersion(gitTag);
}

module.exports = {
    getCurrentTagVersion,
    normalizeVersion,
};
