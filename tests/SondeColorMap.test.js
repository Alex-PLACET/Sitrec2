import {gradientColor, sondeColor, ALTITUDE_STOPS, TEMPERATURE_STOPS, PRESSURE_STOPS} from '../src/SondeColorMap';
import {Color} from 'three';

describe('gradientColor', () => {
    var stops = [
        { value: 0,   color: new Color(0, 0, 1) },  // blue
        { value: 50,  color: new Color(0, 1, 0) },  // green
        { value: 100, color: new Color(1, 0, 0) },  // red
    ];

    test('returns first color below range', () => {
        var c = gradientColor(-10, stops);
        expect(c.r).toBeCloseTo(0);
        expect(c.g).toBeCloseTo(0);
        expect(c.b).toBeCloseTo(1);
    });

    test('returns last color above range', () => {
        var c = gradientColor(200, stops);
        expect(c.r).toBeCloseTo(1);
        expect(c.g).toBeCloseTo(0);
        expect(c.b).toBeCloseTo(0);
    });

    test('returns exact stop color', () => {
        var c = gradientColor(50, stops);
        expect(c.r).toBeCloseTo(0);
        expect(c.g).toBeCloseTo(1);
        expect(c.b).toBeCloseTo(0);
    });

    test('interpolates between stops', () => {
        var c = gradientColor(25, stops);
        // Midpoint between blue (0,0,1) and green (0,1,0)
        expect(c.r).toBeCloseTo(0);
        expect(c.g).toBeCloseTo(0.5);
        expect(c.b).toBeCloseTo(0.5);
    });

    test('interpolates at 75%', () => {
        var c = gradientColor(75, stops);
        // Midpoint between green (0,1,0) and red (1,0,0)
        expect(c.r).toBeCloseTo(0.5);
        expect(c.g).toBeCloseTo(0.5);
        expect(c.b).toBeCloseTo(0);
    });
});

describe('sondeColor', () => {
    test('altitude mode returns blue at surface', () => {
        var c = sondeColor("altitude", 0, null, null, new Color(1, 1, 1));
        expect(c.b).toBeGreaterThan(0.5);
    });

    test('altitude mode returns red at 35km', () => {
        var c = sondeColor("altitude", 35000, null, null, new Color(1, 1, 1));
        expect(c.r).toBeCloseTo(1);
        expect(c.g).toBeCloseTo(0);
        expect(c.b).toBeCloseTo(0);
    });

    test('temperature mode returns blue at -80C', () => {
        var c = sondeColor("temperature", null, -80, null, new Color(1, 1, 1));
        expect(c.b).toBeCloseTo(1);
    });

    test('temperature mode returns red at 40C', () => {
        var c = sondeColor("temperature", null, 40, null, new Color(1, 1, 1));
        expect(c.r).toBeCloseTo(1);
    });

    test('pressure mode returns blue at surface', () => {
        var c = sondeColor("pressure", null, null, 1013, new Color(1, 1, 1));
        expect(c.b).toBeGreaterThan(0.5);
    });

    test('pressure mode returns red near burst', () => {
        var c = sondeColor("pressure", null, null, 5, new Color(1, 1, 1));
        expect(c.r).toBeCloseTo(1);
    });

    test('none mode returns fallback', () => {
        var c = sondeColor("none", 10000, -30, 500, new Color(0.5, 0.5, 0.5));
        expect(c.r).toBeCloseTo(0.5);
        expect(c.g).toBeCloseTo(0.5);
        expect(c.b).toBeCloseTo(0.5);
    });

    test('missing data returns fallback', () => {
        var c = sondeColor("altitude", null, null, null, new Color(1, 1, 1));
        expect(c.r).toBeCloseTo(1);
        expect(c.g).toBeCloseTo(1);
        expect(c.b).toBeCloseTo(1);
    });
});

describe('standard color ramps cover expected ranges', () => {
    test('altitude stops cover 0 to 35000m', () => {
        expect(ALTITUDE_STOPS[0].value).toBe(0);
        expect(ALTITUDE_STOPS[ALTITUDE_STOPS.length - 1].value).toBe(35000);
    });

    test('temperature stops cover -80 to 40C', () => {
        expect(TEMPERATURE_STOPS[0].value).toBe(-80);
        expect(TEMPERATURE_STOPS[TEMPERATURE_STOPS.length - 1].value).toBe(40);
    });

    test('pressure stops cover 5 to 1013 hPa', () => {
        expect(PRESSURE_STOPS[0].value).toBe(5);
        expect(PRESSURE_STOPS[PRESSURE_STOPS.length - 1].value).toBe(1013);
    });
});
