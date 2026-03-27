/**
 * @jest-environment jsdom
 */

const mockNodeGet = jest.fn();
const mockMarkSitchDirty = jest.fn();

jest.mock('../src/Globals', () => ({
    CustomManager: {},
    FileManager: {list: {}},
    GlobalDateTimeNode: {setStartDateTime: jest.fn()},
    Globals: {sitchDirty: false},
    guiMenus: {},
    markSitchDirty: (...args) => mockMarkSitchDirty(...args),
    NodeMan: {get: (...args) => mockNodeGet(...args)},
    Sit: {},
    TrackManager: {},
    UndoManager: {},
}));

jest.mock('../src/configUtils', () => ({
    isLocal: false,
}));

jest.mock('../src/showError', () => ({
    showError: jest.fn(),
}));

jest.mock('../src/js/lil-gui.esm', () => {
    return jest.fn().mockImplementation(function MockGUI() {});
});

jest.mock('../src/nodes/CNode3DObject', () => ({
    ModelFiles: {},
}));

jest.mock('../src/par', () => ({
    par: {},
}));

jest.mock('../src/CViewManager', () => ({
    ViewMan: {
        updateViewFromPreset: jest.fn(),
        iterate: jest.fn(),
        get: jest.fn(),
    },
}));

jest.mock('../src/PageStructure', () => ({
    areControlsHidden: jest.fn(() => false),
    toggleControlsVisibility: jest.fn(),
}));

jest.mock('../src/utils', () => ({
    closeFullscreen: jest.fn(),
    isFullscreen: jest.fn(() => false),
    openFullscreen: jest.fn(),
}));

jest.mock('../src/nodes/CNodeViewUI', () => ({
    forceUpdateUIText: jest.fn(),
}));

import {sitrecAPI} from '../src/CSitrecAPI.js';

describe('CSitrecAPI importMedia', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('imports media into the current video node', async () => {
        const videoNode = {
            videos: [
                {fileName: 'photo.jpg', staticURL: undefined, imageFileID: 'photo.jpg'},
                {fileName: 'clip.mp4', staticURL: 'clip.mp4', imageFileID: undefined},
            ],
            currentVideoIndex: 1,
            newVideo: jest.fn(),
        };
        mockNodeGet.mockImplementation((id) => {
            if (id === 'video') return videoNode;
            return false;
        });

        const result = await sitrecAPI.call('importMedia', {file: 'data/photo.jpg'});

        expect(videoNode.newVideo).toHaveBeenCalledWith('photo.jpg', false);
        expect(mockMarkSitchDirty).toHaveBeenCalled();
        expect(result).toEqual({
            success: true,
            fn: 'importMedia',
            result: {
                success: true,
                imported: true,
                pending: true,
                file: 'photo.jpg',
            },
        });
    });

    test('uses clearFrames on the first imported media entry', async () => {
        const videoNode = {
            videos: [],
            newVideo: jest.fn(),
        };
        mockNodeGet.mockImplementation((id) => {
            if (id === 'video') return videoNode;
            return false;
        });

        const result = await sitrecAPI.call('importMedia', {file: '!new.mp4'});

        expect(videoNode.newVideo).toHaveBeenCalledWith('new.mp4', true);
        expect(mockMarkSitchDirty).toHaveBeenCalled();
        expect(result).toEqual({
            success: true,
            fn: 'importMedia',
            result: {
                success: true,
                imported: true,
                pending: true,
                file: 'new.mp4',
            },
        });
    });

    test('returns an error when no media file is provided', async () => {
        const result = await sitrecAPI.call('importMedia', {});

        expect(result).toEqual({
            success: true,
            fn: 'importMedia',
            result: {
                success: false,
                error: 'Media file is required',
            },
        });
    });
});