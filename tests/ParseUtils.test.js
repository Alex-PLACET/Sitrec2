import {
    addMillisecondsToDate,
    extractLLA,
    findColumn,
    parseISODate,
    parsePartialDateTime,
    parseUTCDate,
    splitOnCommas
} from "../src/ParseUtils";

describe('splitOnCommas', () => {
    test('splits simple comma-separated values', () => {
        expect(splitOnCommas('a, b, c')).toEqual(['a', 'b', 'c']);
    });

    test('handles values without spaces', () => {
        expect(splitOnCommas('a,b,c')).toEqual(['a', 'b', 'c']);
    });

    test('preserves commas inside parentheses', () => {
        expect(splitOnCommas('func(a, b), c')).toEqual(['func(a, b)', 'c']);
    });

    test('handles nested parentheses', () => {
        expect(splitOnCommas('outer(inner(a, b), c), d')).toEqual(['outer(inner(a, b), c)', 'd']);
    });

    test('strips trailing "m" for meters', () => {
        expect(splitOnCommas('100m, 200m')).toEqual(['100', '200']);
    });

    test('handles empty string', () => {
        expect(splitOnCommas('')).toEqual(['']);
    });

    test('handles single value', () => {
        expect(splitOnCommas('single')).toEqual(['single']);
    });
});

describe('extractLLA', () => {
    test('extracts LLA from parenthesized format', () => {
        const result = extractLLA('(-121.1689, 38.7225, 21)');
        expect(result.longitude).toBeCloseTo(-121.1689, 4);
        expect(result.latitude).toBeCloseTo(38.7225, 4);
        expect(result.altitude).toBeCloseTo(21, 4);
    });

    test('extracts LLA with positive coordinates', () => {
        const result = extractLLA('(45.5, 122.6, 100)');
        expect(result.longitude).toBeCloseTo(45.5, 4);
        expect(result.latitude).toBeCloseTo(122.6, 4);
        expect(result.altitude).toBeCloseTo(100, 4);
    });

    test('handles integer values', () => {
        const result = extractLLA('(10, 20, 30)');
        expect(result.longitude).toBe(10);
        expect(result.latitude).toBe(20);
        expect(result.altitude).toBe(30);
    });

    test('returns null for invalid format', () => {
        expect(extractLLA('invalid')).toBeNull();
        expect(extractLLA('(1, 2)')).toBeNull();
        expect(extractLLA('')).toBeNull();
    });

    test('handles various decimal precisions', () => {
        const result = extractLLA('(-122.123456, 37.987654, 0.5)');
        expect(result.longitude).toBeCloseTo(-122.123456, 6);
        expect(result.latitude).toBeCloseTo(37.987654, 6);
        expect(result.altitude).toBeCloseTo(0.5, 1);
    });
});

describe('findColumn', () => {
    const csv = [
        ['timestamp', 'latitude', 'longitude', 'altitude'],
        ['2024-01-01', '45.0', '-122.0', '100']
    ];

    test('finds column by exact match', () => {
        expect(findColumn(csv, 'latitude', true)).toBe(1);
        expect(findColumn(csv, 'longitude', true)).toBe(2);
    });

    test('finds column by prefix match', () => {
        expect(findColumn(csv, 'lat')).toBe(1);
        expect(findColumn(csv, 'lon')).toBe(2);
        expect(findColumn(csv, 'alt')).toBe(3);
    });

    test('is case insensitive', () => {
        expect(findColumn(csv, 'LATITUDE', true)).toBe(1);
        expect(findColumn(csv, 'Latitude', true)).toBe(1);
        expect(findColumn(csv, 'LAT')).toBe(1);
    });

    test('returns -1 for not found', () => {
        expect(findColumn(csv, 'nonexistent')).toBe(-1);
        expect(findColumn(csv, 'lat', true)).toBe(-1);
    });

    test('accepts array of search terms', () => {
        expect(findColumn(csv, ['time', 'timestamp'])).toBe(0);
        expect(findColumn(csv, ['lat', 'latitude'])).toBe(1);
    });

    test('returns first match from array', () => {
        expect(findColumn(csv, ['nonexistent', 'timestamp'])).toBe(0);
    });

    test('throws on invalid csv input', () => {
        expect(() => findColumn(null, 'test')).toThrow();
        expect(() => findColumn([], 'test')).toThrow();
        expect(() => findColumn('not array', 'test')).toThrow();
    });

    test('handles columns with leading whitespace', () => {
        const csvWithSpaces = [['  latitude', 'longitude']];
        expect(findColumn(csvWithSpaces, 'latitude')).toBe(0);
    });
});

