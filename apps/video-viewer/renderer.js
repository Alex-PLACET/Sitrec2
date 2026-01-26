import {CNodeVideoWebCodecView} from "../../src/nodes/CNodeVideoWebCodecView";
import {DragDropHandler} from "../../src/DragDropHandler";
import {par, resetPar} from "../../src/par";
import {Globals, setGlobalDateTimeNode, setNodeMan, setSit, setupGUIGlobals,} from "../../src/Globals";
import {CNodeManager} from "../../src/nodes/CNodeManager";
import {CGuiMenuBar} from "../../src/lil-gui-extras";
import {ViewMan} from "../../src/CViewManager";
import {extraCSS} from "../../src/extra.css.js";
import {SetupFrameSlider, updateFrameSlider} from "../../src/nodes/CNodeFrameSlider";
import {initKeyboard} from "../../src/KeyBoardHandler";

resetPar();

const style = document.createElement('style');
style.textContent = extraCSS;
document.head.appendChild(style);

const Sit = {
    name: "video",
    fps: 30,
    frames: 1,
    aFrame: 0,
    bFrame: 0,
    videoFrames: 1,
    framesFromVideo: true,
};
setSit(Sit);

setGlobalDateTimeNode({ changedFrames: () => {} });

const NodeMan = new CNodeManager();
setNodeMan(NodeMan);

const gui = new CGuiMenuBar({title: "Video Viewer", closeFolders: true});
Globals.menuBar = gui;
const dummyFolder = gui.addFolder("Views").close();
setupGUIGlobals(gui, dummyFolder, dummyFolder, dummyFolder, dummyFolder);

let videoNode;

function init() {
    console.log("Video Viewer initializing...");
    
    // FIX: Content div needs top: 0 to be visible
    ViewMan.container.style.top = '0px';
    
    // Prevent browser context menu globally for Electron
    document.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });
    
    try {
        videoNode = new CNodeVideoWebCodecView({
            id: "video",
            visible: true,
            left: 0, top: 0, width: 1, height: 1,
            draggable: false, resizable: true,
            frames: Sit.frames,
            background: "black",
            autoFill: true,
            dragDropVideo: true,
            alwaysReplace: true,
            doubleClickFullscreen: false,
        });
        console.log("Video node created:", videoNode);
        videoNode.updateWH();
        
        // Override contextMenu handler to allow right-drag scrubbing without alert
        if (videoNode.mouse && videoNode.mouse.handlers) {
            videoNode.mouse.handlers.contextMenu = null;
        }
    } catch (e) {
        console.error("Error creating video node:", e);
    }

    window.addEventListener('resize', () => {
        ViewMan.updateSize();
        ViewMan.iterate((key, view) => view.updateWH());
    });

    DragDropHandler.addDropArea();
    
    const frameSlider = SetupFrameSlider();
    initKeyboard();
    
    document.addEventListener('keydown', (e) => {
        if (e.code === 'ArrowLeft') {
            par.frame = Math.max(0, Math.floor(par.frame - 1));
            par.paused = true;
            e.preventDefault();
        } else if (e.code === 'ArrowRight') {
            const maxFrame = videoNode?.videoData?.frames ? videoNode.videoData.frames - 1 : Sit.frames - 1;
            par.frame = Math.min(maxFrame, Math.floor(par.frame + 1));
            par.paused = true;
            e.preventDefault();
        }
    });

    const fileMenu = gui.addFolder("File").close();
    const loadFile = () => videoNode.requestAndLoadFile();
    fileMenu.add({loadFile}, "loadFile").name("Load Video");

    if (window.electronAPI) {
        window.electronAPI.onOpenVideo(async (filePath) => {
            const result = await window.electronAPI.readVideoFile(filePath);
            if (result.data) {
                const file = new File([result.data], result.name, {type: 'video/mp4'});
                videoNode.uploadFile(file);
            }
        });
    }

    requestAnimationFrame(mainLoop);
}

let lastTime = 0;
let frameAccumulator = 0;

function mainLoop(time) {
    const deltaTime = (time - lastTime) / 1000;
    lastTime = time;
    
    if (videoNode && videoNode.videoData) {
        const totalFrames = videoNode.videoData.frames || 0;
        const fps = videoNode.videoData.fps || 30;
        
        if (Sit.frames !== totalFrames && totalFrames > 0) {
            Sit.frames = totalFrames;
            Sit.bFrame = totalFrames - 1;
        }
        
        if (totalFrames > 0 && !par.paused) {
            frameAccumulator += deltaTime * fps * par.speed;
            while (frameAccumulator >= 1) {
                par.frame = (par.frame + par.direction) % totalFrames;
                if (par.frame < 0) par.frame = totalFrames - 1;
                frameAccumulator -= 1;
            }
        }
    }
    
    updateFrameSlider();
    
    ViewMan.iterate((key, view) => {
        if (view.visible && view.renderCanvas) {
            view.renderCanvas(par.frame);
        }
    });
    
    requestAnimationFrame(mainLoop);
}

document.addEventListener('DOMContentLoaded', init);
