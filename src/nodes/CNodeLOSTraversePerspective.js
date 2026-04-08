import {CNodeTrack} from "./CNodeTrack";
import {assert} from "../assert";

export class CNodeLOSTraversePerspective extends CNodeTrack {
    constructor(v) {
        super(v);
        this.requireInputs(["LOS", "startDist"])
        this.array = []
        this.frames = this.in.LOS.frames;
        this._needsRecalculate = true;
    }

    recalculate() {
        this.array = [];
        this.frames = this.in.LOS.frames;

        let losNode = this.in.LOS;
        // If LOS is a Switch node, get the actual selected node
        if (losNode.getObject) {
            losNode = losNode.getObject();
        }
        const keyframes = losNode.keyframes;

        if (!keyframes || losNode.curveType !== "Perspective" || keyframes.length < 3) {
            for (let f = 0; f < this.frames; f++) {
                const los = this.in.LOS.v(f);
                const startDist = this.in.startDist.v(0);
                let position = los.position.clone();
                let heading = los.heading.clone();
                heading.multiplyScalar(startDist);
                position.add(heading);
                this.array.push({position: position});
            }
            return;
        }

        // PERSPECTIVE DEPTH VELOCITY MODEL (Conceptual explanation):
        // ================================
        //
        //                    Screen
        //  2D (u,v)        (image plane)            3D World (Camera Space, P=X,Y,D)
        //                       |
        //                       |                    Object trajectory
        //                       |                    (linear in 3D)
        //                       |
        //    uA ----+---+---+---|                     C (frame Tc)
        //           .\  |  /.   |                    /
        //           . \ | / .   |                   / 
        //           .  \|/  .   |                  B (frame Tb)
        //    uB     .   *   .   |  LOS rays       /
        //           .  /|\  .   |    to A,B,C    /
        //           . / | \ .   |               A (frame Ta)
        //           ./  |  \.   |              *───────────────>
        //    uC ----+---+---+---|             P_A              P_C
        //               |       | |←── D_A ────→|
        //               |       | |←────── D_C ───────────────→|
        //            Camera     |
        //            (origin)   |
        //
        //  As object moves from A to C along straight line:
        //  - Depth changes: D_A → D_C  (here shown increasing, d > 0)
        //  - Screen position changes: uA → uC (non-linear due to perspective)
        //  - The middle keyframe B constrains the depth velocity 'd'
        //
        // For an object moving linearly in 3D, its screen position follows:
        //   u(t) = (uA + a1*s) / (1 + d*s)
        // where s = t - Ta (time since first keyframe)
        //
        // This is a rational polynomial arising from perspective projection:
        //   - Lateral position: X(t) = X_A + v_X * s
        //   - Depth from camera: D(t) = D_A + v_D * s = D_A * (1 + d*s)
        //   - Screen position: u(t) = X(t) / D(t)
        //
        // Terms:
        //   s = time elapsed since first keyframe (t - Ta), in frames
        //   X(t)    = horizontal 3D position (perpendicular to LOS) at time t
        //   X_A     = horizontal 3D position at first keyframe
        //   v_X     = horizontal 3D velocity (constant, since linear motion)
        //   D(t)    = depth (distance along LOS direction) from camera at time t
        //   D_A     = depth at first keyframe (= startDist)
        //   v_D     = depth velocity (rate of change of depth)
        //   d       = depth velocity ratio = v_D / D_A (normalized depth velocity)
        //   u(t)    = horizontal screen position (pixels or normalized coords)
        //   a1      = v_X / D_A (normalized horizontal velocity, used in screen formula)
        //
        // The same model applies to the vertical axis:
        //   Y(t)    = vertical 3D position at time t
        //   Y_A     = vertical 3D position at first keyframe
        //   v_Y     = vertical 3D velocity
        //   v(t)    = vertical screen position = Y(t) / D(t)
        //   b1      = v_Y / D_A (normalized vertical velocity)
        //
        // Both u(t) and v(t) share the same denominator (1 + d*s) since depth 'd'
        // affects both axes equally. We solve for 'd' using the horizontal (u) values,
        // then the same 'd' applies to the vertical (v) interpolation.
        //
        // The key parameter 'd' is the depth velocity ratio: d = v_D / D_A
        //   - d > 0: object moving AWAY from camera (depth increasing)
        //   - d < 0: object moving TOWARD camera (depth decreasing)
        //   - d = 0: object at constant depth (parallel to image plane)

        const Ta = keyframes[0].frame;
        const Tb = keyframes[1].frame;
        const Tc = keyframes[2].frame;

        const uA = keyframes[0].x, uB = keyframes[1].x, uC = keyframes[2].x;

        const sB = Tb - Ta;
        const sC = Tc - Ta;

        // Solve for depth velocity ratio 'd' from three keyframe observations.
        // From u(t) = (uA + a1*s) / (1 + d*s), we can derive:
        //   d = [(uC - uA)/sC - (uB - uA)/sB] / (uB - uC)
        // This compares the average angular velocities over two intervals
        // to extract the perspective-induced acceleration.
        const denominator = uB - uC;
        let d;
        if (Math.abs(denominator) < 1e-10) {
            d = 0;
        } else {
            d = ((uC - uA) / sC - (uB - uA) / sB) / denominator;
        }

        const startDist = this.in.startDist.v(0);

        // Point A: user-specified starting distance along LOS at frame Ta
        const los_A = this.in.LOS.v(Ta);
        const P_A = los_A.position.clone().add(los_A.heading.clone().multiplyScalar(startDist));

        // Point C: distance derived from depth velocity
        // Since D(t) = D_A * (1 + d*s), at frame Tc:
        //   distC = startDist * (1 + d * sC)
        const distC = startDist * (1 + d * sC);
        const los_C = this.in.LOS.v(Tc);
        const P_C = los_C.position.clone().add(los_C.heading.clone().multiplyScalar(distC));

        // With two 3D points P_A and P_C at known times, linearly interpolate
        // to get the full trajectory (object moves in a straight line at constant velocity)
        for (let f = 0; f < this.frames; f++) {
            const t = (f - Ta) / sC;
            const position = P_A.clone().lerp(P_C, t);

            assert(!isNaN(position.x) && !isNaN(position.y) && !isNaN(position.z),
                "CNodeLOSTraversePerspective: NaN position at frame " + f);

            this.array.push({position: position});
        }
    }
}
