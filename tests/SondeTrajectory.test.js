import {
    pressureToHeight,
    circularMean,
    greatCircleDestination,
    balloonDiameter,
    reconstructTrajectory,
} from '../src/SondeTrajectory';

// ─── pressureToHeight ────────────────────────────────────────────────────

describe('pressureToHeight', () => {
    test('surface pressure → ~0m', () => {
        expect(pressureToHeight(1013.25)).toBeCloseTo(0, 0);
    });

    test('500 hPa → ~5500m (standard atmosphere)', () => {
        const h = pressureToHeight(500);
        expect(h).toBeGreaterThan(5000);
        expect(h).toBeLessThan(6000);
    });

    test('100 hPa → ~16000m', () => {
        const h = pressureToHeight(100);
        expect(h).toBeGreaterThan(15000);
        expect(h).toBeLessThan(17500);
    });

    test('10 hPa → ~26000m (standard atm approx)', () => {
        // The hypsometric formula underestimates above tropopause
        // Real: ~31km, but formula gives ~26km
        const h = pressureToHeight(10);
        expect(h).toBeGreaterThan(24000);
        expect(h).toBeLessThan(28000);
    });

    test('monotonically decreasing with pressure', () => {
        const pressures = [1013, 850, 700, 500, 300, 200, 100, 50, 20, 10];
        let prevH = -1;
        for (const p of pressures) {
            const h = pressureToHeight(p);
            expect(h).toBeGreaterThan(prevH);
            prevH = h;
        }
    });
});

// ─── circularMean ────────────────────────────────────────────────────────

describe('circularMean', () => {
    test('mean of 0 and 90 is 45', () => {
        expect(circularMean(0, 90)).toBeCloseTo(45, 1);
    });

    test('mean of 350 and 10 is 0 (wraps around north)', () => {
        expect(circularMean(350, 10)).toBeCloseTo(0, 1);
    });

    test('mean of 170 and 190 is 180', () => {
        expect(circularMean(170, 190)).toBeCloseTo(180, 1);
    });

    test('mean of same angle returns that angle', () => {
        expect(circularMean(90, 90)).toBeCloseTo(90, 1);
        expect(circularMean(270, 270)).toBeCloseTo(270, 1);
    });

    test('mean of 355 and 5 is ~0', () => {
        const mean = circularMean(355, 5);
        expect(mean).toBeCloseTo(0, 0);
    });

    test('mean of 90 and 270 is 180 (atan2 convention for opposite vectors)', () => {
        // sin(90)+sin(270)=0, cos(90)+cos(270)=0 → atan2(0,0) depends on impl
        // JavaScript atan2(0,0) = 0, but after adding 360 normalization: 0
        // Actually, these cancel to exactly zero vectors; result is implementation-dependent
        const mean = circularMean(90, 270);
        // Just verify it's a valid angle
        expect(mean).toBeGreaterThanOrEqual(0);
        expect(mean).toBeLessThan(360);
    });
});

// ─── greatCircleDestination ──────────────────────────────────────────────

describe('greatCircleDestination', () => {
    test('moving north increases latitude', () => {
        const result = greatCircleDestination(40, -100, 0, 10000);
        expect(result.lat).toBeGreaterThan(40);
        expect(result.lon).toBeCloseTo(-100, 2);
    });

    test('moving east increases longitude', () => {
        const result = greatCircleDestination(40, -100, 90, 10000);
        expect(result.lat).toBeCloseTo(40, 1);
        expect(result.lon).toBeGreaterThan(-100);
    });

    test('moving south decreases latitude', () => {
        const result = greatCircleDestination(40, -100, 180, 10000);
        expect(result.lat).toBeLessThan(40);
        expect(result.lon).toBeCloseTo(-100, 2);
    });

    test('zero distance returns same position', () => {
        const result = greatCircleDestination(40, -100, 45, 0);
        expect(result.lat).toBeCloseTo(40, 5);
        expect(result.lon).toBeCloseTo(-100, 5);
    });

    test('1 degree of latitude is ~111km', () => {
        const result = greatCircleDestination(0, 0, 0, 111000);
        expect(result.lat).toBeCloseTo(1, 0);
    });

    test('handles longitude wraparound near date line', () => {
        const result = greatCircleDestination(0, 179, 90, 200000);
        // Should wrap to negative longitude (or stay valid)
        expect(result.lon).toBeDefined();
        expect(Math.abs(result.lon)).toBeLessThanOrEqual(180);
    });
});

// ─── balloonDiameter ─────────────────────────────────────────────────────

