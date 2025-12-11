// parseXML from https://stackoverflow.com/questions/4200913/xml-to-javascript-object
import {atan, degrees, radians, tan} from "./utils";
import {MISB, MISBFields} from "./MISBUtils";
import {CTrackFile} from "./CTrackFile";
import {CTrackFileKML} from "./CTrackFileKML";
import {CTrackFileXML} from "./CTrackFileXML";
import {timeStrToEpoch} from "./DateTimeUtils";

export {CTrackFile, CTrackFileKML, CTrackFileXML};

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
//                    result = v;
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

export function doesKMLContainTrack(kml) {
    let trackFile;
    if (kml instanceof CTrackFileKML) {
        trackFile = kml;
    } else {
        trackFile = new CTrackFileKML(kml);
    }
    return trackFile.doesContainTrack();
}

// DJI SRT format is in six lines:
// 3
// 00:00:00,032 --> 00:00:00,049
// <font size="28">FrameCnt: 3, DiffTime: 17ms
// 2023-12-17 15:27:55.313
// [iso: 100] [shutter: 1/640.0] [fnum: 3.4] [ev: 0] [color_md: default] [focal_len: 166.00] [latitude: 36.06571] [longitude: -119.01938] [rel_alt: 17.800 abs_alt: 134.835] [ct: 5896] </font>
// <blank line>


// We are using the simple DJI-Mini SRT column names as generic names
// maybe come up with a better mapping, with more consistent names
// as the fuller DJI TXT (AirData) format has more, but is also missing some fields
// Keep as index? Probably not needed for speed

export const SRT = {
    FrameCnt: 0,
    DiffTime:1,
    iso:2,
    shutter:3,
    fnum:4,
    ev:5,
    color_md:6,
    focal_len:7,
    latitude:8,
    longitude:9,
    rel_alt:10,
    abs_alt:11,
    ct:12,
    date: 13,
    heading: 14,
    pitch: 15,
    roll: 16,
    gHeading: 17,
    gPitch: 18,
    gRoll: 19,

}

const SRTFields = Object.keys(SRT).length;


export function parseSRT(data) {
    const lines = data.split('\n');
    if (lines[4] == "2" && lines [8] == "3") {
        return parseSRT2(lines)
    }
    return parseSRT1(lines)
}

// Placeholder function for SRT2 format - currently not implemented
// TODO: Implement parseSRT2 based on the commented code below
function parseSRT2(lines) {
    console.warn("parseSRT2 is not yet implemented - falling back to parseSRT1");
    return parseSRT1(lines);
}




/* Type 2 is like:
1
00:00:00,000 --> 00:00:01,000
F/2.8, SS 1950.57, ISO 100, EV 0, DZOOM 1.000, GPS (-121.1689, 38.7225, 21), D 118.43m, H -1.50m, H.S 0.00m/s, V.S -0.00m/s

2
00:00:01,000 --> 00:00:02,000
F/2.8, SS 1950.57, ISO 100, EV 0, DZOOM 1.000, GPS (-121.1689, 38.7225, 21), D 118.46m, H -1.50m, H.S 0.22m/s, V.S -0.00m/s

3
00:00:02,000 --> 00:00:03,000
F/2.8, SS 1950.57, ISO 100, EV 0, DZOOM 1.000, GPS (-121.1689, 38.7225, 21), D 118.47m, H -1.60m, H.S 0.41m/s, V.S -0.00m/s

 */

