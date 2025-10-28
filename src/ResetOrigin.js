import {NodeMan, Sit} from "./Globals";
import {ECEFToLLAVD_Sphere, EUSToECEF} from "./LLA-ECEF-ENU";
import {V3} from "./threeUtils";


export function resetGlobalOrigin() {
    // The origin of the EUS coordinate system is initially set to near Los Angeles
    // if we move far from there, then the precision of the floating point numbers
    // will cause the origin to jitter, and we'll lose precision
    // so we can reset the origin to the current location

    const lookCamera = NodeMan.get("lookCamera").camera;
    const pos = lookCamera.position;

    // get the current EUS origin in ECEF
    const oldEUSOrigin = EUSToECEF(V3(0,0,0));


    const LLA = ECEFToLLAVD_Sphere(EUSToECEF(pos));
    console.log("Resetting Origin to " + LLA.x + ", " + LLA.y + ", " + LLA.z);
    Sit.lat = LLA.x;
    Sit.lon = LLA.y;

    // get the new EUS origin in ECEF
    const newEUSOrigin = EUSToECEF(V3(0,0,0));

    // get the difference between the old and new origins
    // "diff" is a value we can add to a position that will move them into
    // the new EUS coordinate system
    // it the value you SUBTRACT to change the coordinate system
    // we want a value we can add, so we negate it.
    const diff = newEUSOrigin.clone().sub(oldEUSOrigin).negate();


    // Now will we also need to adjust the matrix? YES for may things



    // Note: Origin adjustment now handled by CFileManager.resetOrigin() which performs
    // a full serialize/deserialize cycle to properly reload all nodes with new coordinates
    // This ensures all LLA to EUS transformations are recalculated correctly

}