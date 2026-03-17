const {
    appendWindowsSigningArgs,
    assertWindowsSigningConfigured,
    getWindowsSigningMode,
    signingModeNames,
} = require("../scripts/windowsSigning");

test("detects pfx signing mode from CSC_LINK", () => {
    const env = {
        CSC_LINK: "file:///tmp/cert.pfx",
        SITREC_WINDOWS_PUBLISHER_NAME: "Metabunk LLC",
    };

    expect(getWindowsSigningMode(env)).toBe(signingModeNames.pfx);

    const args = [];
    const result = appendWindowsSigningArgs(args, env);

    expect(result.mode).toBe(signingModeNames.pfx);
    expect(args).toContain("-c.win.publisherName=Metabunk LLC");
    expect(args).toContain("-c.win.signtoolOptions.publisherName=Metabunk LLC");
});

test("detects trusted signing mode and injects azure config", () => {
    const env = {
        AZURE_CLIENT_ID: "client-id",
        AZURE_CLIENT_SECRET: "client-secret",
        AZURE_TENANT_ID: "tenant-id",
        SITREC_WINDOWS_AZURE_CERTIFICATE_PROFILE_NAME: "profile",
        SITREC_WINDOWS_AZURE_CODE_SIGNING_ACCOUNT_NAME: "account",
        SITREC_WINDOWS_AZURE_ENDPOINT: "https://westus.codesigning.azure.net/",
        SITREC_WINDOWS_PUBLISHER_NAME: "Metabunk LLC",
    };

    expect(getWindowsSigningMode(env)).toBe(signingModeNames.trustedSigning);

    const args = [];
    appendWindowsSigningArgs(args, env);

    expect(args).toContain("-c.win.azureSignOptions.publisherName=Metabunk LLC");
    expect(args).toContain("-c.win.azureSignOptions.endpoint=https://westus.codesigning.azure.net/");
});

test("rejects publishing when signing is not configured", () => {
    expect(() => assertWindowsSigningConfigured({})).toThrow(/No Windows signing credentials/);
});

test("rejects ambiguous signing config without explicit mode", () => {
    const env = {
        CSC_LINK: "file:///tmp/cert.pfx",
        SITREC_WINDOWS_AZURE_CERTIFICATE_PROFILE_NAME: "profile",
        SITREC_WINDOWS_AZURE_CODE_SIGNING_ACCOUNT_NAME: "account",
        SITREC_WINDOWS_AZURE_ENDPOINT: "https://westus.codesigning.azure.net/",
        SITREC_WINDOWS_PUBLISHER_NAME: "Metabunk LLC",
    };

    expect(() => getWindowsSigningMode(env)).toThrow(/Multiple Windows signing modes/);
});
