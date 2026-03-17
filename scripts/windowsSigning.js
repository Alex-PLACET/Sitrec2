const path = require("node:path");

const signingModeNames = {
    none: "none",
    pfx: "pfx",
    trustedSigning: "trusted-signing",
};

const trustedSigningConfigKeys = [
    "SITREC_WINDOWS_AZURE_ENDPOINT",
    "SITREC_WINDOWS_AZURE_CERTIFICATE_PROFILE_NAME",
    "SITREC_WINDOWS_AZURE_CODE_SIGNING_ACCOUNT_NAME",
];

function normalizeEnvValue(value) {
    if (typeof value !== "string") {
        return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
}

function getWindowsPublisherName(env = process.env) {
    return normalizeEnvValue(env.SITREC_WINDOWS_PUBLISHER_NAME);
}

function getPreferredSigningMode(env = process.env) {
    const preferred = normalizeEnvValue(env.SITREC_WINDOWS_SIGNING_MODE);
    if (!preferred) {
        return null;
    }

    if (preferred !== signingModeNames.pfx && preferred !== signingModeNames.trustedSigning) {
        throw new Error(`Unsupported SITREC_WINDOWS_SIGNING_MODE value: ${preferred}`);
    }

    return preferred;
}

function hasPfxSigningConfig(env = process.env) {
    return Boolean(
        normalizeEnvValue(env.WIN_CSC_LINK)
        || normalizeEnvValue(env.CSC_LINK)
        || normalizeEnvValue(env.SITREC_WINDOWS_CERT_FILE),
    );
}

function hasTrustedSigningConfig(env = process.env) {
    return trustedSigningConfigKeys.every((key) => Boolean(normalizeEnvValue(env[key])));
}

function getAvailableSigningModes(env = process.env) {
    const modes = [];

    if (hasPfxSigningConfig(env)) {
        modes.push(signingModeNames.pfx);
    }

    if (hasTrustedSigningConfig(env)) {
        modes.push(signingModeNames.trustedSigning);
    }

    return modes;
}

function getWindowsSigningMode(env = process.env) {
    const availableModes = getAvailableSigningModes(env);
    const preferredMode = getPreferredSigningMode(env);

    if (preferredMode) {
        if (!availableModes.includes(preferredMode)) {
            throw new Error(`SITREC_WINDOWS_SIGNING_MODE=${preferredMode} was requested, but its required configuration is incomplete`);
        }

        return preferredMode;
    }

    if (availableModes.length > 1) {
        throw new Error(
            "Multiple Windows signing modes are configured. Set SITREC_WINDOWS_SIGNING_MODE to either 'pfx' or 'trusted-signing'.",
        );
    }

    return availableModes[0] || signingModeNames.none;
}

function getSigningConfigurationProblems(env = process.env) {
    const problems = [];
    const mode = getWindowsSigningMode(env);

    if (mode === signingModeNames.none) {
        problems.push(
            "No Windows signing credentials were found. Configure either a PFX certificate or Azure Trusted Signing.",
        );
        return problems;
    }

    if (!getWindowsPublisherName(env)) {
        problems.push("SITREC_WINDOWS_PUBLISHER_NAME is required and must match the certificate Common Name exactly.");
    }

    if (mode === signingModeNames.pfx && normalizeEnvValue(env.SITREC_WINDOWS_CERT_FILE)) {
        const certificatePassword = normalizeEnvValue(env.SITREC_WINDOWS_CERT_PASSWORD)
            || normalizeEnvValue(env.WIN_CSC_KEY_PASSWORD)
            || normalizeEnvValue(env.CSC_KEY_PASSWORD);
        if (!certificatePassword) {
            problems.push(
                "A local PFX file was configured via SITREC_WINDOWS_CERT_FILE, but no certificate password was provided.",
            );
        }
    }

    if (mode === signingModeNames.trustedSigning) {
        const azureIdentityPresent = Boolean(normalizeEnvValue(env.AZURE_TENANT_ID))
            && Boolean(normalizeEnvValue(env.AZURE_CLIENT_ID))
            && Boolean(
                normalizeEnvValue(env.AZURE_CLIENT_SECRET)
                || normalizeEnvValue(env.AZURE_CLIENT_CERTIFICATE_PATH)
                || normalizeEnvValue(env.AZURE_USERNAME),
            );

        if (!azureIdentityPresent) {
            problems.push(
                "Azure Trusted Signing is configured, but Azure authentication env vars are incomplete. Usually AZURE_TENANT_ID, AZURE_CLIENT_ID, and AZURE_CLIENT_SECRET are needed.",
            );
        }
    }

    return problems;
}

function assertWindowsSigningConfigured(env = process.env) {
    const problems = getSigningConfigurationProblems(env);
    if (problems.length > 0) {
        throw new Error(problems.join("\n"));
    }

    return {
        mode: getWindowsSigningMode(env),
        publisherName: getWindowsPublisherName(env),
    };
}

function maybePushConfigArg(args, key, value) {
    const normalized = normalizeEnvValue(value);
    if (normalized) {
        args.push(`-c.${key}=${path.isAbsolute(normalized) ? normalized : normalized}`);
    }
}

function appendWindowsSigningArgs(args, env = process.env) {
    const mode = getWindowsSigningMode(env);
    if (mode === signingModeNames.none) {
        return {
            args,
            mode,
            publisherName: null,
        };
    }

    const publisherName = getWindowsPublisherName(env);
    if (!publisherName) {
        throw new Error("SITREC_WINDOWS_PUBLISHER_NAME must be set before Windows signing options can be added.");
    }

    args.push(`-c.win.publisherName=${publisherName}`);

    if (mode === signingModeNames.trustedSigning) {
        args.push(`-c.win.azureSignOptions.publisherName=${publisherName}`);
        args.push(`-c.win.azureSignOptions.endpoint=${normalizeEnvValue(env.SITREC_WINDOWS_AZURE_ENDPOINT)}`);
        args.push(`-c.win.azureSignOptions.certificateProfileName=${normalizeEnvValue(env.SITREC_WINDOWS_AZURE_CERTIFICATE_PROFILE_NAME)}`);
        args.push(`-c.win.azureSignOptions.codeSigningAccountName=${normalizeEnvValue(env.SITREC_WINDOWS_AZURE_CODE_SIGNING_ACCOUNT_NAME)}`);
        maybePushConfigArg(args, "win.azureSignOptions.fileDigest", env.SITREC_WINDOWS_AZURE_FILE_DIGEST);
        maybePushConfigArg(args, "win.azureSignOptions.timestampDigest", env.SITREC_WINDOWS_AZURE_TIMESTAMP_DIGEST);
        maybePushConfigArg(args, "win.azureSignOptions.timestampRfc3161", env.SITREC_WINDOWS_AZURE_TIMESTAMP_RFC3161);

        return {
            args,
            mode,
            publisherName,
        };
    }

    args.push(`-c.win.signtoolOptions.publisherName=${publisherName}`);
    maybePushConfigArg(args, "win.signtoolOptions.certificateFile", env.SITREC_WINDOWS_CERT_FILE ? path.resolve(env.SITREC_WINDOWS_CERT_FILE) : null);
    maybePushConfigArg(args, "win.signtoolOptions.certificatePassword", env.SITREC_WINDOWS_CERT_PASSWORD);
    maybePushConfigArg(args, "win.signtoolOptions.certificateSubjectName", env.SITREC_WINDOWS_CERT_SUBJECT_NAME);
    maybePushConfigArg(args, "win.signtoolOptions.certificateSha1", env.SITREC_WINDOWS_CERT_SHA1);
    maybePushConfigArg(args, "win.signtoolOptions.timeStampServer", env.SITREC_WINDOWS_TIME_STAMP_SERVER);
    maybePushConfigArg(args, "win.signtoolOptions.rfc3161TimeStampServer", env.SITREC_WINDOWS_RFC3161_TIME_STAMP_SERVER);

    return {
        args,
        mode,
        publisherName,
    };
}

module.exports = {
    appendWindowsSigningArgs,
    assertWindowsSigningConfigured,
    getAvailableSigningModes,
    getPreferredSigningMode,
    getSigningConfigurationProblems,
    getWindowsPublisherName,
    getWindowsSigningMode,
    hasPfxSigningConfig,
    hasTrustedSigningConfig,
    normalizeEnvValue,
    signingModeNames,
};
