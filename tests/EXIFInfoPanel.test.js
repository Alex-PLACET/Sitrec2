/**
 * @jest-environment jsdom
 */

jest.mock('../src/DragResizeUtils', () => ({
    blockViewEvents: jest.fn(),
    makeDraggable: jest.fn(),
}));

jest.mock('../src/Globals', () => ({
    setRenderOne: jest.fn(),
}));

import {makeDraggable} from '../src/DragResizeUtils';
import {setRenderOne} from '../src/Globals';
import {EXIFInfoPanel} from '../src/EXIFInfoPanel.js';

describe('EXIFInfoPanel', () => {
    const visibilityChanges = [];
    const sampleMetadata = {
        raw: {
            ISO: 200,
            Make: 'DJI',
        },
        camera: {
            make: 'DJI',
            model: 'Mavic 3',
            lensModel: 'Hasselblad',
        },
        capture: {
            date: new Date('2024-05-01T12:34:56.000Z'),
        },
        placement: {
            hasLocation: true,
            latitude: 34.123456,
            longitude: -118.654321,
            altitude: 120.5,
            heading: 123.4,
            pitch: -7.8,
            roll: 2.5,
        },
        optics: {
            focalLengthMm: 24,
            focalLength35mm: 24,
            digitalZoomRatio: 1.5,
            verticalFovDeg: 45.67,
            fNumber: 2.8,
            iso: 200,
        },
    };

    let panel;
    let content;

    beforeEach(() => {
        visibilityChanges.length = 0;
        document.body.innerHTML = '<div id="Content"></div>';
        content = document.getElementById('Content');
        Object.defineProperty(content, 'clientWidth', {
            configurable: true,
            value: 1000,
        });

        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: {
                writeText: jest.fn().mockResolvedValue(undefined),
            },
        });

        panel = new EXIFInfoPanel({
            onVisibilityChange: (visible) => visibilityChanges.push(visible),
        });
    });

    afterEach(() => {
        panel?.destroy();
        jest.clearAllMocks();
        document.body.innerHTML = '';
    });

    test('creates a docked resizable panel without a max-width resize cap', () => {
        expect(content.contains(panel.panel)).toBe(true);
        expect(panel.panel.style.width).toBe('380px');
        expect(panel.panel.style.minWidth).toBe('300px');
        expect(panel.panel.style.maxWidth).toBe('');
        expect(panel.panel.style.resize).toBe('both');
        expect(panel.panel.style.left).toBe('596px');
        expect(makeDraggable).toHaveBeenCalledWith(panel.panel, expect.objectContaining({
            handle: panel.titleRow,
            excludeElements: [panel.closeButton, panel.toolbar],
        }));
    });

    test('renders compact EXIF content and updates button states from metadata', () => {
        panel.setMetadata(sampleMetadata, 'photo.jpg');

        expect(panel.titleElement.textContent).toBe('Image EXIF: photo.jpg');
        expect(panel.content.innerHTML).toContain('DJI Mavic 3');
        expect(panel.content.innerHTML).toContain('34.123456, -118.654321 @ 120.5 m');
        expect(panel.content.innerHTML).toContain('123.4 deg');
        expect(panel.copyGPSButton.disabled).toBe(false);
        expect(panel.copyTimeButton.disabled).toBe(false);
        expect(panel.copyRawButton.disabled).toBe(true);
        expect(panel.modeButton.textContent).toBe('Show Raw');
    });

    test('shows, hides, and auto-hides when metadata is cleared', () => {
        panel.setMetadata(sampleMetadata, 'photo.jpg');
        panel.show();

        expect(panel.visible).toBe(true);
        expect(panel.panel.style.display).toBe('flex');
        expect(visibilityChanges).toEqual([true]);

        panel.hide();

        expect(panel.visible).toBe(false);
        expect(panel.panel.style.display).toBe('none');
        expect(visibilityChanges).toEqual([true, false]);

        panel.show();
        panel.setMetadata(null, 'photo.jpg');

        expect(panel.visible).toBe(false);
        expect(panel.panel.style.display).toBe('none');
        expect(visibilityChanges).toEqual([true, false, true, false]);
        expect(setRenderOne).toHaveBeenCalled();
    });

    test('switches to raw mode and copies raw JSON text', async () => {
        panel.setMetadata(sampleMetadata, 'photo.jpg');

        panel.toggleMode();

        expect(panel.mode).toBe('raw');
        expect(panel.modeButton.textContent).toBe('Show Compact');
        expect(panel.copyRawButton.disabled).toBe(false);
        expect(panel.content.querySelector('pre')?.textContent).toContain('"ISO": 200');

        await panel.copyRaw();

        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('"ISO": 200'));
        expect(panel.status.textContent).toBe('Raw EXIF copied');
    });

    test('copies GPS and capture time from compact metadata', async () => {
        panel.setMetadata(sampleMetadata, 'photo.jpg');

        await panel.copyGPS();
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('34.123456, -118.654321 @ 120.5 m');
        expect(panel.status.textContent).toBe('GPS copied');

        await panel.copyCaptureTime();
        expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith('2024-05-01T12:34:56.000Z');
        expect(panel.status.textContent).toBe('Capture time copied');
    });
});