describe('parseUTCDate', () => {
    test('parses YYYY-MM-DD HH:MM:SS format', () => {
        const date = parseUTCDate('2024-01-15 14:30:45');
        expect(date.getUTCFullYear()).toBe(2024);
        expect(date.getUTCMonth()).toBe(0);
        expect(date.getUTCDate()).toBe(15);
        expect(date.getUTCHours()).toBe(14);
        expect(date.getUTCMinutes()).toBe(30);
        expect(date.getUTCSeconds()).toBe(45);
    });

    test('handles midnight', () => {
        const date = parseUTCDate('2024-06-01 00:00:00');
        expect(date.getUTCHours()).toBe(0);
        expect(date.getUTCMinutes()).toBe(0);
        expect(date.getUTCSeconds()).toBe(0);
    });

    test('handles end of day', () => {
        const date = parseUTCDate('2024-12-31 23:59:59');
        expect(date.getUTCHours()).toBe(23);
        expect(date.getUTCMinutes()).toBe(59);
        expect(date.getUTCSeconds()).toBe(59);
    });
});

describe('addMillisecondsToDate', () => {
    test('adds positive milliseconds', () => {
        const date = new Date('2024-01-01T00:00:00Z');
        const result = addMillisecondsToDate(date, 1000);
        expect(result.getTime()).toBe(date.getTime() + 1000);
    });

    test('adds negative milliseconds', () => {
        const date = new Date('2024-01-01T00:00:00Z');
        const result = addMillisecondsToDate(date, -1000);
        expect(result.getTime()).toBe(date.getTime() - 1000);
    });

    test('handles large millisecond values', () => {
        const date = new Date('2024-01-01T00:00:00Z');
        const oneDay = 24 * 60 * 60 * 1000;
        const result = addMillisecondsToDate(date, oneDay);
        expect(result.getUTCDate()).toBe(2);
    });

    test('does not modify original date', () => {
        const date = new Date('2024-01-01T00:00:00Z');
        const originalTime = date.getTime();
        addMillisecondsToDate(date, 1000);
        expect(date.getTime()).toBe(originalTime);
    });

    test('handles zero milliseconds', () => {
        const date = new Date('2024-01-01T00:00:00Z');
        const result = addMillisecondsToDate(date, 0);
        expect(result.getTime()).toBe(date.getTime());
    });
});