// DEPRECATED - but might be needed later.
// SRT2 format was used for DJI drone data from my DJI Mini SE 2
// But I use the Airdata format. This code was converted to use MISB field
// but not tested.
//
// // Mapping of SRT2 (DJI/Folsom Lake) fields to MISB fields
// const MISBMap = {
// //    "F/":   SRT.fnum,
// //    "SS ":  SRT.shutter,
// //    "ISO ": SRT.iso,
// //    "EV " : SRT.ev,
//     "H ":   MISB.SensorRelativeAltitude,
// }
//
// export function parseSRT2(lines) {
//     const numPoints = Math.floor(lines.length / 4);
//     let MISBArray = new Array(numPoints);
//
//     const startTime = new Date(Sit.startTime);
//
//     for (let i = 0; i < numPoints; i++) {
//         let dataIndex = i * 4;
//         const frameTimeString = lines[dataIndex + 1].split(' --> ')[0];
//     //    console.log(frameTimeString)
//         const date = convertToRelativeTime(startTime,frameTimeString)
//         console.log(date)
//         MISBArray[i] = new Array(MISBFields).fill(null);
//         MISBArray[i][MISB.UnixTimeStamp] = date;
//         const frameInfo = splitOnCommas(lines[dataIndex + 2])
//         // Extract frame information
//         frameInfo.forEach(info => {
//             //console.log("# "+info)
//             var gotInfo = false;
//             for (let start in MISBMap) {
//                 if (info.startsWith(start)) {
//                     let value = info.substring(start.length);
//              //       console.log(info+" - Set mapped field "+SRTMap[start] + " to "+value )
//
//                     MISBArray[i][MISBMap[start]] = value;
//                     gotInfo = true;
//                     break;
//                 }
//             }
//             if (!gotInfo && info.startsWith("GPS ")) {
//                 let value = info.substring(4); // 4 is len of "GPS "
//                 const lla = extractLLA(value);
//                 //console.log (lla.latitude + ","+lla.longitude+","+lla.altitude)
//                 MISBArray[i][MISB.SensorLatitude] = lla.latitude;
//                 MISBArray[i][MISB.SensorLongitude] = lla.longitude;
//                 MISBArray[i][MISB.SensorTrueAltitude] = Sit.startAltitude + MISBArray[i][MISB.SensorRelativeAltitude];
//
//             }
//         });
//         MISBArray[i][MISB.SensorVerticalFieldofView] = 10; // hard coded for now to DJI Mini 2 vfov
//  //       console.log(SRTArray[i])
//
//
//     }
//
//
//     return SRTArray;
//
// }


// maps the SRT fields that are directly equivalent to MISB fields
// null entries are ignored, but some will need conversion
const SRTMapMISB = {
        FrameCnt: null,
        DiffTime: null,
        iso:null,
        shutter:null,
        fnum:null,
        ev:null,
        color_md:null,
        focal_len:null,  // will need to convert this to FOV
        latitude:MISB.SensorLatitude,
        longitude:MISB.SensorLongitude,
        rel_alt:MISB.SensorRelativeAltitude,
        abs_alt:MISB.SensorTrueAltitude,
        ct:null,
        date: null,  // also needs converting
        heading: MISB.PlatformHeadingAngle,
        pitch: MISB.PlatformPitchAngle,
        roll: MISB.PlatformRollAngle,
        gHeading: MISB.SensorRelativeAzimuthAngle,
        gPitch: MISB.SensorRelativeElevationAngle,
        gRoll: MISB.SensorRelativeRollAngle,
}

