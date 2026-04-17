// BYOKKeyStore.js
// Local-only storage for user-provided LLM API keys (Bring Your Own Key).
//
// Keys live in IndexedDB under the "byok_<provider>" naming convention. They
// are deliberately kept OUT of Globals.settings so they never flow through
// sanitizeSettings(), saveSettingsToCookie(), or saveSettingsToServer() —
// i.e. they never touch the server or cookies.
//
// The server-side sanitizer in settings.php is a whitelist and already strips
// unknown fields, so even a bug that accidentally put a BYOK key into
// Globals.settings would be scrubbed before it could be persisted remotely.
// Using a separate key namespace here is defense-in-depth.

import { indexedDBManager } from './IndexedDBManager';

const KEY_PREFIX = 'byok_';

function storageKey(provider) {
    return KEY_PREFIX + provider;
}

export async function getKey(provider) {
    if (!provider) return null;
    try {
        return await indexedDBManager.getSetting(storageKey(provider));
    } catch (e) {
        return null;
    }
}

export async function setKey(provider, key) {
    if (!provider) throw new Error('provider required');
    await indexedDBManager.setSetting(storageKey(provider), key);
}

export async function deleteKey(provider) {
    if (!provider) return;
    await indexedDBManager.deleteSetting(storageKey(provider));
}

// Returns an array of provider names that currently have a non-empty stored key.
export async function getAllProviders() {
    try {
        const all = await indexedDBManager.getAllSettings();
        return Object.keys(all)
            .filter(k => k.startsWith(KEY_PREFIX) && all[k])
            .map(k => k.slice(KEY_PREFIX.length));
    } catch (e) {
        return [];
    }
}

export async function hasAnyKey() {
    const providers = await getAllProviders();
    return providers.length > 0;
}
