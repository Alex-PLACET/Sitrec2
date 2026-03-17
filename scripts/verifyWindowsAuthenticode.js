const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { getCurrentTagVersion } = require("./desktopVersion");
const { getWindowsPublisherName } = require("./windowsSigning");

function resolveDefaultInstallerPath() {
    const version = getCurrentTagVersion(path.resolve(__dirname, ".."));
    return path.resolve(__dirname, "..", "apps_dist", `Sitrec Setup ${version}.exe`);
}

function readCertificateDirectory(buffer) {
    if (buffer.length < 0x40) {
        throw new Error("File is too small to be a PE executable");
    }

    const peOffset = buffer.readUInt32LE(0x3c);
    if (peOffset + 4 > buffer.length || buffer.toString("ascii", peOffset, peOffset + 4) !== "PE\0\0") {
        throw new Error("File does not contain a valid PE header");
    }

    const optionalHeaderOffset = peOffset + 4 + 20;
    const magic = buffer.readUInt16LE(optionalHeaderOffset);
    const dataDirectoryOffset = optionalHeaderOffset + (magic === 0x10b ? 96 : 112);
    const certificateEntryOffset = dataDirectoryOffset + (4 * 8);
    const certificateOffset = buffer.readUInt32LE(certificateEntryOffset);
    const certificateSize = buffer.readUInt32LE(certificateEntryOffset + 4);

    return {
        certificateOffset,
        certificateSize,
        dataDirectoryOffset,
        magic,
        peOffset,
    };
}

function extractAuthenticodeSignature(buffer) {
    const directory = readCertificateDirectory(buffer);
    if (!directory.certificateOffset || !directory.certificateSize) {
        return {
            hasSignature: false,
            ...directory,
        };
    }

    const winCertificateLength = buffer.readUInt32LE(directory.certificateOffset);
    const revision = buffer.readUInt16LE(directory.certificateOffset + 4);
    const certificateType = buffer.readUInt16LE(directory.certificateOffset + 6);
    const signatureStart = directory.certificateOffset + 8;
    const signatureEnd = directory.certificateOffset + winCertificateLength;

    if (signatureEnd > buffer.length) {
        throw new Error("The PE certificate directory points outside the file bounds");
    }

    return {
        hasSignature: true,
        certificateType,
        revision,
        signature: buffer.subarray(signatureStart, signatureEnd),
        winCertificateLength,
        ...directory,
    };
}

function parseSubjectsFromPkcs7(signatureBuffer) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sitrec-authenticode-"));
    const signaturePath = path.join(tempDir, "signature.der");
    fs.writeFileSync(signaturePath, signatureBuffer);

    try {
        const output = execFileSync("openssl", ["pkcs7", "-inform", "DER", "-in", signaturePath, "-print_certs", "-noout"], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
        });

        const subjects = output
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line.startsWith("subject="))
            .map((line) => line.replace(/^subject=\s*/, ""));

        return {
            output,
            subjects,
        };
    } finally {
        fs.rmSync(tempDir, { force: true, recursive: true });
    }
}

function verifyWindowsAuthenticode(filePath, expectedPublisher = getWindowsPublisherName(process.env)) {
    const resolvedPath = path.resolve(filePath || resolveDefaultInstallerPath());
    const buffer = fs.readFileSync(resolvedPath);
    const signatureInfo = extractAuthenticodeSignature(buffer);

    if (!signatureInfo.hasSignature) {
        throw new Error(`Windows installer is not Authenticode signed: ${resolvedPath}`);
    }

    let subjects = [];
    try {
        ({ subjects } = parseSubjectsFromPkcs7(signatureInfo.signature));
    } catch (error) {
        console.warn(`Could not inspect embedded signing certificate subjects for ${resolvedPath}: ${error.message}`);
    }

    if (expectedPublisher && subjects.length > 0 && !subjects.some((subject) => subject.includes(expectedPublisher))) {
        throw new Error(
            `Windows installer signature subjects do not include the expected publisher "${expectedPublisher}". Found: ${subjects.join(" | ")}`,
        );
    }

    return {
        filePath: resolvedPath,
        subjects,
        ...signatureInfo,
    };
}

function main() {
    const targetPath = process.argv[2] || resolveDefaultInstallerPath();
    const result = verifyWindowsAuthenticode(targetPath, getWindowsPublisherName(process.env));

    console.log(`Windows Authenticode signature present: ${result.filePath}`);
    if (result.subjects.length > 0) {
        console.log(`Embedded certificate subjects: ${result.subjects.join(" | ")}`);
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    extractAuthenticodeSignature,
    parseSubjectsFromPkcs7,
    readCertificateDirectory,
    verifyWindowsAuthenticode,
};
