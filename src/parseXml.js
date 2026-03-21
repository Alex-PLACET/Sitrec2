// Parse an XML string into a nested JavaScript object.
// arrayTags: optional array of tag names that should always be wrapped in arrays,
// even when only a single element is present.
export function parseXml(xml, arrayTags) {
    const dom = new DOMParser().parseFromString(xml, "text/xml");

    function visitNode(node, obj) {
        // Store non-empty text nodes under a special key
        if (node.nodeType === Node.TEXT_NODE) {
            if (node.nodeValue.trim()) {
                obj["#text"] = node.nodeValue;
            }
            return;
        }

        const entry = {};

        // Copy element attributes
        if (node.attributes) {
            for (let i = 0; i < node.attributes.length; i++) {
                entry[node.attributes[i].name] = node.attributes[i].value;
            }
        }

        // Recurse into children
        for (let i = 0; i < node.childNodes.length; i++) {
            visitNode(node.childNodes[i], entry);
        }

        // Merge this entry into the parent object, promoting to array on duplicates
        const tag = node.nodeName;
        const prev = obj[tag];
        if (prev !== undefined) {
            // Already have this tag — ensure it's an array and append
            if (Array.isArray(prev)) {
                prev.push(entry);
            } else {
                obj[tag] = [prev, entry];
            }
        } else if (arrayTags && arrayTags.includes(tag)) {
            obj[tag] = [entry];
        } else {
            obj[tag] = entry;
        }
    }

    const result = {};
    for (let i = 0; i < dom.childNodes.length; i++) {
        visitNode(dom.childNodes[i], result);
    }
    return result;
}
