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
        if (!Globals.validationMode) {
            debugger;
        }
    }
}