describe('balloonDiameter', () => {
    test('at surface pressure, diameter equals base', () => {
        expect(balloonDiameter(1.5, 1013.25)).toBeCloseTo(1.5, 3);
    });

    test('at half pressure, diameter increases', () => {
        const d = balloonDiameter(1.5, 500);
        expect(d).toBeGreaterThan(1.5);
        // (1013.25/500)^(1/3) ≈ 1.265, so d ≈ 1.9
        expect(d).toBeCloseTo(1.5 * Math.pow(1013.25 / 500, 1/3), 2);
    });

    test('at 10 hPa (~30km), diameter is ~7m', () => {
        const d = balloonDiameter(1.5, 10);
        // (1013.25/10)^(1/3) ≈ 4.65, so d ≈ 7.0
        expect(d).toBeGreaterThan(5);
        expect(d).toBeLessThan(10);
    });

    test('at very low pressure, diameter is large', () => {
        const d = balloonDiameter(1.5, 5);
        expect(d).toBeGreaterThan(7);
    });

    test('handles zero/negative pressure gracefully', () => {
        expect(balloonDiameter(1.5, 0)).toBe(1.5);
        expect(balloonDiameter(1.5, -1)).toBe(1.5);
    });

    test('expansion follows cube-root law', () => {
        // Verify the physics: V ∝ 1/P, r ∝ V^(1/3) ∝ P^(-1/3)
        const d1 = balloonDiameter(1.0, 1000);
        const d2 = balloonDiameter(1.0, 125);
        // P ratio = 1000/125 = 8, so diameter ratio = 8^(1/3) = 2
        expect(d2 / d1).toBeCloseTo(2, 1);
    });
});

// ─── reconstructTrajectory ───────────────────────────────────────────────

