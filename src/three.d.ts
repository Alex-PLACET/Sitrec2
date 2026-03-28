declare module 'three' {
    export class Vector3 {
        constructor(x?: number, y?: number, z?: number);
        x: number;
        y: number;
        z: number;
        clone(): Vector3;
        copy(v: Vector3): this;
        add(v: Vector3): this;
        sub(v: Vector3): this;
        multiplyScalar(s: number): this;
        dot(v: Vector3): number;
        cross(v: Vector3): this;
        crossVectors(a: Vector3, b: Vector3): this;
        normalize(): this;
        negate(): this;
        length(): number;
        lengthSq(): number;
        angleTo(v: Vector3): number;
        applyMatrix3(m: Matrix3): this;
        applyMatrix4(m: Matrix4): this;
        applyAxisAngle(axis: Vector3, angle: number): this;
        set(x: number, y: number, z: number): this;
        setFromMatrixColumn(m: Matrix4, index: number): this;
    }

    export class Matrix3 {
        constructor();
        elements: number[];
        set(n11: number, n12: number, n13: number,
            n21: number, n22: number, n23: number,
            n31: number, n32: number, n33: number): this;
        copy(m: Matrix3): this;
        invert(): this;
    }

    export class Matrix4 {
        elements: number[];
        extractBasis(xAxis: Vector3, yAxis: Vector3, zAxis: Vector3): this;
    }

    export class Plane {
        constructor(normal?: Vector3, constant?: number);
        projectPoint(point: Vector3, target: Vector3): Vector3;
    }

    export class Camera {
        matrixWorld: Matrix4;
    }
}
