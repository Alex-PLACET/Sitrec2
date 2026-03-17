const { assertWindowsSigningConfigured } = require("./windowsSigning");

function printHelp() {
    console.error("Windows signing is required before publishing installers.");
    console.error("");
    console.error("Supported configurations:");
    console.error("1. PFX certificate");
    console.error("   - SITREC_WINDOWS_PUBLISHER_NAME");
    console.error("   - WIN_CSC_LINK or CSC_LINK");
    console.error("     or SITREC_WINDOWS_CERT_FILE");
    console.error("   - WIN_CSC_KEY_PASSWORD / CSC_KEY_PASSWORD");
    console.error("     or SITREC_WINDOWS_CERT_PASSWORD");
    console.error("");
    console.error("2. Azure Trusted Signing");
    console.error("   - SITREC_WINDOWS_PUBLISHER_NAME");
    console.error("   - SITREC_WINDOWS_AZURE_ENDPOINT");
    console.error("   - SITREC_WINDOWS_AZURE_CERTIFICATE_PROFILE_NAME");
    console.error("   - SITREC_WINDOWS_AZURE_CODE_SIGNING_ACCOUNT_NAME");
    console.error("   - AZURE_TENANT_ID");
    console.error("   - AZURE_CLIENT_ID");
    console.error("   - AZURE_CLIENT_SECRET");
    console.error("");
    console.error("If both are configured, set SITREC_WINDOWS_SIGNING_MODE to 'pfx' or 'trusted-signing'.");
}

function main() {
    try {
        const result = assertWindowsSigningConfigured(process.env);
        console.log(`Windows signing ready: ${result.mode} (${result.publisherName})`);
    } catch (error) {
        console.error(String(error.message || error));
        console.error("");
        printHelp();
        process.exit(1);
    }
}

main();
