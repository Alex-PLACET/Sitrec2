export function filterSourcesForServerless(sources) {
    return Object.fromEntries(
        Object.entries(sources).filter(([, sourceDef]) => sourceDef?.allowInServerless === true)
    );
}

export function pickAvailableSourceType({
    sources,
    requestedType,
    defaultType,
    fallbackType = "Local",
}) {
    if (requestedType && sources[requestedType]) {
        return requestedType;
    }

    if (defaultType && sources[defaultType]) {
        return defaultType;
    }

    if (fallbackType && sources[fallbackType]) {
        return fallbackType;
    }

    return Object.keys(sources)[0];
}
