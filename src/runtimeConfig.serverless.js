// Serverless/Desktop builds intentionally avoid importing install-specific
// runtime config so provider keys and remote-only endpoints never enter the
// packaged client bundle.
export const configParams = {
    rehostRequiresLogin: false,
    customMapSources: {},
    customElevationSources: {},
    extraHelpLinks: {},
    extraHelpFunctions: {},
};

export const customAltitudeFunction = undefined;
export const customLocationFunction = undefined;
export const localSituation = "custom";
