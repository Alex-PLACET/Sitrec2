// Mock IndexedDBManager before importing BYOKKeyStore so the store uses the mock.
jest.mock('../src/IndexedDBManager', () => {
    const store = new Map();
    return {
        indexedDBManager: {
            async getSetting(key) { return store.has(key) ? store.get(key) : null; },
            async setSetting(key, value) { store.set(key, value); },
            async deleteSetting(key) { store.delete(key); },
            async getAllSettings() {
                const obj = {};
                for (const [k, v] of store.entries()) obj[k] = v;
                return obj;
            },
            _reset() { store.clear(); },
            _internal: store,
        },
    };
});

import { indexedDBManager } from '../src/IndexedDBManager';
import {
    getKey, setKey, deleteKey, getAllProviders, hasAnyKey,
} from '../src/BYOKKeyStore';

beforeEach(() => {
    indexedDBManager._reset();
});

describe('BYOKKeyStore', () => {
    test('getKey returns null for unknown provider', async () => {
        expect(await getKey('anthropic')).toBeNull();
    });

    test('setKey and getKey round-trip', async () => {
        await setKey('anthropic', 'sk-ant-test-123');
        expect(await getKey('anthropic')).toBe('sk-ant-test-123');
    });

    test('setKey stores under byok_ prefix (not in the general settings namespace)', async () => {
        await setKey('anthropic', 'sk-ant-xyz');
        expect(indexedDBManager._internal.has('byok_anthropic')).toBe(true);
        expect(indexedDBManager._internal.has('anthropic')).toBe(false);
        expect(indexedDBManager._internal.has('chatModel')).toBe(false);
    });

    test('deleteKey removes the stored key', async () => {
        await setKey('anthropic', 'sk-ant-xyz');
        expect(await getKey('anthropic')).toBe('sk-ant-xyz');
        await deleteKey('anthropic');
        expect(await getKey('anthropic')).toBeNull();
    });

    test('getAllProviders lists only byok_ keys with non-empty values', async () => {
        await setKey('anthropic', 'sk-ant-xyz');
        await setKey('openai', 'sk-openai-abc');
        // Simulate an unrelated setting stored by the regular settings path
        await indexedDBManager.setSetting('chatModel', 'server:anthropic:claude');
        // Simulate an empty BYOK key (should be filtered)
        await indexedDBManager.setSetting('byok_empty', '');

        const providers = await getAllProviders();
        expect(providers.sort()).toEqual(['anthropic', 'openai']);
    });

    test('hasAnyKey reflects current key presence', async () => {
        expect(await hasAnyKey()).toBe(false);
        await setKey('anthropic', 'sk-ant-xyz');
        expect(await hasAnyKey()).toBe(true);
        await deleteKey('anthropic');
        expect(await hasAnyKey()).toBe(false);
    });

    test('getKey with empty provider returns null without throwing', async () => {
        expect(await getKey('')).toBeNull();
        expect(await getKey(null)).toBeNull();
        expect(await getKey(undefined)).toBeNull();
    });

    test('setKey with empty provider throws', async () => {
        await expect(setKey('', 'key')).rejects.toThrow('provider required');
    });
});
