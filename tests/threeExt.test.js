import {Euler, Matrix4, Quaternion, Vector3} from "three";
import {getDebugMatrixAxisSegments} from "../src/DebugMatrixAxesUtils";

describe("getDebugMatrixAxisSegments", () => {
    test("keeps each axis centered on the requested position when the matrix includes scale", () => {
        const position = new Vector3(10, -20, 30);
        const quaternion = new Quaternion().setFromEuler(new Euler(Math.PI / 6, Math.PI / 4, Math.PI / 3));
        const matrix = new Matrix4().compose(new Vector3(), quaternion, new Vector3(7, 3, 11));

        const axes = getDebugMatrixAxisSegments(position, matrix, 5);

        for (const axis of axes) {
            const end = axis.origin.clone().add(axis.direction.clone().multiplyScalar(axis.length));
            const midpoint = axis.origin.clone().add(end).multiplyScalar(0.5);

            expect(midpoint.x).toBeCloseTo(position.x, 10);
            expect(midpoint.y).toBeCloseTo(position.y, 10);
            expect(midpoint.z).toBeCloseTo(position.z, 10);
        }
    });
});
