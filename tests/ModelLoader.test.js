jest.mock("three/addons/loaders/DRACOLoader.js", () => ({
    DRACOLoader: class DRACOLoader {
        setDecoderPath() {}
    },
}));

jest.mock("three/addons/loaders/GLTFLoader.js", () => {
    const {Group} = require("three");

    return {
        GLTFLoader: class GLTFLoader {
            setDRACOLoader() {}

            parse(_data, _path, onLoad) {
                onLoad({scene: new Group()});
            }
        },
    };
});

jest.mock("three/addons/loaders/PLYLoader.js", () => {
    const {BufferGeometry, Float32BufferAttribute} = require("three");

    function parsePLYText(text) {
        const lines = text.trim().split(/\r?\n/);
        const endHeaderIndex = lines.findIndex((line) => line.trim() === "end_header");
        const headerLines = lines.slice(0, endHeaderIndex + 1);

        let vertexCount = 0;
        let faceCount = 0;
        let inVertexElement = false;
        const vertexProperties = [];

        for (const line of headerLines) {
            const trimmed = line.trim();
            const elementMatch = trimmed.match(/^element\s+(\w+)\s+(\d+)/i);
            if (elementMatch) {
                inVertexElement = elementMatch[1] === "vertex";
                if (elementMatch[1] === "vertex") {
                    vertexCount = Number(elementMatch[2]);
                }
                if (elementMatch[1] === "face") {
                    faceCount = Number(elementMatch[2]);
                }
                continue;
            }

            if (inVertexElement) {
                const propertyMatch = trimmed.match(/^property\s+\w+\s+(\w+)/i);
                if (propertyMatch) {
                    vertexProperties.push(propertyMatch[1]);
                }
            }
        }

        const propertyValues = new Map(vertexProperties.map((name) => [name, []]));
        const vertexLines = lines.slice(endHeaderIndex + 1, endHeaderIndex + 1 + vertexCount);
        for (const line of vertexLines) {
            const values = line.trim().split(/\s+/).map(Number);
            vertexProperties.forEach((name, index) => {
                propertyValues.get(name).push(values[index]);
            });
        }

        const faceLines = lines.slice(endHeaderIndex + 1 + vertexCount, endHeaderIndex + 1 + vertexCount + faceCount);
        const faces = faceLines.map((line) => line.trim().split(/\s+/).slice(1).map(Number));

        return {propertyValues, faces};
    }

    return {
        PLYLoader: class PLYLoader {
            constructor() {
                this.customPropertyMapping = {};
            }

            setCustomPropertyNameMapping(mapping) {
                this.customPropertyMapping = mapping;
            }

            parse(data) {
                const text = new TextDecoder().decode(data);
                const {propertyValues, faces} = parsePLYText(text);
                const geometry = new BufferGeometry();
                geometry.setAttribute("position", new Float32BufferAttribute([
                    ...propertyValues.get("x"),
                    ...propertyValues.get("y"),
                    ...propertyValues.get("z"),
                ].reduce((acc, value, index, array) => {
                    if (index < array.length / 3) {
                        acc.push(array[index], array[index + array.length / 3], array[index + 2 * array.length / 3]);
                    }
                    return acc;
                }, []), 3));

                if (faces.length > 0) {
                    geometry.setIndex(faces.flat());
                }

                for (const [attributeName, propertyNames] of Object.entries(this.customPropertyMapping)) {
                    if (propertyNames.every((name) => propertyValues.has(name))) {
                        const values = propertyValues.get(propertyNames[0]).map((_, index) =>
                            propertyNames.map((name) => propertyValues.get(name)[index])
                        ).flat();
                        geometry.setAttribute(attributeName, new Float32BufferAttribute(values, propertyNames.length));
                    }
                }

                return geometry;
            }
        },
    };
});

import {isSupportedModelFile, parseModelData} from "../src/ModelLoader";

function toArrayBuffer(text) {
    return new TextEncoder().encode(text).buffer;
}

describe("ModelLoader", () => {
    test("detects supported model extensions", () => {
        expect(isSupportedModelFile("model.glb")).toBe(true);
        expect(isSupportedModelFile("model.ply")).toBe(true);
        expect(isSupportedModelFile("model.PLY?cache=1")).toBe(true);
        expect(isSupportedModelFile("model.obj")).toBe(false);
    });

    test("parses mesh PLY files into mesh scene graphs", async () => {
        const trianglePLY = [
            "ply",
            "format ascii 1.0",
            "element vertex 3",
            "property float x",
            "property float y",
            "property float z",
            "element face 1",
            "property list uchar int vertex_indices",
            "end_header",
            "0 0 0",
            "1 0 0",
            "0 1 0",
            "3 0 1 2",
        ].join("\n");

        const modelAsset = await parseModelData("triangle.ply", toArrayBuffer(trianglePLY));

        expect(modelAsset.format).toBe("ply");
        expect(modelAsset.scene.userData.sitrecPlyHasFaces).toBe(true);
        expect(modelAsset.scene.children).toHaveLength(1);
        expect(modelAsset.scene.children[0].isMesh).toBe(true);
        expect(modelAsset.scene.children[0].rotation.x).toBeCloseTo(-Math.PI / 2);
    });

    test("parses point-cloud PLY files into points scene graphs", async () => {
        const pointsPLY = [
            "ply",
            "format ascii 1.0",
            "element vertex 3",
            "property float x",
            "property float y",
            "property float z",
            "end_header",
            "0 0 0",
            "1 0 0",
            "0 1 0",
        ].join("\n");

        const modelAsset = await parseModelData("points.ply", toArrayBuffer(pointsPLY));

        expect(modelAsset.format).toBe("ply");
        expect(modelAsset.scene.userData.sitrecPlyHasFaces).toBe(false);
        expect(modelAsset.scene.children).toHaveLength(1);
        expect(modelAsset.scene.children[0].isPoints).toBe(true);
        expect(modelAsset.scene.children[0].rotation.x).toBeCloseTo(-Math.PI / 2);
    });

    test("derives colored splat-like point rendering from gaussian-style PLY attributes", async () => {
        const splatPLY = [
            "ply",
            "format ascii 1.0",
            "element vertex 2",
            "property float x",
            "property float y",
            "property float z",
            "property float f_dc_0",
            "property float f_dc_1",
            "property float f_dc_2",
            "property float opacity",
            "property float scale_0",
            "property float scale_1",
            "property float scale_2",
            "property float rot_0",
            "property float rot_1",
            "property float rot_2",
            "property float rot_3",
            "end_header",
            "0 0 0 1 0 0 0 -2 -2 -2 1 0 0 0",
            "1 0 0 0 1 0 1 -1 -1 -1 1 0 0 0",
        ].join("\n");

        const modelAsset = await parseModelData("splat.ply", toArrayBuffer(splatPLY));
        const points = modelAsset.scene.children[0];
        const geometry = points.geometry;

        expect(points.isPoints).toBe(true);
        expect(points.material.isShaderMaterial).toBe(true);
        expect(points.material.userData.sitrecPLYPointCloud).toBe(true);
        expect(points.material.transparent).toBe(false);
        expect(geometry.getAttribute("color")).toBeDefined();
        expect(geometry.getAttribute("splatOpacity")).toBeDefined();
        expect(geometry.getAttribute("splatSize")).toBeDefined();
    });
});
