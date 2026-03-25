/**
 * NITFParser.js - Parser for NITF (National Imagery Transmission Format) files
 * Supports NITF 2.0 (MIL-STD-2500B) and 2.1 (MIL-STD-2500C)
 *
 * NITF files are container formats for satellite/aerial imagery with rich metadata.
 * This parser extracts image data and geolocation metadata, producing virtual files
 * for both the image (→ video node) and camera track (→ track manager).
 */

import {CTrackFileNITF} from "./TrackFiles/CTrackFileNITF";
import {createImageFromArrayBuffer} from "./FileUtils";
import {decodeJPEG2000ToBlobURL} from "./JPEG2000Utils";

export class NITFParser {

    /**
     * Parse a NITF file and return virtual files for image and track data.
     * Returns an array of {filename, parsed, dataType} objects that parseResult
     * can process (same pattern as zip/TS container extraction).
     *
     * @param {string} filename - Original filename
     * @param {string} id - File ID
     * @param {ArrayBuffer} buffer - Raw NITF file data
     * @returns {Promise<Array<{filename: string, parsed: *, dataType: string}>>}
     */
    static async parseNITFFile(filename, id, buffer) {
        console.log(`NITFParser: Parsing ${filename} (${buffer.byteLength} bytes)`);

        const nitf = this.parseNITF(buffer);
        if (!nitf) {
            console.error("NITFParser: Failed to parse NITF file: " + filename);
            return [];
        }

        console.log(`NITFParser: Found ${nitf.images.length} image segment(s)`);

        const results = [];

        for (let i = 0; i < nitf.images.length; i++) {
            const image = nitf.images[i];

            // Create image virtual file as PNG
            try {
                const pngBuffer = await this.imageToPNG(image);
                if (pngBuffer === null) {
                    // imageToPNG explicitly rejected (e.g. unsupported CADRG VQ)
                    continue;
                }
                const imageFilename = `${filename}_image_${i}.png`;
                const img = await createImageFromArrayBuffer(pngBuffer, 'image/png');

                results.push({
                    filename: imageFilename,
                    parsed: img,
                    dataType: "image"
                });
                console.log(`NITFParser: Created image virtual file: ${imageFilename} (${image.ncols}x${image.nrows})`);
            } catch (e) {
                console.error("NITFParser: Failed to create image:", e);
            }

            // Create track virtual file if we have geolocation
            if (image.corners && image.corners.length === 4) {
                try {
                    const trackFilename = `${filename}_track_${i}.nitftrack`;
                    const trackFile = new CTrackFileNITF({
                        corners: image.corners,
                        datetime: image.datetime || nitf.fileHeader.datetime,
                        title: image.iid2 || nitf.fileHeader.title,
                        tres: image.tres,
                        width: image.ncols,
                        height: image.nrows,
                    });

                    results.push({
                        filename: trackFilename,
                        parsed: trackFile,
                        dataType: "trackfile"
                    });
                    console.log(`NITFParser: Created track virtual file: ${trackFilename}`);
                } catch (e) {
                    console.error("NITFParser: Failed to create track:", e);
                }
            }
        }

        return results;
    }

    /**
     * Check if buffer contains NITF data (magic bytes check)
     * @param {ArrayBuffer} buffer
     * @returns {boolean}
     */
    static isNITF(buffer) {
        if (buffer.byteLength < 9) return false;
        const bytes = new Uint8Array(buffer, 0, 9);
        // "NITF" at offset 0
        return bytes[0] === 0x4E && bytes[1] === 0x49 &&
               bytes[2] === 0x54 && bytes[3] === 0x46;
    }