// SRT1 (e.g. SitPorterville) format is sets of six lines:
// 0: 1
// 1: 00:00:00,000 --> 00:00:00,016
// 2: <font size="28">FrameCnt: 1, DiffTime: 16ms
// 3: 2023-12-17 15:27:55.258
// 4:     [iso: 100] [shutter: 1/640.0] [fnum: 3.4] [ev: 0] [color_md: default] [focal_len: 166.00] [latitude: 36.06571] [longitude: -119.01938] [rel_alt: 17.800 abs_alt: 134.835] [ct: 5896] </font>
// 5: ...blank line...
export function parseSRT1(lines) {
    const numPoints = Math.floor(lines.length / 6);
    let MISBArray = new Array(numPoints);

    // iterate over all lines and remove any html formatting
    for (let i = 0; i < lines.length; i++) {
        // Remove all html tags
        lines[i] = lines[i].replace(/<[^>]*>/g, '');
    }

    for (let i = 0; i < numPoints; i++) {
        let dataIndex = i * 6;
        let frameInfo = lines[dataIndex + 2].split(', ');
        let detailInfo = lines[dataIndex + 4].match(/\[(.*?)\]/g);

        MISBArray[i] = new Array(MISBFields).fill(null);

        // Extract frame information (FrameCnt and DiffTime in Porterville)
        // NOT USED!!
        frameInfo.forEach(info => {
            let [key, value] = info.split(': ');
//            console.log(key +": "+value)
            if (SRT.hasOwnProperty(key)) {
//                MISBArray[i][SRT[key]] = value.replace('ms', '').trim();
//                console.log("key: "+key+" value: "+value+" SRTMapMISB[SRT[key]]: "+SRTMapMISB[key]);
                if(SRTMapMISB[key] !== null) {
                    MISBArray[i][SRTMapMISB[key]] = value.replace('ms', '').trim();
                }
            }
        });

        // Extract detailed information (LLA, and camera settings)
        detailInfo.forEach(info => {
            let details = info.replace(/[\[\]]/g, '');
            let tokens = details.split(' ');
            for (let j = 0; j < tokens.length; j += 2) {
                let key = tokens[j].replace(':', '');
                let value = tokens[j + 1].trim();

                if (SRT.hasOwnProperty(key)) {
       //             MISBArray[i][SRT[key]] = value;
                    if(SRTMapMISB[key] !== null) {
                        MISBArray[i][SRTMapMISB[key]] = value;
                    }

                    if (key === 'focal_len') {
                        // Convert focal length to FOV
                        let focal_len = parseFloat(value);

                        let referenceFocalLength = 166;
                        let referenceFOV = 5;

                        const sensorSize = 2 * referenceFocalLength * tan(radians(referenceFOV) / 2)
                        const vFOV = degrees(2 * atan(sensorSize / 2 / focal_len))

                        MISBArray[i][MISB.SensorVerticalFieldofView] = vFOV;
                    }


                }
            }
        });

        // Extract date
//        MISBArray[i][SRT['date']] = lines[dataIndex + 3].trim();
        const date = timeStrToEpoch(lines[dataIndex + 3].trim());
        // convert to milliseconds
        const dateMS = new Date(date).getTime();
        MISBArray[i][MISB.UnixTimeStamp] = dateMS;
  //      console.log(MISBArray[i][MISB.UnixTimeStamp])
    }

    return MISBArray;
}

/*
time(millisecond)
datetime(utc)
latitude
longitude
height_above_takeoff(feet)
height_above_ground_at_drone_location(feet)
ground_elevation_at_drone_location(feet)
altitude_above_seaLevel(feet)
height_sonar(feet)
speed(mph)
distance(feet)
mileage(feet)
satellites
gpslevel
voltage(v)
max_altitude(feet)
max_ascent(feet)
max_speed(mph)
max_distance(feet)
xSpeed(mph)
ySpeed(mph)
zSpeed(mph)
compass_heading(degrees)
pitch(degrees)
roll(degrees)
isPhoto
isVideo
rc_elevator
rc_aileron
rc_throttle
rc_rudder
rc_elevator(percent)
rc_aileron(percent)
rc_throttle(percent)
rc_rudder(percent)
gimbal_heading(degrees)
gimbal_pitch(degrees)
gimbal_roll(degrees)
battery_percent
voltageCell1
voltageCell2
voltageCell3
voltageCell4
voltageCell5
voltageCell6
current(A)
battery_temperature(f)
altitude(feet)
ascent(feet)
flycStateRaw
flycState
message
*/


export function KMLToMISB(kml, trackIndex = 0) {
    let trackFile;
    if (kml instanceof CTrackFileKML) {
        trackFile = kml;
    } else {
        trackFile = new CTrackFileKML(kml);
    }
    return trackFile.toMISB(trackIndex);
}

///////////////////////////////////////////////////
// XML like STANAG

export function doesXMLContainTrack(xml) {
    let trackFile;
    if (xml instanceof CTrackFileXML) {
        trackFile = xml;
    } else {
        trackFile = new CTrackFileXML(xml);
    }
    return trackFile.doesContainTrack();
}

export function XMLToMISB(xml, trackIndex = 0) {
    let trackFile;
    if (xml instanceof CTrackFileXML) {
        trackFile = xml;
    } else {
        trackFile = new CTrackFileXML(xml);
    }
    return trackFile.toMISB(trackIndex);
}
