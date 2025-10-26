import {CNode3DGroup} from "./CNode3DGroup";
import * as LAYER from "../LayerMasks";
import {dispose, propagateLayerMaskObject} from "../threeExt";
import {LineGeometry} from "three/addons/lines/LineGeometry.js";
import {wgs84} from "../LLA-ECEF-ENU";
import {Line2} from "three/addons/lines/Line2.js";
import {makeMatLine} from "../MatLines";
import {perpendicularVector, V3} from "../threeUtils";
import {Globals} from "../Globals";

/**
 * CNodeDisplayEarthShadow - Displays Earth's shadow cone in the night sky
 * 
 * Renders two circles representing Earth's shadow:
 * - Red circle: Umbra (complete shadow, Sun completely blocked)
 * - Green circle: Penumbra (partial shadow, Sun partially blocked)
 * 
 * The shadow is positioned at the antisolar point and sized based on the altitude
 * parameter and Sun-Earth geometry.
 */
export class CNodeDisplayEarthShadow extends CNode3DGroup {
    constructor(v) {
        v.layers ??= LAYER.MASK_LOOKRENDER;
        super(v);
        
        // Configuration
        this.altitude = v.altitude ?? 400000; // meters from Earth's center
        this.fromSun = v.fromSun ?? V3(0, -1, 0); // Direction away from Sun (antisolar)
        
        // Sun parameters (all in meters)
        this.sunRadius = 696000000; // ~696,000 km
        this.earthRadius = wgs84.RADIUS; // ~6,371 km
        this.sunEarthDistance = 149597870700; // ~149.6 million km (1 AU)
        
        // Geometry and line objects
        this.umbraGeometry = null;
        this.umbraLine = null;
        this.penumbraGeometry = null;
        this.penumbraLine = null;
        
        // Materials
        this.umbraMaterial = makeMatLine(0xffff00, 2); // Yellow
        this.penumbraMaterial = makeMatLine(0xff8000, 2); // Orange
        
        this.rebuild();
    }

    dispose() {
        this.removeCircles();
        super.dispose();
    }

    removeCircles() {
        if (this.umbraLine) {
            this.group.remove(this.umbraLine);
            dispose(this.umbraGeometry);
        }
        if (this.penumbraLine) {
            this.group.remove(this.penumbraLine);
            dispose(this.penumbraGeometry);
        }
    }


    // Function to calculate the umbra and penumbra diameters at a given geocentric altitude
// Input: altitude (distance from Earth's center in meters)
// Output: Object containing umbra and penumbra diameters in meters
    calculateShadowRadii(altitude) {
        // Constants (all in meters)
        // Earth's radius, used as the size of the object casting the shadow
        const EARTH_RADIUS = 6371000; // meters
        // Sun's radius, used to calculate its angular size
        const SUN_RADIUS = 696000000; // meters
        // Average Earth-Sun distance (1 AU), used to compute the Sun's angular size
        const EARTH_SUN_DISTANCE = 149600000000; // meters

        // Input validation: Ensure altitude is non-negative
        // Negative altitudes are physically invalid (below Earth's center)
        if (altitude < 0) {
            throw new Error("Altitude must be non-negative");
        }

        // Calculate the Sun's angular radius (half of angular diameter)
        // This is the angle subtended by the Sun's radius at Earth's distance
        // Formula: angular radius = arctan(Sun radius / Earth-Sun distance)
        // This determines how much the Sun's rays converge or diverge
        const sunAngularRadius = Math.atan(SUN_RADIUS / EARTH_SUN_DISTANCE);

        // Calculate the distance to the umbra's tip (where umbra diameter becomes zero)
        // The umbra is a converging cone, ending where Earth's shadow fully blocks the Sun
        // Using similar triangles: distance = Earth's radius / tan(angular radius)
        const umbraTipDistance = EARTH_RADIUS / Math.tan(sunAngularRadius);

        // Umbra diameter calculation
        // The umbra is a conical shadow that narrows with distance
        // At Earth's surface (altitude = EARTH_RADIUS), the umbra diameter equals Earth's diameter
        // At the umbra tip, the diameter is zero
        // For a given altitude, use similar triangles to find the diameter
        let umbraDiameter;
        if (altitude >= umbraTipDistance) {
            // Beyond the umbra tip, the shadow enters the antumbra (no total shadow)
            // Set umbra diameter to 0 as no complete shadow exists
            umbraDiameter = 0;
        } else {
            // Within the umbra, the diameter scales linearly with the remaining distance to the tip
            // Formula: D_umbra = 2 * R_earth * (L_umbra - altitude) / L_umbra
            umbraDiameter = 2 * EARTH_RADIUS * (umbraTipDistance - altitude) / umbraTipDistance;
        }

        // Penumbra calculation
        // The penumbra is the region where any part of the Sun is obscured, forming a diverging cone
        // At Earth's surface, the penumbra diameter is approximately Earth's diameter
        // The penumbra's "tip" is a virtual point behind the Sun where the cone would converge
        // Calculate the penumbra tip distance (negative, indicating divergence)
        const penumbraTipDistance = -EARTH_RADIUS / Math.tan(sunAngularRadius);
        // Penumbra diameter at the given altitude
        // Formula: D_penumbra = 2 * R_earth * (L_penumbra - altitude) / L_penumbra
        // Use absolute value to ensure a positive diameter, as the penumbra grows with distance
        const penumbraDiameter = Math.abs(2 * EARTH_RADIUS * (penumbraTipDistance - altitude) / penumbraTipDistance);

        // Return results as an object
        // Ensure umbra diameter is non-negative for physical accuracy
        // Include altitude and units for clarity
        return {
            umbraDiameter: Math.max(umbraDiameter, 0), // Prevent negative values
            penumbraDiameter: penumbraDiameter, // Always positive due to absolute value
            altitude: altitude,
            units: 'meters'
        };
    }


