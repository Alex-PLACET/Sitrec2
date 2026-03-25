import {Globals} from "./Globals";

/*
    Simple assertion function for debugging.
    If the condition is false, it logs a stack trace and an error message,
    then triggers the debugger.


    Stripped out on production build by the Terser plugin's pure_funcs option.
    See webpack.common.js for configuration.

    @param {boolean} condition - The condition to assert.
    @param {string|boolean} [message=false] - Optional message to log on failure.
*/

export function assert(condition, message = false) {
    if (!condition) {
        console.trace()
        console.error("ASSERT: " + message);

        // MCP debugging: if the bridge is active, capture the assert instead of
        // hitting debugger (which would halt JS and cause an MCP timeout).
        // Hard limit of 10 asserts before throwing to prevent runaway cascades.
        if (typeof window !== "undefined" && window._mcpDebug) {
            const stack = new Error().stack;
            if (!window._mcpAsserts) window._mcpAsserts = [];
            window._mcpAsserts.push({ message: String(message), stack });
            if (window._mcpAsserts.length >= 10) {
                throw new Error("MCP assert limit (10) reached. Last: " + message);
            }
            return; // skip debugger so execution continues
        }

        if (!Globals.validationMode) {
            debugger;
        }
    }
}