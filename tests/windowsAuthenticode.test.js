const {
    extractAuthenticodeSignature,
    readCertificateDirectory,
} = require("../scripts/verifyWindowsAuthenticode");

function createPeBuffer({ certificateOffset = 0, certificateSize = 0 } = {}) {
    const size = Math.max(512, certificateOffset + certificateSize + 32);
    const buffer = Buffer.alloc(size, 0);
    const peOffset = 0x80;
    const optionalHeaderOffset = peOffset + 4 + 20;
    const dataDirectoryOffset = optionalHeaderOffset + 96;
    const certificateEntryOffset = dataDirectoryOffset + (4 * 8);

    buffer.writeUInt16LE(0x5a4d, 0);
    buffer.writeUInt32LE(peOffset, 0x3c);
    buffer.write("PE\0\0", peOffset, "ascii");
    buffer.writeUInt16LE(0x10b, optionalHeaderOffset);
    buffer.writeUInt32LE(certificateOffset, certificateEntryOffset);
    buffer.writeUInt32LE(certificateSize, certificateEntryOffset + 4);

    if (certificateOffset > 0 && certificateSize > 0) {
        buffer.writeUInt32LE(certificateSize, certificateOffset);
        buffer.writeUInt16LE(0x0200, certificateOffset + 4);
        buffer.writeUInt16LE(0x0002, certificateOffset + 6);
        buffer.fill(0xab, certificateOffset + 8, certificateOffset + certificateSize);
    }

    return buffer;
}

test("readCertificateDirectory reports no signature for unsigned PE files", () => {
    const buffer = createPeBuffer();
    const result = readCertificateDirectory(buffer);

    expect(result.certificateOffset).toBe(0);
    expect(result.certificateSize).toBe(0);
});

test("extractAuthenticodeSignature reads the embedded win certificate blob", () => {
    const buffer = createPeBuffer({ certificateOffset: 0x200, certificateSize: 0x30 });
    const result = extractAuthenticodeSignature(buffer);

    expect(result.hasSignature).toBe(true);
    expect(result.certificateType).toBe(0x0002);
    expect(result.revision).toBe(0x0200);
    expect(result.signature.length).toBe(0x30 - 8);
});
