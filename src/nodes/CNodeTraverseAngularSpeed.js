// takes a track and traverse node and returns the per-second
// angular difference between the lines beteeen the nodes
// for this frame and the previous frame.
import {CNode} from "./CNode";
import {asin, degrees} from "../utils";
import {getLocalUpVector} from "../SphericalMath";

// Project a position onto the local horizontal (tangent) plane at refPos.
// Works by projecting the relative offset onto the plane perpendicular to local up,
// then adding refPos back. This is essential in ECEF where absolute positions are
// ~6.4M meters from origin — projecting absolute coords through the origin is wrong.
function projectHorizontal(pos, refPos) {
    const up = getLocalUpVector(refPos)
    const rel = pos.clone().sub(refPos)
    const horizontalRel = rel.sub(up.clone().multiplyScalar(rel.dot(up)))
    return refPos.clone().add(horizontalRel)
}

export class CNodeTraverseAngularSpeed extends CNode {
    constructor(v) {
        super(v);

        // track is like a jet track, with a "position" memeber
        // "traverse" is an array of objects that have a "position member"
        this.checkInputs(["track", "traverse"])
        this.frames = this.in.track.frames;
    }

    getValueFrame(f) {
        if (f === 0) return this.getValueFrame(1)

        let trackPos = this.in.track.p(f)
        let traversePos = this.in.traverse.p(f)

        // Project onto local horizontal plane (remove vertical component)
        trackPos = projectHorizontal(trackPos, trackPos);
        traversePos = projectHorizontal(traversePos, trackPos);

        let offset = traversePos.clone().sub(trackPos)
//        let angle = atan2(offset.z, offset.x)

        let trackPos0 = this.in.track.p(f - 1)
        let traversePos0 = this.in.traverse.p(f - 1)
        trackPos0 = projectHorizontal(trackPos0, trackPos0);

        // this position has ALSO moved by the per-frame cloud wind velocity
        const wind = this.in.wind.v(f)
        traversePos0.add(wind)
        traversePos0 = projectHorizontal(traversePos0, trackPos0);

        let offset0 = traversePos0.clone(0).sub(trackPos0)
//        let angle0 = atan2(offset0.z, offset0.x)

//        let angleDifferenceDegrees = degrees(angle - angle0) * this.fps
        //const angleDifferenceDegrees = -degrees(offset0.angleTo(offset)) * this.fps

        var step = traversePos.clone().sub(traversePos0)

        // Step is how far we've moved along curve that touches the horison.
        // nee to get this PERPENDICULAR to the view vector (which we assume is offset)
        const viewNormal = offset.clone().normalize()
        const viewComponentOfStep = step.clone().sub(viewNormal.multiplyScalar(viewNormal.dot(step)))

        let angleDifferenceDegrees = -degrees(asin(viewComponentOfStep.length()/offset.length())) * this.fps;

        // Determine sign using cross product projected onto local up
        const up = getLocalUpVector(trackPos);
        const toTraverse = traversePos.clone().sub(trackPos);
        const crossSign = toTraverse.cross(viewComponentOfStep).dot(up);
        if (crossSign > 0) {
            angleDifferenceDegrees = -angleDifferenceDegrees;
        }

   //     if (f == 1) console.log("------------")
   //     if (f <5)
   //         console.log("CNodeTraverseAngularSpeed, frame = "+f+" angleDiff = " + angleDifferenceDegrees
   //         + " offset: "+vdump(offset,3)+ " offset0:"+vdump(offset0,3)+" wind: "+vdump(wind,3)+" St:"+step.length())

        return (angleDifferenceDegrees)

        /*
        offset.normalize()
        offset0.normalize()
//        var d = offset.dot(offset0)
        var d = offset.x*offset0.x + offset.y*offset0.y + offset.z*offset0.z
        let angle2 = (degrees(Math.acos(d)))
        return angle2*this.fps
*/

    }

}

