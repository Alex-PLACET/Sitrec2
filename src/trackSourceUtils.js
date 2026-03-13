// Helpers for deciding whether a FileManager entry is still needed after track
// removal. Imported track files are kept in FileManager for save/reload flows,
// so teardown and serialization both need a shared way to distinguish:
// - files still backing at least one live imported track
// - files that used to back a track but are now orphaned and should disappear

/**
 * Collect the file ids that are still referenced by live, non-synthetic tracks.
 *
 * Synthetic tracks do not have a source file in FileManager, so they must never
 * contribute to this set. The returned ids are FileManager keys, not filenames
 * from inside the asset itself.
 *
 * @param {Object} trackManager
 * @returns {Set<string>}
 */
export function collectActiveTrackSourceFileIDs(trackManager) {
    const activeTrackSourceFileIDs = new Set();

    if (!trackManager || typeof trackManager.iterate !== "function") {
        return activeTrackSourceFileIDs;
    }

    trackManager.iterate((id, trackOb) => {
        if (trackOb?.isSynthetic) {
            return;
        }
        if (typeof trackOb?.trackFileName !== "string" || trackOb.trackFileName.length === 0) {
            return;
        }
        activeTrackSourceFileIDs.add(trackOb.trackFileName);
    });

    return activeTrackSourceFileIDs;
}

/**
 * Check whether a source file is still referenced by any other live imported track.
 *
 * This is used during track disposal: the current track is being removed, so its
 * own id is excluded from the search. If no other imported track points at the
 * file, the FileManager entry can be removed as well.
 *
 * @param {Object} trackManager
 * @param {string} trackFileName
 * @param {string|null} excludedTrackID
 * @returns {boolean}
 */
export function hasOtherTrackSourceReference(trackManager, trackFileName, excludedTrackID = null) {
    if (!trackFileName || !trackManager || typeof trackManager.iterate !== "function") {
        return false;
    }

    let stillReferenced = false;
    trackManager.iterate((id, trackOb) => {
        if (stillReferenced || id === excludedTrackID) {
            return;
        }
        if (trackOb?.isSynthetic) {
            return;
        }
        if (trackOb?.trackFileName === trackFileName) {
            stillReferenced = true;
        }
    });

    return stillReferenced;
}

/**
 * Decide whether a FileManager entry should be written into `loadedFiles`.
 *
 * Ordinary non-track assets should always serialize. Entries marked as former
 * track sources are only serialized when they are still referenced by at least
 * one active imported track, which prevents removed KML/CSV assets from coming
 * back on the next sitch load.
 *
 * @param {string} fileID
 * @param {Object} fileEntry
 * @param {Set<string>} activeTrackSourceFileIDs
 * @returns {boolean}
 */
export function shouldSerializeLoadedFileEntry(fileID, fileEntry, activeTrackSourceFileIDs) {
    if (!fileEntry?.usedAsTrackSource) {
        return true;
    }

    return activeTrackSourceFileIDs.has(fileID);
}
