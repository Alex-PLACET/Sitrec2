import {RollingAverage, RollingAveragePolyEdge, SavitzkyGolay, SlidingAverage} from "../src/smoothing.js";

function makePowerCurve(length, exponent) {
    return Array.from({length}, (_, i) => Math.pow(i + 1, exponent));
}

function firstDiff(values) {
    const out = new Array(values.length - 1);
    for (let i = 0; i < out.length; i++) {
        out[i] = values[i + 1] - values[i];
    }
    return out;
}

function maxAbsInRange(values, start, end) {
    let max = 0;
    for (let i = start; i <= end; i++) {
        const value = Math.abs(values[i]);
        if (value > max) {
            max = value;
        }
    }
    return max;
}

function transitionSpikes(values, halfWindow) {
    const secondDiff = firstDiff(firstDiff(values));
    const leftTransitionStart = halfWindow - 5;
    const leftTransitionEnd = halfWindow + 5;
    const rightTransitionCenter = values.length - halfWindow - 2;
    const rightTransitionStart = rightTransitionCenter - 5;
    const rightTransitionEnd = rightTransitionCenter + 5;
    return {
        left: maxAbsInRange(secondDiff, leftTransitionStart, leftTransitionEnd),
        right: maxAbsInRange(secondDiff, rightTransitionStart, rightTransitionEnd),
    };
}

describe("RollingAverage vs SlidingAverage edge behavior", () => {
    test("rolling average shows stronger end discontinuities on a smooth 1000-point power curve", () => {
        const length = 1000;
        const window = 100;
        const halfWindow = Math.floor(window / 2);
        const curve = makePowerCurve(length, 1.2);

        const moving = RollingAverage(curve, window);
        const sliding = SlidingAverage(curve, window);

        expect(moving).toHaveLength(length);
        expect(sliding).toHaveLength(length);

        const movingSecondDiff = firstDiff(firstDiff(moving));
        const slidingSecondDiff = firstDiff(firstDiff(sliding));

        const leftTransitionStart = halfWindow - 5;
        const leftTransitionEnd = halfWindow + 5;
        const rightTransitionCenter = length - halfWindow - 2;
        const rightTransitionStart = rightTransitionCenter - 5;
        const rightTransitionEnd = rightTransitionCenter + 5;

        const movingLeftSpike = maxAbsInRange(movingSecondDiff, leftTransitionStart, leftTransitionEnd);
        const movingRightSpike = maxAbsInRange(movingSecondDiff, rightTransitionStart, rightTransitionEnd);
        const slidingLeftSpike = maxAbsInRange(slidingSecondDiff, leftTransitionStart, leftTransitionEnd);
        const slidingRightSpike = maxAbsInRange(slidingSecondDiff, rightTransitionStart, rightTransitionEnd);

        // RollingAverage has pronounced curvature jumps at both edge transitions.
        expect(movingLeftSpike).toBeGreaterThan(0.1);
        expect(movingRightSpike).toBeGreaterThan(0.01);

        // SlidingAverage remains much smoother over the same transition zones.
        expect(slidingLeftSpike).toBeLessThan(0.01);
        expect(slidingRightSpike).toBeLessThan(0.002);

        // Relative check to make the contrast explicit.
        expect(movingLeftSpike).toBeGreaterThan(slidingLeftSpike * 10);
        expect(movingRightSpike).toBeGreaterThan(slidingRightSpike * 5);
    });

    test("moving average with polynomial edge extrapolation removes endpoint kinks", () => {
        const length = 1000;
        const window = 100;
        const halfWindow = Math.floor(window / 2);
        const curve = makePowerCurve(length, 1.2);

        const moving = RollingAverage(curve, window);
        const movingPolyEdge = RollingAveragePolyEdge(curve, window, 1, 2, window);

        const movingSpikes = transitionSpikes(moving, halfWindow);
        const polyEdgeSpikes = transitionSpikes(movingPolyEdge, halfWindow);

        expect(polyEdgeSpikes.left).toBeLessThan(movingSpikes.left / 5);
        expect(polyEdgeSpikes.right).toBeLessThan(movingSpikes.right / 5);
    });

    test("savitzky-golay keeps smooth curvature while avoiding endpoint discontinuities", () => {
        const length = 1000;
        const window = 100;
        const halfWindow = Math.floor(window / 2);
        const curve = makePowerCurve(length, 1.2);

        const moving = RollingAverage(curve, window);
        const savgol = SavitzkyGolay(curve, window, 3, 1, 3, window);

        const movingSpikes = transitionSpikes(moving, halfWindow);
        const savgolSpikes = transitionSpikes(savgol, halfWindow);

        expect(savgolSpikes.left).toBeLessThan(movingSpikes.left / 6);
        expect(savgolSpikes.right).toBeLessThan(movingSpikes.right / 4);
    });
});