    /**
     * Parse the complete NITF file structure.
     * @param {ArrayBuffer} buffer
     * @returns {{fileHeader: Object, images: Array}|null}
     */
    static parseNITF(buffer) {
        const bytes = new Uint8Array(buffer);

        const readStr = (offset, length) => {
            let str = '';
            for (let i = 0; i < length; i++) {
                str += String.fromCharCode(bytes[offset + i]);
            }
            return str;
        };

        const readInt = (offset, length) => {
            const s = readStr(offset, length).trim();
            return parseInt(s, 10) || 0;
        };

        // ── File Header ──────────────────────────────────────────
        const fhdr = readStr(0, 4);
        if (fhdr !== 'NITF') {
            console.error('NITFParser: Not a NITF file (magic: ' + fhdr + ')');
            return null;
        }

        const fver = readStr(4, 5);
        const isV21 = (fver === '02.10');
        const isV20 = (fver === '02.00');

        if (!isV21 && !isV20) {
            console.warn('NITFParser: Unsupported NITF version: ' + fver + ', attempting parse as 2.1');
        }

        let pos = 9; // Past FHDR(4) + FVER(5)

        const clevel = readInt(pos, 2); pos += 2;
        /* stype */                      pos += 4;
        const ostaid = readStr(pos, 10).trim(); pos += 10;
        const fdt = readStr(pos, 14); pos += 14;
        const ftitle = readStr(pos, 80).trim(); pos += 80;

        // Security classification + remaining security fields
        const fsclas = readStr(pos, 1); pos += 1;

        // Both NITF 2.0 and 2.1 have 166 bytes of security fields after FSCLAS,
        // but with different internal structure
        if (isV20) {
            const secStart = pos;
            pos += 166; // FSCODE(40)+FSCTLH(40)+FSREL(40)+FSCAUT(20)+FSCTLN(20)+FSDWNG(6)
            const fsdwng = readStr(secStart + 160, 6).trim();
            if (fsdwng === '999998') pos += 40; // FSDEVT
        } else {
            // NITF 2.1: FSCLSY(2)+FSCODE(11)+FSCTLH(2)+FSREL(20)+FSDCTP(2)+FSDCDT(8)+
            //           FSDCXM(4)+FSDG(1)+FSDGDT(8)+FSCLTX(43)+FSCATP(1)+FSCAUT(40)+
            //           FSCRSN(1)+FSSRDT(8)+FSCTLN(15) = 166
            pos += 166;
        }

        /* FSCOP(5) + FSCPYS(5) */  pos += 10;
        /* ENCRYP(1) */              pos += 1;

        if (isV21) {
            /* FBKGC(3) */ pos += 3;
        }

        const oname = readStr(pos, isV21 ? 24 : 27).trim(); pos += (isV21 ? 24 : 27);
        const ophone = readStr(pos, 18).trim(); pos += 18;

        const fl = readInt(pos, 12); pos += 12;
        const hl = readInt(pos, 6); pos += 6;

        // ── Segment counts and lengths ───────────────────────────

        // Image segments
        const numi = readInt(pos, 3); pos += 3;
        const imageSegments = [];
        for (let i = 0; i < numi; i++) {
            const lish = readInt(pos, 6); pos += 6;
            const li = readInt(pos, 10); pos += 10;
            imageSegments.push({subheaderLength: lish, dataLength: li});
        }

        // Graphic/symbol segments
        const nums = readInt(pos, 3); pos += 3;
        for (let i = 0; i < nums; i++) {
            pos += (isV21 ? 4 : 4) + 6; // LSSH(4)+LS(6)
        }

        // Labels (NITF 2.0 only) / Reserved NUMX (NITF 2.1)
        if (isV20) {
            const numl = readInt(pos, 3); pos += 3;
            for (let i = 0; i < numl; i++) {
                pos += 4 + 3; // LLSH(4)+LL(3)
            }
        } else {
            // NITF 2.1: NUMX is a reserved 3-byte field (always "000")
            pos += 3;
        }

        // Text segments
        const numt = readInt(pos, 3); pos += 3;
        for (let i = 0; i < numt; i++) {
            pos += 4 + 5; // LTSH(4)+LT(5)
        }

        // Data extension segments
        const numdes = readInt(pos, 3); pos += 3;
        for (let i = 0; i < numdes; i++) {
            pos += 4 + 9; // LDSH(4)+LD(9)
        }

        // Reserved extension segments
        const numres = readInt(pos, 3); pos += 3;
        for (let i = 0; i < numres; i++) {
            pos += 4 + 7; // LRESH(4)+LRE(7)
        }

        // User-defined header data
        const udhdl = readInt(pos, 5); pos += 5;
        if (udhdl > 0) {
            pos += udhdl; // UDHOFL(3) + UDHD data
        }

        // Extended header data
        const xhdl = readInt(pos, 5); pos += 5;
        if (xhdl > 0) {
            pos += xhdl; // XHDOFL(3) + XHD data
        }

        if (pos !== hl) {
            console.warn(`NITFParser: File header length mismatch: parsed ${pos}, expected ${hl}`);
        }

        // ── Parse image segments ─────────────────────────────────
        const images = [];
        let dataPos = hl;

        for (let i = 0; i < numi; i++) {
            const subPos = dataPos;
            const image = this.parseImageSubheader(bytes, subPos, imageSegments[i].subheaderLength, isV21, isV20);

            image.dataOffset = subPos + imageSegments[i].subheaderLength;
            image.dataLength = imageSegments[i].dataLength;
            image.rawData = new Uint8Array(buffer, image.dataOffset, image.dataLength);

            images.push(image);
            dataPos += imageSegments[i].subheaderLength + imageSegments[i].dataLength;
        }

        return {
            fileHeader: {
                version: fver,
                clevel,
                title: ftitle,
                datetime: this.parseDatetime(fdt),
                classification: fsclas,
                originator: oname,
                phone: ophone,
                fileLength: fl,
                headerLength: hl,
            },
            images
        };
    }

