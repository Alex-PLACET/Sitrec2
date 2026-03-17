const fs = require("fs");
const path = require("path");
const {
    SHARED_ENV_PATH,
    buildServerlessClientEnv,
    isSensitiveEnvKey,
    loadDotenvFile,
} = require("./serverlessClientEnv");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const DEFAULT_TARGETS = [path.join(PROJECT_ROOT, "dist-serverless")];

const FORBIDDEN_PATH_PATTERNS = [
    /(^|\/)shared\.env(\.php)?$/i,
    /(^|\/)config\.php$/i,
    /(^|\/)sitrecServer(\/|$)/i,
];

const GENERIC_SECRET_PATTERNS = [
    { label: "Mapbox token", regex: /pk\.eyJ[0-9A-Za-z._-]{20,}/g },
    { label: "Google API key", regex: /AIza[0-9A-Za-z_-]{20,}/g },
    { label: "OpenAI-style key", regex: /sk-[A-Za-z0-9_-]{20,}/g },
    { label: "GitHub token", regex: /ghp_[A-Za-z0-9]{20,}/g },
    { label: "Slack token", regex: /xox[baprs]-[A-Za-z0-9-]{10,}/g },
];

function maskValue(value) {
    if (!value || value.length <= 8) {
        return "[masked]";
    }

    return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function collectEnvSecretCandidates() {
    const liveEnv = loadDotenvFile(SHARED_ENV_PATH);
    const candidates = [];

    for (const [key, value] of Object.entries(liveEnv)) {
        const trimmedValue = String(value ?? "").trim();
        if (!trimmedValue || !isSensitiveEnvKey(key)) {
            continue;
        }

        candidates.push({
            label: `Env ${key}`,
            value: trimmedValue,
        });
    }

    return candidates;
}

function collectConfigLiteralCandidates() {
    const configPath = path.join(PROJECT_ROOT, "config", "config.js");
    if (!fs.existsSync(configPath)) {
        return [];
    }

    const configText = fs.readFileSync(configPath, "utf8");
    const candidates = [];
    const literalPatterns = [
        { label: "Config access_token", regex: /access_token=([A-Za-z0-9._-]{10,})/g },
        { label: "Config query key", regex: /\bkey=([A-Za-z0-9._-]{10,})/g },
        { label: "Config Mapbox token", regex: /(pk\.eyJ[0-9A-Za-z._-]{20,})/g },
    ];

    for (const { label, regex } of literalPatterns) {
        let match;
        while ((match = regex.exec(configText)) !== null) {
            const value = match[1];
            if (!value || value.includes("${")) {
                continue;
            }

            candidates.push({ label, value });
        }
    }

    return candidates;
}

function dedupeCandidates(candidates) {
    const seen = new Set();
    return candidates.filter(({ label, value }) => {
        const key = `${label}:${value}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

function expandScanRoots(targetPath) {
    const resolved = path.resolve(targetPath);

    if (!fs.existsSync(resolved)) {
        throw new Error(`Scan target does not exist: ${resolved}`);
    }

    if (resolved.endsWith(".app")) {
        return [path.join(resolved, "Contents", "Resources")];
    }

    return [resolved];
}

function shouldSkipPath(filePath) {
    return filePath.includes(`${path.sep}sitrec-terrain${path.sep}`)
        || filePath.includes(`${path.sep}Frameworks${path.sep}`);
}

function walkFiles(rootPath, files = []) {
    if (!fs.existsSync(rootPath)) {
        return files;
    }

    const stat = fs.statSync(rootPath);
    if (stat.isFile()) {
        if (!shouldSkipPath(rootPath)) {
            files.push(rootPath);
        }
        return files;
    }

    for (const entry of fs.readdirSync(rootPath, { withFileTypes: true })) {
        const fullPath = path.join(rootPath, entry.name);
        if (shouldSkipPath(fullPath)) {
            continue;
        }

        if (entry.isDirectory()) {
            walkFiles(fullPath, files);
        } else if (entry.isFile()) {
            files.push(fullPath);
        }
    }

    return files;
}

function scanFile(filePath, secretCandidates) {
    const findings = [];
    const normalizedPath = filePath.split(path.sep).join("/");

    for (const pattern of FORBIDDEN_PATH_PATTERNS) {
        if (pattern.test(normalizedPath)) {
            findings.push({
                file: filePath,
                issue: "Forbidden server/config file bundled",
            });
            return findings;
        }
    }

    const buffer = fs.readFileSync(filePath);
    const text = buffer.toString("utf8");

    for (const { label, regex } of GENERIC_SECRET_PATTERNS) {
        regex.lastIndex = 0;
        if (regex.test(text)) {
            findings.push({
                file: filePath,
                issue: label,
            });
        }
    }

    for (const { label, value } of secretCandidates) {
        if (buffer.includes(Buffer.from(value))) {
            findings.push({
                file: filePath,
                issue: `${label} (${maskValue(value)})`,
            });
        }
    }

    return findings;
}

function auditTargets(targets) {
    const secretCandidates = dedupeCandidates([
        ...collectEnvSecretCandidates(),
        ...collectConfigLiteralCandidates(),
    ]);

    const findings = [];

    for (const target of targets) {
        for (const scanRoot of expandScanRoots(target)) {
            for (const filePath of walkFiles(scanRoot)) {
                findings.push(...scanFile(filePath, secretCandidates));
            }
        }
    }

    return findings;
}

function main() {
    const targets = process.argv.slice(2);
    const scanTargets = targets.length > 0 ? targets : DEFAULT_TARGETS;
    const findings = auditTargets(scanTargets);

    if (findings.length > 0) {
        console.error("Secret audit failed.");
        for (const finding of findings) {
            console.error(`- ${finding.issue}: ${finding.file}`);
        }
        process.exit(1);
    }

    const sanitizedEnv = buildServerlessClientEnv();
    console.log(
        `Secret audit passed for ${scanTargets.length} target(s). Sanitized ${Object.keys(sanitizedEnv).length} client env values.`,
    );
}

if (require.main === module) {
    main();
}

module.exports = {
    auditTargets,
    collectConfigLiteralCandidates,
    collectEnvSecretCandidates,
    scanFile,
};
