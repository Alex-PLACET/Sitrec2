import {showErrorOnce} from "./showError";
import {identifyServiceFromUrl} from "./TileUsageTracker";

class ServiceAvailabilityClass {
    constructor() {
        this.services = {};
        this.failureThreshold = 3;
        this.callbacks = {}; // serviceName → [callback, ...]
    }

    _getService(name) {
        if (!this.services[name]) {
            this.services[name] = {failures: 0, available: true, notified: false};
        }
        return this.services[name];
    }

    isAvailable(serviceName) {
        const svc = this.services[serviceName];
        return !svc || svc.available;
    }

    isAvailableByUrl(url) {
        return this.isAvailable(identifyServiceFromUrl(url));
    }

    recordFailure(serviceName) {
        const svc = this._getService(serviceName);
        if (!svc.available) return; // already marked unavailable
        svc.failures++;
        if (svc.failures >= this.failureThreshold) {
            this.markUnavailable(serviceName);
        }
    }

    recordFailureByUrl(url) {
        this.recordFailure(identifyServiceFromUrl(url));
    }

    recordSuccess(serviceName) {
        const svc = this._getService(serviceName);
        svc.failures = 0;
        svc.available = true;
    }

    recordSuccessByUrl(url) {
        this.recordSuccess(identifyServiceFromUrl(url));
    }

    markUnavailable(serviceName) {
        const svc = this._getService(serviceName);
        svc.available = false;

        if (!svc.notified) {
            svc.notified = true;
            showErrorOnce(
                `service-unavailable-${serviceName}`,
                `Service "${serviceName}" appears to be unavailable (${this.failureThreshold} consecutive failures). ` +
                `Switching to offline fallback. Use the Refresh button in the Terrain menu to retry when connectivity is restored.`
            );
        }

        // Invoke registered fallback callbacks
        const cbs = this.callbacks[serviceName];
        if (cbs) {
            for (const cb of cbs) {
                try {
                    cb(serviceName);
                } catch (e) {
                    console.warn(`ServiceAvailability: fallback callback error for ${serviceName}`, e);
                }
            }
        }
    }

    onUnavailable(serviceName, callback) {
        if (!this.callbacks[serviceName]) {
            this.callbacks[serviceName] = [];
        }
        this.callbacks[serviceName].push(callback);
    }

    reset(serviceName) {
        if (serviceName) {
            delete this.services[serviceName];
        } else {
            this.services = {};
        }
    }
}

export const ServiceAvailability = new ServiceAvailabilityClass();