    /**
     * Parse an image subheader starting at the given byte offset.
     */
    static parseImageSubheader(bytes, offset, length, isV21, isV20) {
        const readStr = (pos, len) => {
            let str = '';
            for (let i = 0; i < len; i++) {
                str += String.fromCharCode(bytes[pos + i]);
            }
            return str;
        };
        const readInt = (pos, len) => {
            const s = readStr(pos, len).trim();
            return parseInt(s, 10) || 0;
        };

        let pos = offset;

        /* IM(2) */                        pos += 2;
        const iid1 = readStr(pos, 10).trim(); pos += 10;
        const idatim = readStr(pos, 14);       pos += 14;
        /* TGTID(17) */                        pos += 17;
        const iid2 = readStr(pos, 80).trim();  pos += 80;

        // Image security classification
        /* ISCLAS(1) */  pos += 1;

        // Security fields (166 bytes for both versions, different internal layout)
        if (isV20) {
            const secStart = pos;
            pos += 166;
            const isdwng = readStr(secStart + 160, 6).trim();
            if (isdwng === '999998') pos += 40;
        } else {
            pos += 166;
        }

        /* ENCRYP(1) */  pos += 1;

        const isorce = readStr(pos, 42).trim(); pos += 42;
        const nrows = readInt(pos, 8);           pos += 8;
        const ncols = readInt(pos, 8);           pos += 8;
        const pvtype = readStr(pos, 3).trim();   pos += 3;
        const irep = readStr(pos, 8).trim();     pos += 8;
        const icat = readStr(pos, 8).trim();     pos += 8;
        const abpp = readInt(pos, 2);            pos += 2;
        const pjust = readStr(pos, 1);           pos += 1;
        const icords = readStr(pos, 1);          pos += 1;

        let corners = null;
        // ICORDS: ' ' or 'N' = no coordinates (skip IGEOLO); 'G','D','U','S' = has IGEOLO
        if (icords !== ' ' && icords !== '' && icords !== 'N') {
            const igeolo = readStr(pos, 60);
            pos += 60;
            corners = this.parseIGEOLO(igeolo, icords);
        }

        // Image comments
        const nicom = readInt(pos, 1); pos += 1;
        for (let c = 0; c < nicom; c++) {
            pos += 80; // ICOM_n
        }

        // Compression
        const ic = readStr(pos, 2).trim(); pos += 2;
        let comrat = null;
        if (ic !== 'NC' && ic !== 'NM') {
            comrat = readStr(pos, 4).trim(); pos += 4;
        }

        // Bands
        let nbands = readInt(pos, 1); pos += 1;
        if (nbands === 0) {
            nbands = readInt(pos, 5); pos += 5; // XBANDS
        }

        const bands = [];
        for (let b = 0; b < nbands; b++) {
            const irepband = readStr(pos, 2).trim(); pos += 2;
            /* ISUBCAT(6) */ pos += 6;
            /* IFC(1) */     pos += 1;
            /* IMFLT(3) */   pos += 3;
            const nluts = readInt(pos, 1); pos += 1;

            const luts = [];
            if (nluts > 0) {
                const nelut = readInt(pos, 5); pos += 5;
                for (let l = 0; l < nluts; l++) {
                    luts.push(new Uint8Array(bytes.buffer, bytes.byteOffset + pos, nelut));
                    pos += nelut;
                }
            }
            bands.push({irepband, nluts, luts});
        }

        // Image structure
        /* ISYNC(1) */ pos += 1;
        const imode = readStr(pos, 1); pos += 1;
        const nbpr = readInt(pos, 4);  pos += 4;
        const nbpc = readInt(pos, 4);  pos += 4;
        const nppbh = readInt(pos, 4); pos += 4;
        const nppbv = readInt(pos, 4); pos += 4;
        const nbpp = readInt(pos, 2);  pos += 2;

        /* IDLVL(3) + IALVL(3) + ILOC(10) + IMAG(4) */ pos += 20;

        // TREs in user-defined image data
        let tres = {};
        const udidl = readInt(pos, 5); pos += 5;
        if (udidl > 0) {
            /* UDOFL(3) */ pos += 3;
            const treLen = udidl - 3;
            tres = {...tres, ...this.parseTREs(bytes, pos, treLen)};
            pos += treLen;
        }

        // TREs in extended subheader data
        const ixshdl = readInt(pos, 5); pos += 5;
        if (ixshdl > 0) {
            /* IXSOFL(3) */ pos += 3;
            const treLen = ixshdl - 3;
            tres = {...tres, ...this.parseTREs(bytes, pos, treLen)};
            pos += treLen;
        }

        return {
            iid1, iid2,
            datetime: this.parseDatetime(idatim),
            nrows, ncols,
            pvtype, irep, icat,
            abpp, nbpp, pjust,
            icords, corners,
            ic, comrat,
            nbands, bands,
            imode, nbpr, nbpc, nppbh, nppbv,
            source: isorce,
            tres,
        };
    }