describe('parseISODate', () => {
    describe('ISO 8601 with explicit timezone', () => {
        test('parses ISO date with Z (Zulu/UTC)', () => {
            const date = parseISODate('2024-04-24T16:44:11Z');
            expect(date.toISOString()).toBe('2024-04-24T16:44:11.000Z');
        });

        test('parses ISO date with milliseconds and Z', () => {
            const date = parseISODate('2024-04-24T16:44:11.000Z');
            expect(date.toISOString()).toBe('2024-04-24T16:44:11.000Z');
        });

        test('parses ISO date with positive timezone offset', () => {
            const date = parseISODate('2024-04-24T16:44:11+05:00');
            expect(date.getTime()).toBe(Date.parse('2024-04-24T16:44:11+05:00'));
        });

        test('parses ISO date with negative timezone offset', () => {
            const date = parseISODate('2024-04-24T16:44:11-07:00');
            expect(date.getTime()).toBe(Date.parse('2024-04-24T16:44:11-07:00'));
        });

        test('parses ISO date with milliseconds and timezone offset', () => {
            const date = parseISODate('2024-04-24T16:44:11.500+02:00');
            expect(date.getTime()).toBe(Date.parse('2024-04-24T16:44:11.500+02:00'));
        });
    });

    describe('ISO 8601 without timezone (assumes Zulu)', () => {
        test('appends Z to ISO date without timezone', () => {
            const date = parseISODate('2024-04-24T16:44:11');
            expect(date.toISOString()).toBe('2024-04-24T16:44:11.000Z');
        });

        test('appends Z to ISO date with milliseconds but no timezone', () => {
            const date = parseISODate('2024-04-24T16:44:11.123');
            expect(date.toISOString()).toBe('2024-04-24T16:44:11.123Z');
        });

        test('converts to UTC when Z is appended', () => {
            const dateWithoutTz = parseISODate('2024-04-24T16:44:11');
            const dateWithZ = parseISODate('2024-04-24T16:44:11Z');
            expect(dateWithoutTz.getTime()).toBe(dateWithZ.getTime());
        });
    });

    describe('edge cases and invalid input', () => {
        test('handles empty string', () => {
            const date = parseISODate('');
            expect(isNaN(date.getTime())).toBe(true);
        });

        test('handles null input', () => {
            const date = parseISODate(null);
            expect(isNaN(date.getTime())).toBe(true);
        });

        test('handles undefined input', () => {
            const date = parseISODate(undefined);
            expect(isNaN(date.getTime())).toBe(true);
        });

        test('handles invalid date string', () => {
            const date = parseISODate('not-a-date');
            expect(isNaN(date.getTime())).toBe(true);
        });

        test('handles malformed ISO string', () => {
            const date = parseISODate('2024-13-45T25:99:99Z');
            expect(isNaN(date.getTime())).toBe(true);
        });
    });

    describe('timezone offset regex accuracy', () => {
        test('does not append Z to string already ending with Z', () => {
            const date = parseISODate('2024-04-24T16:44:11Z');
            const isoStr = date.toISOString();
            expect(isoStr).not.toMatch(/ZZ/);
        });

        test('does not append Z to string with +HH:MM offset', () => {
            const dateStr = '2024-04-24T16:44:11+05:30';
            const date = parseISODate(dateStr);
            expect(date.getTime()).toBe(Date.parse(dateStr));
        });

        test('does not append Z to string with -HH:MM offset', () => {
            const dateStr = '2024-04-24T16:44:11-03:45';
            const date = parseISODate(dateStr);
            expect(date.getTime()).toBe(Date.parse(dateStr));
        });

        test('appends Z to ISO date with space before time', () => {
            const date = parseISODate('2024-04-24 16:44:11');
            expect(date.toISOString()).toMatch(/Z$/);
        });
    });

    describe('consistency with parseISODate usage', () => {
        test('can be used for CSV date parsing without manual timezone handling', () => {
            const csvDateWithoutTz = '2024-04-24T16:44:11';
            const date = parseISODate(csvDateWithoutTz).getTime();
            expect(typeof date).toBe('number');
            expect(isNaN(date)).toBe(false);
        });

        test('handles both timezone-aware and unaware dates', () => {
            const dates = [
                '2024-04-24T16:44:11Z',
                '2024-04-24T16:44:11+05:00',
                '2024-04-24T16:44:11'
            ];
            
            dates.forEach(dateStr => {
                const date = parseISODate(dateStr);
                expect(isNaN(date.getTime())).toBe(false);
            });
        });
    });
});

