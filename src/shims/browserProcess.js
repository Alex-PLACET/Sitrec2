const scheduleMicrotask = typeof queueMicrotask === "function"
    ? queueMicrotask
    : (callback) => Promise.resolve().then(callback);

const env = typeof __SITREC_BROWSER_PROCESS_ENV__ === "undefined"
    ? {}
    : __SITREC_BROWSER_PROCESS_ENV__;

const browserProcess = {
    argv: [],
    browser: true,
    cwd: () => "/",
    env,
    nextTick(callback, ...args) {
        if (typeof callback !== "function") {
            return;
        }

        scheduleMicrotask(() => callback(...args));
    },
    platform: "browser",
    stderr: {
        write() {
        },
    },
    stdout: {
        write() {
        },
    },
    version: "",
    versions: {},
};

module.exports = browserProcess;
