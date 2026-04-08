import {CNodeTrack} from "./CNodeTrack";
import {Sit} from "../Globals";
import {getLocalEastVector, getLocalNorthVector} from "../SphericalMath";
import {ECEFToLLAVD_radii, LLAToECEF} from "../LLA-ECEF-ENU";

export class CNodeOrbitTrack extends CNodeTrack {
    constructor(v) {
        v.frames = v.frames ?? Sit.frames;
        super(v);
        this.useSitFrames = true;

        this.requireInputs(["target", "radius", "period"]);
        this.optionalInputs(["altitude"]);
        this.isNumber = false;

        this._needsRecalculate = true;
    }

    recalculate() {
        this.array = [];

        const radiusMeters = this.in.radius.getValueFrame(0);
        const periodSeconds = this.in.period.getValueFrame(0);

        for (let f = 0; f < this.frames; f++) {
            const targetPos = this.in.target.p(f);

            const angle = 2 * Math.PI * f / (periodSeconds * Sit.fps);

            const north = getLocalNorthVector(targetPos);
            const east = getLocalEastVector(targetPos);

            const orbitPos = targetPos.clone()
                .add(north.multiplyScalar(Math.cos(angle) * radiusMeters))
                .add(east.multiplyScalar(Math.sin(angle) * radiusMeters));

            // If an altitude source is provided, replace the orbit altitude
            // with the altitude source's HAE, keeping the orbit's lat/lon
            if (this.in.altitude) {
                const altLLA = ECEFToLLAVD_radii(this.in.altitude.p(f));
                const orbitLLA = ECEFToLLAVD_radii(orbitPos);
                orbitPos.copy(LLAToECEF(orbitLLA.x, orbitLLA.y, altLLA.z));
            }

            this.array.push({position: orbitPos});
        }
    }
}