    /**
     * Parse Tagged Record Extensions (TREs).
     * Returns a map of TRE tag → {raw, text, length}.
     */
    static parseTREs(bytes, offset, length) {
        const readStr = (pos, len) => {
            let str = '';
            for (let i = 0; i < len; i++) {
                str += String.fromCharCode(bytes[pos + i]);
            }
            return str;
        };

        const tres = {};
        let pos = offset;
        const end = offset + length;

        while (pos + 11 <= end) {
            const cetag = readStr(pos, 6).trim(); pos += 6;
            const cel = parseInt(readStr(pos, 5), 10); pos += 5;

            if (isNaN(cel) || cel < 0 || pos + cel > end) break;

            tres[cetag] = {
                raw: new Uint8Array(bytes.buffer, bytes.byteOffset + pos, cel),
                text: readStr(pos, Math.min(cel, 1000)), // cap text extraction
                length: cel
            };
            pos += cel;
        }

        return tres;
    }

    /**
     * Parse IGEOLO corner coordinates based on the coordinate system indicator.
     * Returns array of 4 corners: [{lat, lon}, ...] in UL, UR, LR, LL order.
     */
    static parseIGEOLO(igeolo, icords) {
        if (icords === 'G') {
            // Geographic DMS: ddmmssXdddmmssY × 4 corners (15 chars each)
            const corners = [];
            for (let i = 0; i < 4; i++) {
                const part = igeolo.substring(i * 15, (i + 1) * 15);
                const lat = this.parseDMSLat(part.substring(0, 7));
                const lon = this.parseDMSLon(part.substring(7, 15));
                corners.push({lat, lon});
            }
            return corners;
        } else if (icords === 'D') {
            // Decimal degrees: ±dd.ddd±ddd.ddd × 4 corners (15 chars each)
            const corners = [];
            for (let i = 0; i < 4; i++) {
                const part = igeolo.substring(i * 15, (i + 1) * 15);
                const lat = parseFloat(part.substring(0, 7));
                const lon = parseFloat(part.substring(7, 15));
                corners.push({lat, lon});
            }
            return corners;
        }
        console.warn('NITFParser: Unsupported ICORDS type: ' + icords);
        return null;
    }

    /** Parse DMS latitude: ddmmssX where X is N/S */
    static parseDMSLat(str) {
        const d = parseInt(str.substring(0, 2), 10);
        const m = parseInt(str.substring(2, 4), 10);
        const s = parseInt(str.substring(4, 6), 10);
        const hem = str.charAt(6);
        let val = d + m / 60 + s / 3600;
        if (hem === 'S') val = -val;
        return val;
    }

    /** Parse DMS longitude: dddmmssX where X is E/W */
    static parseDMSLon(str) {
        const d = parseInt(str.substring(0, 3), 10);
        const m = parseInt(str.substring(3, 5), 10);
        const s = parseInt(str.substring(5, 7), 10);
        const hem = str.charAt(7);
        let val = d + m / 60 + s / 3600;
        if (hem === 'W') val = -val;
        return val;
    }

    /**
     * Parse NITF datetime string.
     * NITF 2.1: CCYYMMDDhhmmss        (e.g. "20091021203858")
     * NITF 2.0: DDhhmmssZMONYY        (e.g. "19210403ZOCT99")
     */
    static parseDatetime(str) {
        if (!str || str.trim().length < 14) return null;

        const months = {JAN:0, FEB:1, MAR:2, APR:3, MAY:4, JUN:5,
                        JUL:6, AUG:7, SEP:8, OCT:9, NOV:10, DEC:11};

        // Try NITF 2.0 format: DDhhmmssZMONYY (has a 'Z' at position 8 and alpha at 9-11)
        const mon3 = str.substring(9, 12).toUpperCase();
        if (str.charAt(8) === 'Z' && months[mon3] !== undefined) {
            const day = parseInt(str.substring(0, 2), 10);
            const hour = parseInt(str.substring(2, 4), 10);
            const min = parseInt(str.substring(4, 6), 10);
            const sec = parseInt(str.substring(6, 8), 10);
            const yy = parseInt(str.substring(12, 14), 10);
            const year = yy >= 50 ? 1900 + yy : 2000 + yy;
            if (!isNaN(day) && !isNaN(hour)) {
                return new Date(Date.UTC(year, months[mon3], day, hour, min, sec));
            }
        }

        // NITF 2.1 format: CCYYMMDDhhmmss
        const year = parseInt(str.substring(0, 4), 10);
        const month = parseInt(str.substring(4, 6), 10) - 1;
        const day = parseInt(str.substring(6, 8), 10);
        const hour = parseInt(str.substring(8, 10), 10);
        const min = parseInt(str.substring(10, 12), 10);
        const sec = parseInt(str.substring(12, 14), 10);
        if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
        const d = new Date(Date.UTC(year, month, day, hour, min, sec));
        // Reject invalid dates (e.g. NaN components produced garbage)
        if (isNaN(d.getTime())) return null;
        return d;
    }

