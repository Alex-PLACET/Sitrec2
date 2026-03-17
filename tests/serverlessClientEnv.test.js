const {
    buildServerlessClientEnv,
    buildWebpackDefineEnv,
} = require("../scripts/serverlessClientEnv");

describe("buildServerlessClientEnv", () => {
    test("keeps benign settings but blanks secrets and forces offline-safe flags", () => {
        const env = buildServerlessClientEnv({
            exampleEnv: {
                BANNER_ACTIVE: "true",
                CHATBOT_ENABLED: "true",
                DEFAULT_MAP_TYPE: "MapBox",
            },
            liveEnv: {
                LOCALHOST: "local.metabunk.org",
                MAPBOX_TOKEN: "pk.1234567890ABCDEFGHIJKLMN",
                MAPTILER_KEY: "abcdefghijklmnopqrstuv",
                SAVE_TO_SERVER: "true",
            },
        });

        expect(env.BANNER_ACTIVE).toBe("true");
        expect(env.DEFAULT_MAP_TYPE).toBe("MapBox");
        expect(env.LOCALHOST).toBe("local.metabunk.org");
        expect(env.MAPBOX_TOKEN).toBe("");
        expect(env.MAPTILER_KEY).toBe("");
        expect(env.CHATBOT_ENABLED).toBe("false");
        expect(env.SAVE_TO_SERVER).toBe("false");
        expect(env.IS_SERVERLESS_BUILD).toBe("true");
    });

    test("converts env values into DefinePlugin mappings", () => {
        expect(buildWebpackDefineEnv({
            CHATBOT_ENABLED: "false",
            LOCALHOST: "localhost",
        })).toEqual({
            "process.env.CHATBOT_ENABLED": JSON.stringify("false"),
            "process.env.LOCALHOST": JSON.stringify("localhost"),
        });
    });
});
