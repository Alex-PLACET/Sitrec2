// parseXML from https://stackoverflow.com/questions/4200913/xml-to-javascript-object

export function parseXml(xml, arrayTags)
{
    let dom = null;
    if (window.DOMParser)
    {
        dom = (new DOMParser()).parseFromString(xml, "text/xml");
    }
    else if (window.ActiveXObject)
    {
        dom = new ActiveXObject('Microsoft.XMLDOM');
        dom.async = false;
        if (!dom.loadXML(xml))
        {
            throw new Error(dom.parseError.reason + " " + dom.parseError.srcText);
        }
    }
    else
    {
        throw new Error("cannot parse xml string!");
    }

    function isArray(o)
    {
        return Array.isArray(o);
    }

    function parseNode(xmlNode, result)
    {
        if (xmlNode.nodeName === "#text") {
            const v = xmlNode.nodeValue;
            if (v.trim()) {
                result['#text'] = v;
            }
            return;
        }

        const jsonNode = {};
        const existing = result[xmlNode.nodeName];
        if(existing)
        {
            if(!isArray(existing))
            {
                result[xmlNode.nodeName] = [existing, jsonNode];
            }
            else
            {
                result[xmlNode.nodeName].push(jsonNode);
            }
        }
        else
        {
            if(arrayTags && arrayTags.includes(xmlNode.nodeName))
            {
                result[xmlNode.nodeName] = [jsonNode];
            }
            else
            {
                result[xmlNode.nodeName] = jsonNode;
            }
        }

        if(xmlNode.attributes)
        {
            const length = xmlNode.attributes.length;
            for(let i = 0; i < length; i++)
            {
                const attribute = xmlNode.attributes[i];
                jsonNode[attribute.nodeName] = attribute.nodeValue;
            }
        }

        const length2 = xmlNode.childNodes.length;
        for(let i = 0; i < length2; i++)
        {
            parseNode(xmlNode.childNodes[i], jsonNode);
        }
    }

    const result = {};
    for (let i = 0; i < dom.childNodes.length; i++)
    {
        parseNode(dom.childNodes[i], result);
    }

    return result;
}