    /**
     * Convert NITF image pixel data to a PNG ArrayBuffer.
     * Supports uncompressed mono (8/16-bit), RGB, and LUT-based images.
     */
    static async imageToPNG(image) {
        const {nrows, ncols, rawData, abpp, nbands, irep, pvtype, bands, imode,
               nbpr, nbpc, nppbh, nppbv} = image;

        // Handle compressed formats
        if (image.ic === 'M3' || image.ic === 'C3') {
            // Masked/non-masked JPEG — decode per-block using browser Image API
            return this._decodeJPEGBlocked(image);
        }

        if (image.ic === 'C8' || image.ic === 'M8') {
            // JPEG 2000 — decode codestream with jpeg2000 library
            return this._decodeJPEG2000(image);
        }

        if (image.ic === 'C1' || image.ic === 'M1') {
            // CCITT bi-level compression (fax-style 1-bit coding)
            const msg = `This NITF image uses CCITT bi-level compression (IC=${image.ic}, COMRAT=${image.comrat || '?'}).\n\n`
                + `CCITT (Group 3/4) is a fax-style codec for 1-bit black-and-white images, `
                + `typically used for scanned documents, forms, and line drawings. `
                + `It is not used for photographic or satellite imagery.\n\n`
                + `Sitrec does not support CCITT decompression.`;
            console.warn("NITFParser: " + msg);
            alert(msg);
            return null;
        }

        if (image.ic === 'C4' || image.ic === 'M4') {
            // CADRG/CIB Vector Quantization — legacy military raster map format
            const msg = `This is a CADRG/RPF file using Vector Quantization (IC=${image.ic}).\n\n`
                + `CADRG was the standard military digitized chart format from the 1990s–2010s, `
                + `used for Tactical Pilotage Charts, Joint Operations Graphics, and similar products. `
                + `It has been superseded by ECRG, which uses JPEG 2000 compression.\n\n`
                + `Sitrec supports ECRG (.lf2) files but not the legacy CADRG VQ format. `
                + `If you need this chart, look for an ECRG equivalent from NGA.`;
            console.warn("NITFParser: " + msg);
            alert(msg);
            return null; // reject the file
        }

        if (image.ic !== 'NC' && image.ic !== 'NM') {
            console.warn(`NITFParser: Compressed NITF images (IC=${image.ic}) are not yet supported`);
            return this._placeholderPNG(ncols, nrows, `Unsupported compression: ${image.ic}`);
        }

        // De-block the raw data if image uses multiple blocks.
        // Blocked images (NBPR > 1 or NBPC > 1) store pixels block-by-block
        // rather than in raster order. Rearrange to raster order first.
        const isBlocked = nbpr > 1 || nbpc > 1;
        const pixelData = isBlocked
            ? this._deblockData(rawData, nrows, ncols, nbpr, nbpc, nppbh, nppbv, nbands, abpp, imode)
            : rawData;

        const canvas = document.createElement('canvas');
        canvas.width = ncols;
        canvas.height = nrows;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(ncols, nrows);
        const rgba = imageData.data;
        const pixelCount = nrows * ncols;

        if (nbands === 1 && bands.length === 1 && bands[0].nluts > 0) {
            // ── LUT-based (palettized color) ─────────────────────
            const luts = bands[0].luts;
            for (let i = 0; i < pixelCount; i++) {
                const idx = pixelData[i] || 0;
                rgba[i * 4] = luts[0] ? luts[0][idx] : idx;
                rgba[i * 4 + 1] = luts[1] ? luts[1][idx] : (luts[0] ? luts[0][idx] : idx);
                rgba[i * 4 + 2] = luts[2] ? luts[2][idx] : (luts[0] ? luts[0][idx] : idx);
                rgba[i * 4 + 3] = 255;
            }
        } else if ((irep === 'MONO' || nbands === 1) && nbands <= 1) {
            // ── Monochrome ───────────────────────────────────────
            if (abpp <= 8) {
                for (let i = 0; i < pixelCount; i++) {
                    const val = pixelData[i] || 0;
                    rgba[i * 4] = val;
                    rgba[i * 4 + 1] = val;
                    rgba[i * 4 + 2] = val;
                    rgba[i * 4 + 3] = 255;
                }
            } else if (abpp <= 16) {
                // 16-bit mono, big-endian (NITF standard byte order)
                for (let i = 0; i < pixelCount; i++) {
                    const hi = pixelData[i * 2] || 0;
                    const lo = pixelData[i * 2 + 1] || 0;
                    const val16 = (hi << 8) | lo;
                    const val = Math.round(val16 * 255 / 65535);
                    rgba[i * 4] = val;
                    rgba[i * 4 + 1] = val;
                    rgba[i * 4 + 2] = val;
                    rgba[i * 4 + 3] = 255;
                }
            }
        } else if ((irep === 'RGB' || irep === 'RGB/LUT') && nbands >= 3) {
            // ── RGB ──────────────────────────────────────────────
            const bpp = Math.ceil(abpp / 8);

            if (imode === 'P') {
                // Band Interleaved by Pixel: RGBRGBRGB...
                for (let i = 0; i < pixelCount; i++) {
                    const base = i * nbands * bpp;
                    rgba[i * 4] = pixelData[base];
                    rgba[i * 4 + 1] = pixelData[base + bpp];
                    rgba[i * 4 + 2] = pixelData[base + 2 * bpp];
                    rgba[i * 4 + 3] = 255;
                }
            } else if (imode === 'R') {
                // Band Interleaved by Row: R row, G row, B row per image row
                for (let row = 0; row < nrows; row++) {
                    for (let col = 0; col < ncols; col++) {
                        const px = row * ncols + col;
                        const rowBase = row * ncols * nbands * bpp;
                        rgba[px * 4] = pixelData[rowBase + col * bpp];
                        rgba[px * 4 + 1] = pixelData[rowBase + ncols * bpp + col * bpp];
                        rgba[px * 4 + 2] = pixelData[rowBase + 2 * ncols * bpp + col * bpp];
                        rgba[px * 4 + 3] = 255;
                    }
                }
            } else {
                // Band Sequential (S) or Block mode (B): full R plane, full G plane, full B plane
                for (let i = 0; i < pixelCount; i++) {
                    rgba[i * 4] = pixelData[i * bpp];
                    rgba[i * 4 + 1] = pixelData[pixelCount * bpp + i * bpp];
                    rgba[i * 4 + 2] = pixelData[2 * pixelCount * bpp + i * bpp];
                    rgba[i * 4 + 3] = 255;
                }
            }
        } else {
            // ── Fallback: first band as grayscale ────────────────
            console.warn(`NITFParser: Unsupported image representation: ${irep} with ${nbands} bands, using first band as grayscale`);
            for (let i = 0; i < pixelCount; i++) {
                const val = pixelData[i] || 0;
                rgba[i * 4] = val;
                rgba[i * 4 + 1] = val;
                rgba[i * 4 + 2] = val;
                rgba[i * 4 + 3] = 255;
            }
        }

        ctx.putImageData(imageData, 0, 0);

        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        return await blob.arrayBuffer();
    }

