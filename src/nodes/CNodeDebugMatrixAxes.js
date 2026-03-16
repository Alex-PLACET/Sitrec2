// dispaly the matrix axes of an object

import {Vector3} from "three";
import {assert} from "../assert";
import {DebugMatrixAxes} from "../threeExt";
import {CNode} from "./CNode";

export class CNodeDebugMatrixAxes extends CNode {
    constructor(v) {
        super(v);
        v.length ??= 500;
        this.worldPosition = new Vector3();
        this.input("object")
        this.input("length")


    }

    update(f) {
        const ob = this.in.object._object;
        assert(ob !== undefined, "CNodeDebugMatrixAxes: object is undefined");
        ob.updateMatrixWorld(true);
        ob.getWorldPosition(this.worldPosition);
        DebugMatrixAxes("MISB Axes", this.worldPosition, ob.matrixWorld, this.in.length.v(f))

    }

    dispoose

}
