import {CManager} from "./CManager";
import {CNodeFeatureMarker} from "./nodes/CNodeLabels3D";
import {NodeMan} from "./Globals";

/**
 * CFeatureManager
 * Manages geographic feature markers (labels with arrows pointing to locations)
 * Similar to TrackManager, but for static geographic features
 */
class CFeatureManager extends CManager {
    constructor() {
        super();
    }

    /**
     * Add a feature marker
     * @param {Object} options - Feature marker creation options
     * @param {string} options.id - Unique identifier for the marker
     * @param {string} options.text - Label text to display
     * @param {Object} options.positionLLA - Position in lat/lon/alt
     * @param {number} options.positionLLA.lat - Latitude
     * @param {number} options.positionLLA.lon - Longitude
     * @param {number} options.positionLLA.alt - Altitude (0 = conform to ground)
     * @returns {CNodeFeatureMarker} The created feature marker node
     */
    addFeature(options) {
        const featureNode = new CNodeFeatureMarker(options);
        
        // Add to manager with the node's ID
        this.add(featureNode.id, featureNode);
        
        console.log(`Added feature marker: ${options.text} at (${options.positionLLA.lat}, ${options.positionLLA.lon}, ${options.positionLLA.alt})`);
        
        return featureNode;
    }

    /**
     * Remove a feature marker
     * @param {string} id - The feature marker ID to remove
     */
    removeFeature(id) {
        if (this.exists(id)) {
            const featureNode = this.get(id);
            
            // Dispose the node (removes arrow, sprite, etc.)
            if (featureNode.dispose) {
                featureNode.dispose();
            }
            
            // Remove from NodeMan if it's registered there
            if (NodeMan.exists(id)) {
                NodeMan.unlinkDisposeRemove(id);
            }
            
            // Remove from this manager
            this.remove(id);
            
            console.log(`Removed feature marker: ${id}`);
        }
    }

    /**
     * Remove all feature markers
     */
    removeAll() {
        const ids = Object.keys(this.list);
        ids.forEach(id => {
            this.removeFeature(id);
        });
        console.log(`Removed all ${ids.length} feature markers`);
    }

    /**
     * Serialize all feature markers
     * This is called during the serialization process to save feature markers
     * @returns {Array} Array of feature marker data objects
     */
    serialize() {
        const features = [];
        
        this.iterate((key, featureNode) => {
            if (featureNode.lla) {
                const featureData = {
                    id: featureNode.id,
                    text: featureNode.text,
                    lat: featureNode.lla.lat,
                    lon: featureNode.lla.lon,
                    alt: featureNode.lla.alt,
                };
                
                features.push(featureData);
            }
        });
        
        if (features.length > 0) {
            console.log(`Serialized ${features.length} feature marker(s)`);
        }
        
        return features;
    }

    /**
     * Deserialize feature markers
     * This is called during the deserialization process to recreate feature markers
     * @param {Array} featuresData - Array of feature marker data objects
     */
    deserialize(featuresData) {
        if (!featuresData || featuresData.length === 0) {
            console.log("No feature markers to deserialize");
            return;
        }
        
        console.log(`Deserializing ${featuresData.length} feature marker(s)`);
        
        for (const featureData of featuresData) {
            try {
                this.addFeature({
                    id: featureData.id,
                    text: featureData.text,
                    positionLLA: {
                        lat: featureData.lat,
                        lon: featureData.lon,
                        alt: featureData.alt
                    }
                });
                
                console.log(`Deserialized feature marker: ${featureData.text}`);
            } catch (error) {
                console.error(`Failed to deserialize feature marker ${featureData.id}:`, error);
            }
        }
    }
}

// Export a global singleton instance
export const FeatureManager = new CFeatureManager();