    /**
     * Rearrange blocked NITF pixel data into raster order.
     * Blocked images store pixels in block-major order:
     *   Block(0,0), Block(0,1), ..., Block(1,0), Block(1,1), ...
     * Each block contains NPPBH × NPPBV pixels in row-major order.
     * For IMODE='B' with multiple bands, each block stores all bands sequentially.
     */
    static _deblockData(rawData, nrows, ncols, nbpr, nbpc, nppbh, nppbv, nbands, abpp) {
        const bpp = Math.ceil(abpp / 8); // bytes per pixel per band
        const blockPixels = nppbh * nppbv;
        const blockBytes = blockPixels * bpp * nbands;
        const raster = new Uint8Array(nrows * ncols * bpp * nbands);

        for (let bRow = 0; bRow < nbpc; bRow++) {
            for (let bCol = 0; bCol < nbpr; bCol++) {
                const blockIdx = bRow * nbpr + bCol;
                const blockOffset = blockIdx * blockBytes;
                const pixRowStart = bRow * nppbv;
                const pixColStart = bCol * nppbh;

                for (let band = 0; band < nbands; band++) {
                    const bandOffset = blockOffset + band * blockPixels * bpp;
                    const rasterBandOffset = band * nrows * ncols * bpp;

                    for (let ly = 0; ly < nppbv; ly++) {
                        const globalRow = pixRowStart + ly;
                        if (globalRow >= nrows) break; // partial block at bottom edge
                        const srcStart = bandOffset + ly * nppbh * bpp;
                        const dstStart = rasterBandOffset + (globalRow * ncols + pixColStart) * bpp;
                        const copyLen = Math.min(nppbh, ncols - pixColStart) * bpp;
                        raster.set(rawData.subarray(srcStart, srcStart + copyLen), dstStart);
                    }
                }
            }
        }

        return raster;
    }