    rebuild() {
        this.removeCircles();

        const shadowData = this.calculateShadowRadii(this.altitude);
        const umbraRadius = shadowData.umbraDiameter / 2;
        const penumbraRadius = shadowData.penumbraDiameter / 2;
        
        // Globe center in EUS coordinates
        const globeCenter = V3(0, -this.earthRadius, 0);
        
        // Circle center is at altitude along antisolar direction (fromSun)
        const circleCenter = globeCenter.clone().add(this.fromSun.clone().multiplyScalar(this.altitude));
        
        // Create perpendicular vectors for the circle plane
        const perpendicular = perpendicularVector(this.fromSun).normalize();
        const otherPerpendicular = this.fromSun.clone().cross(perpendicular);
        
        const segments = 100;

        // Create umbra circle
        {
            const line_points = [];
            for (let i = 0; i < segments; i++) {
                const theta = i / (segments - 1) * 2 * Math.PI;
                const point = circleCenter.clone();
                point.add(perpendicular.clone().multiplyScalar(Math.cos(theta) * umbraRadius));
                point.add(otherPerpendicular.clone().multiplyScalar(Math.sin(theta) * umbraRadius));
                line_points.push(point.x, point.y, point.z);
            }

            const umbraGeometry = new LineGeometry();
            umbraGeometry.setPositions(line_points);
            this.umbraGeometry = umbraGeometry;
            this.umbraLine = new Line2(this.umbraGeometry, this.umbraMaterial);
            this.umbraLine.computeLineDistances();
            this.umbraLine.scale.setScalar(1);
            this.group.add(this.umbraLine);
        }

        // Create penumbra circle
        {
            const line_points = [];
            for (let i = 0; i < segments; i++) {
                const theta = i / (segments - 1) * 2 * Math.PI;
                const point = circleCenter.clone();
                point.add(perpendicular.clone().multiplyScalar(Math.cos(theta) * penumbraRadius));
                point.add(otherPerpendicular.clone().multiplyScalar(Math.sin(theta) * penumbraRadius));
                line_points.push(point.x, point.y, point.z);
            }

            const penumbraGeometry = new LineGeometry();
            penumbraGeometry.setPositions(line_points);
            this.penumbraGeometry = penumbraGeometry;
            this.penumbraLine = new Line2(this.penumbraGeometry, this.penumbraMaterial);
            this.penumbraLine.computeLineDistances();
            this.penumbraLine.scale.setScalar(1);
            this.group.add(this.penumbraLine);
        }

        propagateLayerMaskObject(this.group);
    }

    /**
     * Update shadow position based on current Sun direction
     */
    update(f) {
        if (Globals.fromSun !== undefined) {

            this.fromSun = Globals.fromSun.clone().normalize();
            this.rebuild();
        }
    }
}