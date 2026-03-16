import {Vector3} from "three";

export function getDebugMatrixAxisSegments(position, matrix, halfLength) {
    return [0, 1, 2].map((column) => {
        const direction = new Vector3().setFromMatrixColumn(matrix, column).normalize();

        return {
            direction,
            origin: position.clone().sub(direction.clone().multiplyScalar(halfLength)),
            length: halfLength * 2,
        };
    });
}
