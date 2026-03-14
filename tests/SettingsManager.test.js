import {sanitizeSettings} from '../src/SettingsManager';

describe('sanitizeSettings', () => {
    test('should sanitize centerSidebar as boolean true', () => {
        const result = sanitizeSettings({ centerSidebar: true });
        expect(result.centerSidebar).toBe(true);
    });

    test('should sanitize centerSidebar as boolean false', () => {
        const result = sanitizeSettings({ centerSidebar: false });
        expect(result.centerSidebar).toBe(false);
    });

    test('should convert truthy value to boolean for centerSidebar', () => {
        const result = sanitizeSettings({ centerSidebar: 1 });
        expect(result.centerSidebar).toBe(true);
    });

    test('should convert falsy value to boolean for centerSidebar', () => {
        const result = sanitizeSettings({ centerSidebar: 0 });
        expect(result.centerSidebar).toBe(false);
    });

    test('should not include centerSidebar when not provided', () => {
        const result = sanitizeSettings({});
        expect(result.centerSidebar).toBeUndefined();
    });

    test('should strip unknown settings', () => {
        const result = sanitizeSettings({ centerSidebar: true, unknownSetting: 'bad' });
        expect(result.centerSidebar).toBe(true);
        expect(result.unknownSetting).toBeUndefined();
    });
});
