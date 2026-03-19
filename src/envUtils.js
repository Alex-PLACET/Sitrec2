/**
 * Runtime environment variable access.
 *
 * In Docker deployments, the entrypoint script injects window.__SITREC_ENV__
 * with values from container environment variables. This lets operators
 * configure the app via `docker run -e MAPBOX_TOKEN=...` without rebuilding.
 *
 * getEnv() checks window.__SITREC_ENV__ first (runtime override),
 * then falls back to the build-time value baked in by dotenv-webpack.
 */

/**
 * Get an environment variable, checking runtime overrides first.
 * @param {string} name - Variable name (e.g. "MAPBOX_TOKEN")
 * @param {string} [fallback] - Optional fallback if neither source has the value
 * @returns {string|undefined}
 */
export function getEnv(name, fallback) {
    // Runtime override from Docker entrypoint injection
    if (typeof window !== 'undefined' && window.__SITREC_ENV__ && window.__SITREC_ENV__[name] !== undefined) {
        return window.__SITREC_ENV__[name];
    }

    // Build-time value from dotenv-webpack (process.env.X is replaced at compile time,
    // so we can't do a dynamic lookup — this function must be used with literal names
    // and the caller passes the build-time value as the fallback).
    // However, for new code, callers should pass process.env.X as the fallback:
    //   getEnv("MAPBOX_TOKEN", process.env.MAPBOX_TOKEN)

    return fallback;
}

/**
 * Get a boolean environment variable.
 * @param {string} name - Variable name
 * @param {string} [buildTimeValue] - The build-time process.env.X value as fallback
 * @returns {boolean}
 */
export function getEnvBool(name, buildTimeValue) {
    const val = getEnv(name, buildTimeValue);
    if (val === undefined || val === null || val === '') return false;
    if (typeof val === 'boolean') return val;
    return String(val).toLowerCase() === 'true';
}

/**
 * Get a numeric environment variable.
 * @param {string} name - Variable name
 * @param {string} [buildTimeValue] - The build-time process.env.X value as fallback
 * @param {number} [defaultNum=0] - Default if not set or not a number
 * @returns {number}
 */
export function getEnvNumber(name, buildTimeValue, defaultNum = 0) {
    const val = getEnv(name, buildTimeValue);
    if (val === undefined || val === null || val === '') return defaultNum;
    const num = Number(val);
    return isNaN(num) ? defaultNum : num;
}