describe('parsePartialDateTime', () => {
    const referenceDate = new Date('2024-01-15T10:30:00Z');

    describe('full date/time formats', () => {
        test('parses full ISO datetime', async () => {
            const result = await parsePartialDateTime('2024-01-20T14:45:00Z', referenceDate);
            expect(result.toISOString()).toBe('2024-01-20T14:45:00.000Z');
        });

        test('parses ISO date without timezone', async () => {
            const result = await parsePartialDateTime('2024-01-20T14:45:00', referenceDate);
            expect(result).not.toBeNull();
            expect(result.getUTCFullYear()).toBe(2024);
            expect(result.getUTCMonth()).toBe(0);
            expect(result.getUTCDate()).toBe(20);
        });
    });

    describe('partial time formats with reference date', () => {
        test('parses time only (HH:MM) using reference date', async () => {
            const result = await parsePartialDateTime('14:45', referenceDate);
            expect(result).not.toBeNull();
            expect(result.getUTCFullYear()).toBe(2024);
            expect(result.getUTCMonth()).toBe(0);
            expect(result.getUTCDate()).toBe(15);
            expect(result.getHours()).toBe(14);
            expect(result.getMinutes()).toBe(45);
        });

        test('parses time with seconds (HH:MM:SS)', async () => {
            const result = await parsePartialDateTime('14:45:30', referenceDate);
            expect(result).not.toBeNull();
            expect(result.getHours()).toBe(14);
            expect(result.getMinutes()).toBe(45);
            expect(result.getSeconds()).toBe(30);
        });
    });

    describe('natural language parsing', () => {
        test('parses "tomorrow"', async () => {
            const result = await parsePartialDateTime('tomorrow', referenceDate);
            expect(result).not.toBeNull();
            expect(result.getDate()).toBe(referenceDate.getDate() + 1);
        });

        test('parses "yesterday"', async () => {
            const result = await parsePartialDateTime('yesterday', referenceDate);
            expect(result).not.toBeNull();
            expect(result.getDate()).toBe(referenceDate.getDate() - 1);
        });

        test('parses "January 20"', async () => {
            const result = await parsePartialDateTime('January 20', referenceDate);
            expect(result).not.toBeNull();
            expect(result.getMonth()).toBe(0);
            expect(result.getDate()).toBe(20);
        });

        test('parses "Jan 20 2024"', async () => {
            const result = await parsePartialDateTime('Jan 20 2024', referenceDate);
            expect(result).not.toBeNull();
            expect(result.getFullYear()).toBe(2024);
            expect(result.getMonth()).toBe(0);
            expect(result.getDate()).toBe(20);
        });
    });

    describe('edge cases and invalid input', () => {
        test('returns null for empty string', async () => {
            const result = await parsePartialDateTime('', referenceDate);
            expect(result).toBeNull();
        });

        test('returns null for whitespace only', async () => {
            const result = await parsePartialDateTime('   ', referenceDate);
            expect(result).toBeNull();
        });

        test('returns null for null input', async () => {
            const result = await parsePartialDateTime(null, referenceDate);
            expect(result).toBeNull();
        });

        test('returns null for undefined input', async () => {
            const result = await parsePartialDateTime(undefined, referenceDate);
            expect(result).toBeNull();
        });

        test('returns null for unparseable string', async () => {
            const result = await parsePartialDateTime('qwerty asdf zxcv', referenceDate);
            expect(result).toBeNull();
        });
    });

    describe('reference date context', () => {
        test('uses reference date year for partial dates', async () => {
            const ref2025 = new Date('2025-06-15T12:00:00Z');
            const result = await parsePartialDateTime('March 10', ref2025);
            expect(result).not.toBeNull();
            expect(result.getFullYear()).toBe(2025);
        });

        test('different reference dates produce different results for "tomorrow"', async () => {
            const ref1 = new Date('2024-01-15T10:00:00Z');
            const ref2 = new Date('2024-06-20T10:00:00Z');
            
            const result1 = await parsePartialDateTime('tomorrow', ref1);
            const result2 = await parsePartialDateTime('tomorrow', ref2);
            
            expect(result1.getMonth()).toBe(0);
            expect(result2.getMonth()).toBe(5);
        });
    });
});
