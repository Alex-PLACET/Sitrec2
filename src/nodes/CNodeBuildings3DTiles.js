// CNodeBuildings3DTiles.js
// Renders 3D building tiles using NASA's 3DTilesRendererJS library.
// Supports Cesium Ion OSM Buildings and Google Photorealistic 3D Tiles.
//
// Each visible 3D view gets its own TilesRenderer instance with independent
// LOD so that views with very different cameras (e.g. close-up mainView vs
// distant lookView) each load tiles at the appropriate resolution without
// competing for budget.

import {CNode} from "./CNode";
import {NodeMan, Sit} from "../Globals";
import {GlobalScene} from "../LocalFrame";
import {Group, Matrix4} from "three";
import {RLLAToECEF} from "../LLA-ECEF-ENU";
import * as LAYER from "../LayerMasks";
import {TilesRenderer} from "3d-tiles-renderer";
import {CesiumIonAuthPlugin, GoogleCloudAuthPlugin} from "3d-tiles-renderer/plugins";
import {TilesDayNightPlugin} from "../TilesDayNightPlugin";

// Build a Matrix4 that transforms ECEF coordinates to EUS (East-Up-South) local frame.
// This is the matrix form of ECEFToEUS(), applied to the TilesRenderer group
// so all child tiles are automatically positioned in Sitrec's coordinate system.
function buildECEFToEUSMatrix4() {
    const lat = Sit.lat * Math.PI / 180;
    const lon = Sit.lon * Math.PI / 180;

    const sinLat = Math.sin(lat);
    const cosLat = Math.cos(lat);
    const sinLon = Math.sin(lon);
    const cosLon = Math.cos(lon);

    // ECEF→ENU rotation matrix (3x3):
    //   [ -sinLon,          cosLon,          0      ]
    //   [ -sinLat*cosLon,  -sinLat*sinLon,   cosLat ]
    //   [  cosLat*cosLon,   cosLat*sinLon,   sinLat ]
    //
    // Then ENU→EUS swap: EUS.x = ENU.x, EUS.y = ENU.z, EUS.z = -ENU.y
    // Combined ECEF→EUS rotation:
    //   Row 0 (EUS.x = ENU.x):  -sinLon,          cosLon,          0
    //   Row 1 (EUS.y = ENU.z):   cosLat*cosLon,    cosLat*sinLon,   sinLat
    //   Row 2 (EUS.z = -ENU.y):  sinLat*cosLon,    sinLat*sinLon,  -cosLat

    // Use WGS84 ellipsoid (not sphere) because the 3D tiles are in ellipsoid ECEF.
    // RLLAToECEFV_Sphere would place the origin ~7km too high at mid-latitudes,
    // causing tiles to render underground.
    const originECEF = RLLAToECEF(lat, lon, 0);

    // Build as a 4x4 matrix: rotation + translation
    // Three.js Matrix4 is column-major: .set(row-major args)
    const rotationMatrix = new Matrix4().set(
        -sinLon,        cosLon,         0,       0,
        cosLat*cosLon,  cosLat*sinLon,  sinLat,  0,
        sinLat*cosLon,  sinLat*sinLon, -cosLat,  0,
        0,              0,              0,       1
    );

    // First translate by -originECEF, then rotate
    const translationMatrix = new Matrix4().makeTranslation(
        -originECEF.x, -originECEF.y, -originECEF.z
    );

    // Combined: rotation * translation
    return rotationMatrix.multiply(translationMatrix);
}