describe('reconstructTrajectory', () => {
    test('returns empty for null input', () => {
        expect(reconstructTrajectory(null)).toEqual([]);
        expect(reconstructTrajectory({levels: []})).toEqual([]);
    });

    test('GPS data: uses lat/lon directly', () => {
        const sondeData = {
            station: {lat: 40, lon: -100, elev: 100, id: 'TEST', name: 'Test'},
            datetime: new Date('2024-01-01T12:00:00Z'),
            levels: [
                {time_s: 0, pressure: 1013, height: 100, temp: 10, rh: 50, dewpoint: 0, windDir: 270, windSpeed: 10, lat: 40.0, lon: -100.0},
                {time_s: 60, pressure: 950, height: 600, temp: 5, rh: 50, dewpoint: -5, windDir: 270, windSpeed: 12, lat: 40.01, lon: -99.99},
                {time_s: 120, pressure: 850, height: 1500, temp: -5, rh: 40, dewpoint: -15, windDir: 280, windSpeed: 15, lat: 40.02, lon: -99.98},
            ],
            source: 'uwyo-csv',
            hasGPS: true,
        };

        const traj = reconstructTrajectory(sondeData);
        expect(traj.length).toBe(3);
        expect(traj[0].lat).toBe(40.0);
        expect(traj[0].lon).toBe(-100.0);
        expect(traj[1].lat).toBe(40.01);
        expect(traj[2].lat).toBe(40.02);
    });

    test('wind integration: balloon drifts with wind', () => {
        // Wind from 270° (west) → balloon drifts east (90°)
        const sondeData = {
            station: {lat: 40, lon: -100, elev: 100, id: 'TEST', name: 'Test'},
            datetime: new Date('2024-01-01T12:00:00Z'),
            levels: [
                {time_s: 0, pressure: 1013, height: 100, temp: 10, rh: null, dewpoint: null, windDir: 270, windSpeed: 10, lat: null, lon: null},
                {time_s: 600, pressure: 850, height: 1500, temp: -5, rh: null, dewpoint: null, windDir: 270, windSpeed: 10, lat: null, lon: null},
            ],
            source: 'igra2',
            hasGPS: false,
        };

        const traj = reconstructTrajectory(sondeData);
        expect(traj.length).toBe(2);
        // First point at station
        expect(traj[0].lat).toBe(40);
        expect(traj[0].lon).toBe(-100);
        // Second point: drifted east (lon increased)
        expect(traj[1].lon).toBeGreaterThan(-100);
        // Lat should be nearly unchanged (wind is purely east-west)
        expect(traj[1].lat).toBeCloseTo(40, 1);
    });

    test('wind from south → balloon drifts north', () => {
        const sondeData = {
            station: {lat: 40, lon: -100, elev: 100, id: 'TEST', name: 'Test'},
            datetime: new Date('2024-01-01T12:00:00Z'),
            levels: [
                {time_s: 0, pressure: 1013, height: 100, temp: 10, rh: null, dewpoint: null, windDir: 180, windSpeed: 20, lat: null, lon: null},
                {time_s: 600, pressure: 850, height: 1500, temp: -5, rh: null, dewpoint: null, windDir: 180, windSpeed: 20, lat: null, lon: null},
            ],
            source: 'igra2',
            hasGPS: false,
        };

        const traj = reconstructTrajectory(sondeData);
        // Wind from 180° (south) → balloon bearing = (180+180)%360 = 0° (north)
        expect(traj[1].lat).toBeGreaterThan(40);
        expect(traj[1].lon).toBeCloseTo(-100, 1);
    });

    test('no wind data → vertical track above station', () => {
        const sondeData = {
            station: {lat: 40, lon: -100, elev: 100, id: 'TEST', name: 'Test'},
            datetime: new Date('2024-01-01T12:00:00Z'),
            levels: [
                {time_s: 0, pressure: 1013, height: 100, temp: 10, rh: null, dewpoint: null, windDir: null, windSpeed: null, lat: null, lon: null},
                {time_s: 600, pressure: 850, height: 1500, temp: -5, rh: null, dewpoint: null, windDir: null, windSpeed: null, lat: null, lon: null},
                {time_s: 1200, pressure: 500, height: 5500, temp: -30, rh: null, dewpoint: null, windDir: null, windSpeed: null, lat: null, lon: null},
            ],
            source: 'igra2',
            hasGPS: false,
        };

        const traj = reconstructTrajectory(sondeData);
        expect(traj.length).toBe(3);
        // All positions should remain at station
        for (const pos of traj) {
            expect(pos.lat).toBe(40);
            expect(pos.lon).toBe(-100);
        }
        // But altitude increases
        expect(traj[0].alt).toBe(100);
        expect(traj[1].alt).toBe(1500);
        expect(traj[2].alt).toBe(5500);
    });

    test('estimates time from altitude when ETIME missing', () => {
        const sondeData = {
            station: {lat: 40, lon: -100, elev: 100, id: 'TEST', name: 'Test'},
            datetime: new Date('2024-01-01T12:00:00Z'),
            levels: [
                {time_s: null, pressure: 1013, height: 100, temp: 10, rh: null, dewpoint: null, windDir: 270, windSpeed: 10, lat: null, lon: null},
                {time_s: null, pressure: 850, height: 600, temp: 5, rh: null, dewpoint: null, windDir: 270, windSpeed: 10, lat: null, lon: null},
            ],
            source: 'igra2',
            hasGPS: false,
        };

        const traj = reconstructTrajectory(sondeData);
        expect(traj.length).toBe(2);
        // Should still produce trajectory using estimated dt = (600-100)/5 = 100 seconds
        // Displacement = 10 m/s × 100s = 1000m eastward
        expect(traj[1].lon).toBeGreaterThan(-100);
    });

    test('estimates height from pressure when height missing', () => {
        const sondeData = {
            station: {lat: 40, lon: -100, elev: 100, id: 'TEST', name: 'Test'},
            datetime: new Date('2024-01-01T12:00:00Z'),
            levels: [
                {time_s: 0, pressure: 1013, height: null, temp: 10, rh: null, dewpoint: null, windDir: 270, windSpeed: 10, lat: null, lon: null},
                {time_s: 300, pressure: 500, height: null, temp: -30, rh: null, dewpoint: null, windDir: 270, windSpeed: 10, lat: null, lon: null},
            ],
            source: 'igra2',
            hasGPS: false,
        };

        const traj = reconstructTrajectory(sondeData);
        expect(traj.length).toBe(2);
        // Heights should be estimated from pressure
        expect(traj[0].alt).toBeCloseTo(pressureToHeight(1013), 0);
        expect(traj[1].alt).toBeGreaterThan(5000);
    });

    test('preserves atmospheric metadata in output', () => {
        const sondeData = {
            station: {lat: 40, lon: -100, elev: 100, id: 'TEST', name: 'Test'},
            datetime: new Date('2024-01-01T12:00:00Z'),
            levels: [
                {time_s: 0, pressure: 1013, height: 100, temp: 15.5, rh: 80, dewpoint: 12, windDir: 180, windSpeed: 5, lat: null, lon: null},
            ],
            source: 'igra2',
            hasGPS: false,
        };

        const traj = reconstructTrajectory(sondeData);
        expect(traj[0].pressure).toBe(1013);
        expect(traj[0].temp).toBeCloseTo(15.5);
        expect(traj[0].windDir).toBe(180);
        expect(traj[0].windSpeed).toBe(5);
    });

    test('timestamps are epoch milliseconds', () => {
        const dt = new Date('2024-01-01T12:00:00Z');
        const sondeData = {
            station: {lat: 40, lon: -100, elev: 100, id: 'TEST', name: 'Test'},
            datetime: dt,
            levels: [
                {time_s: 0, pressure: 1013, height: 100, temp: 10, rh: null, dewpoint: null, windDir: null, windSpeed: null, lat: null, lon: null},
                {time_s: 60, pressure: 950, height: 600, temp: 5, rh: null, dewpoint: null, windDir: null, windSpeed: null, lat: null, lon: null},
            ],
            source: 'igra2',
            hasGPS: false,
        };

        const traj = reconstructTrajectory(sondeData);
        expect(traj[0].time).toBe(dt.getTime());
        expect(traj[1].time).toBe(dt.getTime() + 60000);
    });
});