    /**
     * Decode a JPEG-compressed NITF image (IC='C3' or 'M3').
     * M3 = masked blocked JPEG: has a block offset table followed by per-block JPEG codestreams.
     * C3 = non-masked blocked JPEG: blocks stored contiguously, delimited by JPEG SOI/EOI markers.
     */
    /**
     * Decode a JPEG 2000 (IC=C8/M8) compressed NITF image.
     * Uses the shared JPEG2000Utils which handles sYCC color space and cdef
     * component reordering from the JP2 container.
     *
     * NITF wraps raw J2K codestreams (possibly with leading padding), so we
     * scan for the SOC marker and pass the full data to the shared decoder
     * which also handles JP2 container wrapping if present.
     */
    static async _decodeJPEG2000(image) {
        const {rawData, irep, bands} = image;

        // Check if the image data contains a full JP2 container (starts with JP2
        // signature box before the SOC marker). If so, pass it whole — OpenJPEG
        // reads the colr/cdef boxes and our code extracts ICC TRC curves from it.
        // Otherwise, scan for the J2K SOC marker to skip NITF padding.
        const jp2Sig = this._findJP2Signature(rawData);
        let j2kData;
        if (jp2Sig >= 0) {
            j2kData = rawData.subarray(jp2Sig);
        } else {
            const blocks = this._scanJ2KBlocks(rawData, 1);
            const block = blocks[0];
            j2kData = block
                ? rawData.subarray(block.start, block.start + block.length)
                : rawData;
        }

        // Build color space options from NITF metadata.
        // IREP like "YCbCr601" means YCbCr; IREPBAND per band gives component mapping.
        const options = {};
        if (irep && irep.startsWith('YCbCr')) {
            options.isYCbCr = true;
            // Map band IREPBAND labels to component indices: Y→0, Cb→1, Cr→2
            if (bands && bands.length >= 3) {
                const labelToSlot = {'Y': 0, 'Cb': 1, 'Cr': 2};
                const map = [0, 1, 2]; // default: [Y, Cb, Cr]
                for (let i = 0; i < bands.length; i++) {
                    const label = bands[i].irepband.trim();
                    if (labelToSlot[label] !== undefined) {
                        map[labelToSlot[label]] = i;
                    }
                }
                options.componentMap = map;
            }
        }

        const arrayBuffer = j2kData.buffer.slice(
            j2kData.byteOffset, j2kData.byteOffset + j2kData.byteLength);
        const blobURL = await decodeJPEG2000ToBlobURL(arrayBuffer, options);

        // Convert blob URL to PNG ArrayBuffer for the caller
        const response = await fetch(blobURL);
        const pngBuffer = await response.arrayBuffer();
        URL.revokeObjectURL(blobURL);
        return pngBuffer;
    }

    /**
     * Scan a multi-block C8 image data area for J2K codestream boundaries.
     * J2K codestreams start with SOC marker (0xFF4F) and end with EOC (0xFFD9).
     */
    /**
     * Find JP2 signature box (0x0000000C 6A502020) in raw data.
     * Returns the offset or -1 if not found before any SOC marker.
     */
    static _findJP2Signature(rawData) {
        // JP2 signature: 12-byte box [00 00 00 0C] [6A 50 20 20] [0D 0A 87 0A]
        for (let i = 0; i < Math.min(rawData.length - 12, 4096); i++) {
            if (rawData[i] === 0x00 && rawData[i + 1] === 0x00 &&
                rawData[i + 2] === 0x00 && rawData[i + 3] === 0x0C &&
                rawData[i + 4] === 0x6A && rawData[i + 5] === 0x50 &&
                rawData[i + 6] === 0x20 && rawData[i + 7] === 0x20) {
                return i;
            }
        }
        return -1;
    }

    static _scanJ2KBlocks(rawData, expectedBlocks) {
        const ranges = [];
        let pos = 0;

        while (ranges.length < expectedBlocks && pos < rawData.length - 1) {
            // Find SOC marker (0xFF 0x4F)
            let socPos = -1;
            for (let i = pos; i < rawData.length - 1; i++) {
                if (rawData[i] === 0xFF && rawData[i + 1] === 0x4F) {
                    socPos = i;
                    break;
                }
            }
            if (socPos < 0) break;

            // Find EOC marker (0xFF 0xD9) after SOC
            let eocPos = -1;
            for (let i = socPos + 2; i < rawData.length - 1; i++) {
                if (rawData[i] === 0xFF && rawData[i + 1] === 0xD9) {
                    eocPos = i;
                    break;
                }
            }

            if (eocPos >= 0) {
                const end = eocPos + 2;
                ranges.push({start: socPos, length: end - socPos});
                pos = end;
            } else {
                // No EOC found — assume rest of data is this block
                ranges.push({start: socPos, length: rawData.length - socPos});
                break;
            }
        }

        // Pad with null for any missing blocks
        while (ranges.length < expectedBlocks) {
            ranges.push(null);
        }

        return ranges;
    }

    static async _decodeJPEGBlocked(image) {
        const {nrows, ncols, rawData, nbpr, nbpc, nppbh, nppbv} = image;
        const isMasked = image.ic === 'M3';
        const nblocks = nbpr * nbpc;

        // Browser canvas limits: max ~128M pixels to be safe across browsers.
        // Downscale if the image exceeds this.
        const MAX_PIXELS = 128 * 1024 * 1024;
        const MAX_DIM = 16384;
        let scale = 1;
        if (nrows * ncols > MAX_PIXELS) {
            scale = Math.sqrt(MAX_PIXELS / (nrows * ncols));
        }
        if (nrows * scale > MAX_DIM) scale = MAX_DIM / nrows;
        if (ncols * scale > MAX_DIM) scale = MAX_DIM / ncols;

        const outW = Math.round(ncols * scale);
        const outH = Math.round(nrows * scale);
        if (scale < 1) {
            console.log(`NITFParser: Downscaling ${ncols}×${nrows} → ${outW}×${outH} (scale ${scale.toFixed(3)})`);
        }

        const canvas = document.createElement('canvas');
        canvas.width = outW;
        canvas.height = outH;
        const ctx = canvas.getContext('2d');

        // Fill with black so masked blocks appear black, not white
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, outW, outH);