// Per-view state: a TilesRenderer instance, its parent group, and the view it tracks.
class PerViewTiles {
    constructor(parentGroup, layerMask, source, cesiumIonToken, googleApiKey) {
        this.renderer = new TilesRenderer();

        if (source === "cesium-osm") {
            this.renderer.registerPlugin(new CesiumIonAuthPlugin({
                apiToken: cesiumIonToken,
                assetId: 96188, // Cesium OSM Buildings
            }));
        } else if (source === "google-photorealistic") {
            this.renderer.registerPlugin(new GoogleCloudAuthPlugin({
                apiToken: googleApiKey,
            }));
        }

        this.renderer.registerPlugin(new TilesDayNightPlugin());

        const ecefToEUS = buildECEFToEUSMatrix4();
        this.renderer.group.applyMatrix4(ecefToEUS);
        this.renderer.group.layers.mask = layerMask;

        // Set layer mask on all tile meshes as they load
        this.renderer.addEventListener('load-model', ({scene}) => {
            scene.traverse(child => {
                if (child.isMesh || child.isLine || child.isPoints) {
                    child.layers.mask = layerMask;
                }
            });
        });

        parentGroup.add(this.renderer.group);
    }

    update(view) {
        if (!view || !view.visible || !view.camera || !view.renderer) return;
        // Ensure the camera's world matrix is current — controllers may not
        // have run yet this frame depending on node update order.
        view.camera.updateMatrixWorld();
        this.renderer.setCamera(view.camera);
        this.renderer.setResolutionFromRenderer(view.camera, view.renderer);
        this.renderer.update();
    }

    dispose(parentGroup) {
        parentGroup.remove(this.renderer.group);
        this.renderer.dispose();
    }
}


export class CNodeBuildings3DTiles extends CNode {
    constructor(v) {
        super(v);

        this.source = v.source ?? "cesium-osm"; // "cesium-osm" or "google-photorealistic"
        this.cesiumIonToken = v.cesiumIonToken ?? null;
        this.googleApiKey = v.googleApiKey ?? null;

        this.group = new Group();
        this.group.layers.mask = LAYER.MASK_MAIN | LAYER.MASK_LOOK;
        GlobalScene.add(this.group);

        this._perView = {}; // keyed by view id
        this._initialized = false;

        this.updateWhilePaused = true;

        this.initTilesRenderers();
    }

    // Resolve which source to actually use: prefer the requested source,
    // but fall back to whatever has a valid API key configured.
    resolveSource() {
        if (this.source === "cesium-osm" && this.cesiumIonToken) return "cesium-osm";
        if (this.source === "google-photorealistic" && this.googleApiKey) return "google-photorealistic";
        // Requested source not available, try the other one
        if (this.googleApiKey) return "google-photorealistic";
        if (this.cesiumIonToken) return "cesium-osm";
        return null;
    }

    initTilesRenderers() {
        this.disposeTilesRenderers();

        const activeSource = this.resolveSource();
        if (!activeSource) {
            console.warn("CNodeBuildings3DTiles: No API keys configured. Buildings will not load.");
            return;
        }

        // One TilesRenderer per view, each with its own LOD and layer mask.
        const viewConfigs = [
            {id: "mainView", mask: LAYER.MASK_MAIN},
            {id: "lookView", mask: LAYER.MASK_LOOK},
        ];

        for (const {id, mask} of viewConfigs) {
            this._perView[id] = new PerViewTiles(
                this.group, mask, activeSource,
                this.cesiumIonToken, this.googleApiKey
            );
        }

        this._initialized = true;
        this._activeSource = activeSource;

        console.log("CNodeBuildings3DTiles: Initialized with source=" + activeSource
            + (activeSource !== this.source ? " (requested " + this.source + ")" : ""));
    }

    disposeTilesRenderers() {
        for (const pv of Object.values(this._perView)) {
            pv.dispose(this.group);
        }
        this._perView = {};
        this._initialized = false;
    }

    // Switch between data sources at runtime
    setSource(source) {
        if (source === this.source) return;
        this.source = source;
        this.initTilesRenderers();
    }

    update(f) {
        super.update(f);

        if (!this._initialized) return;

        for (const [viewId, pv] of Object.entries(this._perView)) {
            const view = NodeMan.get(viewId, false);
            pv.update(view);
        }
    }

    dispose() {
        this.disposeTilesRenderers();

        if (this.group) {
            GlobalScene.remove(this.group);
            this.group = null;
        }

        super.dispose();
    }
}
