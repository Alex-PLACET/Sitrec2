const { execFileSync } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");

const { getCurrentTagVersion } = require("./desktopVersion");
const { appendWindowsSigningArgs } = require("./windowsSigning");

const repoRoot = path.resolve(__dirname, "..");
const appDir = path.join(repoRoot, "apps", "video-viewer");

function getDefaultStagingDir() {
    if (process.platform === "win32") {
        return path.join(os.tmpdir(), "sitrec-desktop-builds");
    }

    return "/tmp/sitrec-desktop-builds";
}

function getOutputDir(mode) {
    if (mode === "final") {
        return path.join(repoRoot, "apps_dist");
    }

    return path.resolve(process.env.SITREC_DESKTOP_OUTPUT_DIR || getDefaultStagingDir());
}

function parseArgs(argv) {
    const options = {
        arch: null,
        output: "staging",
        platform: null,
        target: null,
        noSign: false,
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];

        if (arg === "--platform") {
            options.platform = argv[index + 1];
            index += 1;
            continue;
        }

        if (arg === "--target") {
            options.target = argv[index + 1];
            index += 1;
            continue;
        }

        if (arg === "--arch") {
            options.arch = argv[index + 1];
            index += 1;
            continue;
        }

        if (arg === "--output") {
            options.output = argv[index + 1];
            index += 1;
            continue;
        }

        if (arg === "--no-sign") {
            options.noSign = true;
            continue;
        }

        throw new Error(`Unknown argument: ${arg}`);
    }

    if (!options.platform) {
        throw new Error("Missing required --platform argument");
    }

    if (!options.target) {
        throw new Error("Missing required --target argument");
    }

    if (!options.arch) {
        throw new Error("Missing required --arch argument");
    }

    return options;
}

function buildCommandArgs(options) {
    const version = getCurrentTagVersion(repoRoot);
    const args = [
        "electron-builder",
        `--${options.platform}`,
        `--${options.arch}`,
        `-c.extraMetadata.version=${version}`,
        `-c.directories.output=${getOutputDir(options.output)}`,
    ];

    if (options.target === "dir") {
        args.splice(2, 0, "--dir");
    }

    if (options.noSign && options.platform === "mac") {
        args.push("-c.mac.identity=null");
    }

    if (options.platform === "win") {
        const result = appendWindowsSigningArgs(args, process.env);
        if (result.mode === "none") {
            console.warn("Building Windows installer without code signing configuration.");
        } else {
            console.log(`Using Windows signing mode: ${result.mode} (${result.publisherName})`);
        }
    }

    return args;
}

function buildEnv(options) {
    const env = { ...process.env };

    if (options.noSign && options.platform === "mac") {
        env.CSC_IDENTITY_AUTO_DISCOVERY = "false";
    }

    return env;
}

function run() {
    const options = parseArgs(process.argv.slice(2));
    const command = process.platform === "win32" ? "npx.cmd" : "npx";
    const args = buildCommandArgs(options);

    console.log(`Building desktop app version ${getCurrentTagVersion(repoRoot)}`);
    execFileSync(command, args, {
        cwd: appDir,
        env: buildEnv(options),
        stdio: "inherit",
    });
}

run();