        // For masked images, parse the block mask table
        let blockRanges; // array of {start, length} or null for masked blocks
        if (isMasked) {
            blockRanges = this._parseMaskedBlockTable(rawData, nblocks);
        } else {
            blockRanges = this._scanJPEGBlocks(rawData, nblocks);
        }

        // Decode each block and paint onto canvas (scaled)
        const decodePromises = [];
        for (let i = 0; i < nblocks; i++) {
            if (!blockRanges[i]) continue; // masked block

            const {start, length} = blockRanges[i];
            const jpegData = rawData.subarray(start, start + length);
            const bCol = i % nbpr;
            const bRow = Math.floor(i / nbpr);
            const x = Math.round(bCol * nppbh * scale);
            const y = Math.round(bRow * nppbv * scale);
            const w = Math.round(nppbh * scale);
            const h = Math.round(nppbv * scale);

            // Decode JPEG using browser's native Image API
            decodePromises.push(this._decodeJPEGBlock(jpegData, ctx, x, y, w, h));
        }

        await Promise.all(decodePromises);

        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        return await blob.arrayBuffer();
    }

    /** Parse the M3 block mask offset table and return per-block data ranges. */
    static _parseMaskedBlockTable(rawData, nblocks) {
        const view = new DataView(rawData.buffer, rawData.byteOffset, rawData.byteLength);
        let pos = 0;

        const imdatoff = view.getUint32(pos); pos += 4;
        const bmrlnth = view.getUint16(pos); pos += 2;
        // tmrlnth(2) + tpxcdlnth(2) — skip for now
        pos += 4;

        // Read block offsets (each bmrlnth bytes, typically 4 = uint32)
        const blockOffsets = [];
        for (let i = 0; i < nblocks; i++) {
            blockOffsets.push(bmrlnth === 4 ? view.getUint32(pos) : 0);
            pos += bmrlnth || 4;
        }

        // Build sorted list of valid (non-masked) offsets for size calculation
        const MASKED = 0xFFFFFFFF;
        const validOffsets = blockOffsets
            .filter(o => o !== MASKED)
            .sort((a, b) => a - b);
        // End sentinel: total compressed data length
        const compDataLen = rawData.byteLength - imdatoff;
        validOffsets.push(compDataLen);

        const ranges = [];
        for (let i = 0; i < nblocks; i++) {
            if (blockOffsets[i] === MASKED) {
                ranges.push(null);
                continue;
            }
            const startInComp = blockOffsets[i];
            const nextIdx = validOffsets.indexOf(startInComp) + 1;
            const endInComp = validOffsets[nextIdx];
            ranges.push({
                start: imdatoff + startInComp,
                length: endInComp - startInComp
            });
        }
        return ranges;
    }

    /** Scan contiguous JPEG codestreams (for non-masked C3 images). */
    static _scanJPEGBlocks(rawData, nblocks) {
        const ranges = [];
        let pos = 0;
        for (let i = 0; i < nblocks; i++) {
            // Find SOI marker (FFD8)
            if (pos + 2 > rawData.length || rawData[pos] !== 0xFF || rawData[pos + 1] !== 0xD8) {
                ranges.push(null);
                continue;
            }
            const start = pos;
            // Scan for EOI marker (FFD9) — safe because JPEG byte-stuffs 0xFF in entropy data
            pos += 2;
            while (pos + 1 < rawData.length) {
                if (rawData[pos] === 0xFF && rawData[pos + 1] === 0xD9) {
                    pos += 2;
                    break;
                }
                pos++;
            }
            ranges.push({start, length: pos - start});
        }
        return ranges;
    }

    /** Decode a single JPEG block and draw it onto the canvas at (x, y) with optional scaling. */
    static _decodeJPEGBlock(jpegData, ctx, x, y, w, h) {
        const blob = new Blob([jpegData], {type: 'image/jpeg'});
        const url = URL.createObjectURL(blob);
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                if (w !== undefined && h !== undefined) {
                    ctx.drawImage(img, x, y, w, h);
                } else {
                    ctx.drawImage(img, x, y);
                }
                URL.revokeObjectURL(url);
                resolve();
            };
            img.onerror = () => {
                console.warn(`NITFParser: Failed to decode JPEG block at (${x}, ${y})`);
                URL.revokeObjectURL(url);
                resolve(); // don't reject — leave the block blank
            };
            img.src = url;
        });
    }

    /** Create a placeholder PNG for unsupported compression modes */
    static async _placeholderPNG(width, height, message) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#333';
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = '#fff';
        ctx.font = '16px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(message, width / 2, height / 2);

        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        return await blob.arrayBuffer();
    }
}
