/**
 * LOSFitting.js — Global LOS Trajectory Fitting Algorithms
 *
 * Ported from lostool/web/js/trajectory.js.
 * Pure math functions with zero dependencies (no Three.js, no DOM, no Node.js).
 *
 * All functions operate on flat Float32Array data in a local coordinate system
 * (typically ENU). The caller is responsible for coordinate conversion.
 *
 * Dataset format:
 *   {
 *     sensorPos: Float32Array,  // stride-3: [sx0,sy0,sz0, sx1,sy1,sz1, ...]
 *     losDir:    Float32Array,  // stride-3: [dx0,dy0,dz0, dx1,dy1,dz1, ...] (unit vectors)
 *     times:     Float64Array,  // per-frame timestamps (seconds)
 *     count:     number,        // number of frames
 *     maxRange:  Float32Array|null, // optional per-frame max range
 *   }
 */

// ---------------------------------------------------------------------------
// Linear algebra helpers
// ---------------------------------------------------------------------------

function _solveLinearSystem(A, b) {
    const n = b.length;
    for (let col = 0; col < n; col++) {
        let maxVal = Math.abs(A[col][col]);
        let maxRow = col;
        for (let row = col + 1; row < n; row++) {
            if (Math.abs(A[row][col]) > maxVal) {
                maxVal = Math.abs(A[row][col]);
                maxRow = row;
            }
        }
        if (maxVal < 1e-14) return null;
        [A[col], A[maxRow]] = [A[maxRow], A[col]];
        [b[col], b[maxRow]] = [b[maxRow], b[col]];
        for (let row = col + 1; row < n; row++) {
            const factor = A[row][col] / A[col][col];
            for (let k = col; k < n; k++) A[row][k] -= factor * A[col][k];
            b[row] -= factor * b[col];
        }
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
        x[i] = b[i];
        for (let j = i + 1; j < n; j++) x[i] -= A[i][j] * x[j];
        x[i] /= A[i][i];
    }
    return x;
}

function _pointToRayDistance(P, O, D) {
    const dx = P[0] - O[0], dy = P[1] - O[1], dz = P[2] - O[2];
    const proj = dx * D[0] + dy * D[1] + dz * D[2];
    const px = dx - proj * D[0], py = dy - proj * D[1], pz = dz - proj * D[2];
    return Math.sqrt(px * px + py * py + pz * pz);
}

// ---------------------------------------------------------------------------
// Soft-constrained normal-equation solver
// ---------------------------------------------------------------------------

function _solveSoftConstrained(AtA, Atb, nUnknowns, active, dataset, rowFn, t0) {
    const {sensorPos, losDir, times, maxRange} = dataset;
    const PENALTY = 1e4;

    const sol = _solveLinearSystem(AtA.map(r => r.slice()), Atb.slice());
    if (!sol) return null;

    const violations = [];
    for (const idx of active) {
        const b = idx * 3;
        const {lambdaRow} = rowFn(idx, times[idx] - t0);
        const dDotS = losDir[b] * sensorPos[b] +
            losDir[b + 1] * sensorPos[b + 1] +
            losDir[b + 2] * sensorPos[b + 2];
        let lambda = -dDotS;
        for (let k = 0; k < nUnknowns; k++) lambda += lambdaRow[k] * sol[k];

        let target = null;
        if (lambda < 0) {
            target = 0;
        } else if (maxRange) {
            const mr = maxRange[idx];
            if (mr > 0 && lambda > mr) target = mr;
        }
        if (target !== null) violations.push({lambdaRow, dDotS, target});
    }

    if (violations.length === 0) return sol;

    const A2 = AtA.map(r => r.slice());
    const b2 = Atb.slice();
    for (const {lambdaRow: r, dDotS, target} of violations) {
        const rhs = dDotS + target;
        for (let i = 0; i < nUnknowns; i++) {
            for (let j = 0; j < nUnknowns; j++) A2[i][j] += PENALTY * r[i] * r[j];
            b2[i] += PENALTY * rhs * r[i];
        }
    }
    return _solveLinearSystem(A2, b2);
}

// ---------------------------------------------------------------------------
// Constant Velocity Least Squares Fit
// ---------------------------------------------------------------------------

export function fitConstantVelocity(dataset, excluded) {
    const {sensorPos, losDir, times, count} = dataset;

    const active = [];
    for (let i = 0; i < count; i++) {
        if (!excluded.has(i)) active.push(i);
    }
    if (active.length < 2) return null;

    const t0 = times[active[0]];
    const AtA = Array.from({length: 6}, () => new Array(6).fill(0));
    const Atb = new Array(6).fill(0);

    for (const idx of active) {
        const b = idx * 3;
        const ti = times[idx] - t0;
        const sx = sensorPos[b], sy = sensorPos[b + 1], sz = sensorPos[b + 2];
        const dx = losDir[b], dy = losDir[b + 1], dz = losDir[b + 2];

        const p00 = 1 - dx * dx, p01 = -dx * dy, p02 = -dx * dz;
        const p10 = -dy * dx, p11 = 1 - dy * dy, p12 = -dy * dz;
        const p20 = -dz * dx, p21 = -dz * dy, p22 = 1 - dz * dz;

        const rows = [
            [p00, p01, p02, p00 * ti, p01 * ti, p02 * ti],
            [p10, p11, p12, p10 * ti, p11 * ti, p12 * ti],
            [p20, p21, p22, p20 * ti, p21 * ti, p22 * ti],
        ];
        const rhs = [
            p00 * sx + p01 * sy + p02 * sz,
            p10 * sx + p11 * sy + p12 * sz,
            p20 * sx + p21 * sy + p22 * sz,
        ];

        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 6; c++) {
                for (let k = 0; k < 6; k++) AtA[c][k] += rows[r][c] * rows[r][k];
                Atb[c] += rows[r][c] * rhs[r];
            }
        }
    }

    function cvLambdaRow(idx, ti) {
        const b = idx * 3;
        const dx = losDir[b], dy = losDir[b + 1], dz = losDir[b + 2];
        return {lambdaRow: [dx, dy, dz, dx * ti, dy * ti, dz * ti]};
    }

    const solution = _solveSoftConstrained(AtA, Atb, 6, active, dataset, cvLambdaRow, t0);
    if (!solution) return null;

    const P0 = [solution[0], solution[1], solution[2]];
    const V = [solution[3], solution[4], solution[5]];

    const positions = new Float32Array(count * 3);
    const residuals = new Float32Array(count).fill(NaN);

    for (let i = 0; i < count; i++) {
        const ti = times[i] - t0;
        const fx = P0[0] + V[0] * ti, fy = P0[1] + V[1] * ti, fz = P0[2] + V[2] * ti;
        positions[i * 3] = fx;
        positions[i * 3 + 1] = fy;
        positions[i * 3 + 2] = fz;
        if (!excluded.has(i)) {
            const b = i * 3;
            residuals[i] = _pointToRayDistance(
                [fx, fy, fz],
                [sensorPos[b], sensorPos[b + 1], sensorPos[b + 2]],
                [losDir[b], losDir[b + 1], losDir[b + 2]],
            );
        }
    }
    return {positions, residuals, params: {P0, V}, activeCount: active.length};
}

// ---------------------------------------------------------------------------
// Constant Acceleration Least Squares Fit
// ---------------------------------------------------------------------------

export function fitConstantAcceleration(dataset, excluded) {
    const {sensorPos, losDir, times, count} = dataset;

    const active = [];
    for (let i = 0; i < count; i++) {
        if (!excluded.has(i)) active.push(i);
    }
    if (active.length < 3) return null;

    const t0 = times[active[0]];
    const tLast = times[active[active.length - 1]];
    const T_span = tLast - t0 || 1;

    const AtA = Array.from({length: 9}, () => new Array(9).fill(0));
    const Atb = new Array(9).fill(0);

    for (const idx of active) {
        const b = idx * 3;
        const tau = (times[idx] - t0) / T_span;
        const tau2 = 0.5 * tau * tau;
        const sx = sensorPos[b], sy = sensorPos[b + 1], sz = sensorPos[b + 2];
        const dx = losDir[b], dy = losDir[b + 1], dz = losDir[b + 2];

        const p00 = 1 - dx * dx, p01 = -dx * dy, p02 = -dx * dz;
        const p10 = -dy * dx, p11 = 1 - dy * dy, p12 = -dy * dz;
        const p20 = -dz * dx, p21 = -dz * dy, p22 = 1 - dz * dz;

        const rows = [
            [p00, p01, p02, p00 * tau, p01 * tau, p02 * tau, p00 * tau2, p01 * tau2, p02 * tau2],
            [p10, p11, p12, p10 * tau, p11 * tau, p12 * tau, p10 * tau2, p11 * tau2, p12 * tau2],
            [p20, p21, p22, p20 * tau, p21 * tau, p22 * tau, p20 * tau2, p21 * tau2, p22 * tau2],
        ];
        const rhs = [
            p00 * sx + p01 * sy + p02 * sz,
            p10 * sx + p11 * sy + p12 * sz,
            p20 * sx + p21 * sy + p22 * sz,
        ];

        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 9; c++) {
                for (let k = 0; k < 9; k++) AtA[c][k] += rows[r][c] * rows[r][k];
                Atb[c] += rows[r][c] * rhs[r];
            }
        }
    }

    function caLambdaRow(idx, _ti) {
        const b = idx * 3;
        const dx = losDir[b], dy = losDir[b + 1], dz = losDir[b + 2];
        const tau = (times[idx] - t0) / T_span;
        const tau2 = 0.5 * tau * tau;
        return {lambdaRow: [dx, dy, dz, dx * tau, dy * tau, dz * tau, dx * tau2, dy * tau2, dz * tau2]};
    }

    const solution = _solveSoftConstrained(AtA, Atb, 9, active, dataset, caLambdaRow, t0);
    if (!solution) return null;

    const P0 = [solution[0], solution[1], solution[2]];
    const V = [solution[3] / T_span, solution[4] / T_span, solution[5] / T_span];
    const A = [solution[6] / (T_span * T_span), solution[7] / (T_span * T_span), solution[8] / (T_span * T_span)];

    const positions = new Float32Array(count * 3);
    const residuals = new Float32Array(count).fill(NaN);

    for (let i = 0; i < count; i++) {
        const ti = times[i] - t0;
        const ti2 = 0.5 * ti * ti;
        const fx = P0[0] + V[0] * ti + A[0] * ti2;
        const fy = P0[1] + V[1] * ti + A[1] * ti2;
        const fz = P0[2] + V[2] * ti + A[2] * ti2;
        positions[i * 3] = fx;
        positions[i * 3 + 1] = fy;
        positions[i * 3 + 2] = fz;
        if (!excluded.has(i)) {
            const b = i * 3;
            residuals[i] = _pointToRayDistance(
                [fx, fy, fz],
                [sensorPos[b], sensorPos[b + 1], sensorPos[b + 2]],
                [losDir[b], losDir[b + 1], losDir[b + 2]],
            );
        }
    }
    return {positions, residuals, params: {P0, V, A}, activeCount: active.length};
}

// ---------------------------------------------------------------------------
// Monte Carlo Trajectory Fit
// ---------------------------------------------------------------------------

export function fitMonteCarlo(dataset, excluded, options = {}) {
    const {sensorPos, losDir, times, count} = dataset;

    const order = Math.max(1, Math.round(options.order ?? 1));
    const losUncertDeg = options.losUncertaintyDeg ?? 2;
    const losUncertRad = losUncertDeg * (Math.PI / 180);
    const numTrials = Math.max(1, Math.round(options.numTrials ?? 500));

    // Per-frame range estimates from a prior fit (e.g. CV). When provided,
    // random range sampling is centered on these values (0.5x to 1.5x) instead
    // of sampling blindly from [0, maxDistance].
    const rangeEstimates = options.rangeEstimates ?? null;

    let maxDistance = options.maxDistance;
    if (maxDistance == null) {
        let sceneExtent = 1;
        if (count > 0) {
            let minX = Infinity, maxX = -Infinity;
            let minY = Infinity, maxY = -Infinity;
            let minZ = Infinity, maxZ = -Infinity;
            for (let i = 0; i < count; i++) {
                const b = i * 3;
                if (sensorPos[b] < minX) minX = sensorPos[b];
                if (sensorPos[b] > maxX) maxX = sensorPos[b];
                if (sensorPos[b + 1] < minY) minY = sensorPos[b + 1];
                if (sensorPos[b + 1] > maxY) maxY = sensorPos[b + 1];
                if (sensorPos[b + 2] < minZ) minZ = sensorPos[b + 2];
                if (sensorPos[b + 2] > maxZ) maxZ = sensorPos[b + 2];
            }
            sceneExtent = Math.max(maxX - minX, maxY - minY, maxZ - minZ) || 1;
        }
        maxDistance = sceneExtent * 10;
    }

    const active = [];
    for (let i = 0; i < count; i++) {
        if (!excluded.has(i)) active.push(i);
    }
    const needed = order + 1;
    if (active.length < needed) return null;

    const t0 = times[active[0]];

    function _rotate(vx, vy, vz, ax, ay, az, theta) {
        const cosT = Math.cos(theta), sinT = Math.sin(theta);
        const dot = ax * vx + ay * vy + az * vz;
        const cx = ay * vz - az * vy, cy = az * vx - ax * vz, cz = ax * vy - ay * vx;
        return [
            vx * cosT + cx * sinT + ax * dot * (1 - cosT),
            vy * cosT + cy * sinT + ay * dot * (1 - cosT),
            vz * cosT + cz * sinT + az * dot * (1 - cosT),
        ];
    }

    function _perpUnit(dx, dy, dz) {
        const ax = Math.abs(dx), ay = Math.abs(dy), az = Math.abs(dz);
        let ux = 0, uy = 0, uz = 0;
        if (ax <= ay && ax <= az) ux = 1;
        else if (ay <= ax && ay <= az) uy = 1;
        else uz = 1;
        let px = dy * uz - dz * uy, py = dz * ux - dx * uz, pz = dx * uy - dy * ux;
        const len = Math.sqrt(px * px + py * py + pz * pz);
        return [px / len, py / len, pz / len];
    }

    function _fitPoly1D(ts, ys) {
        const n = ts.length;
        const V = [];
        for (let i = 0; i < n; i++) {
            const row = [];
            let pw = 1;
            for (let j = 0; j < n; j++) { row.push(pw); pw *= ts[i]; }
            V.push(row);
        }
        return _solveLinearSystem(V, ys.slice());
    }

    function _evalPoly(coeffs, t) {
        let val = 0, pw = 1;
        for (let k = 0; k < coeffs.length; k++) { val += coeffs[k] * pw; pw *= t; }
        return val;
    }

    function _angularError(fx, fy, fz, sx, sy, sz, dx, dy, dz) {
        let rx = fx - sx, ry = fy - sy, rz = fz - sz;
        const rlen = Math.sqrt(rx * rx + ry * ry + rz * rz);
        if (rlen < 1e-12) return Math.PI;
        rx /= rlen; ry /= rlen; rz /= rlen;
        const dot = Math.max(-1, Math.min(1, rx * dx + ry * dy + rz * dz));
        return Math.acos(dot);
    }

    let bestScore = Infinity;
    let bestCoeffsX = null, bestCoeffsY = null, bestCoeffsZ = null;

    for (let trial = 0; trial < numTrials; trial++) {
        const pool = active.slice();
        const chosen = [];
        for (let k = 0; k < needed; k++) {
            const idx = k + Math.floor(Math.random() * (pool.length - k));
            [pool[k], pool[idx]] = [pool[idx], pool[k]];
            chosen.push(pool[k]);
        }

        const sampleTs = [], sampleX = [], sampleY = [], sampleZ = [];
        for (const fi of chosen) {
            const b = fi * 3;
            const sx = sensorPos[b], sy = sensorPos[b + 1], sz = sensorPos[b + 2];
            const dx = losDir[b], dy = losDir[b + 1], dz = losDir[b + 2];

            let pdx, pdy, pdz;
            if (losUncertRad > 1e-10) {
                const theta = Math.random() * losUncertRad;
                const [ex, ey, ez] = _perpUnit(dx, dy, dz);
                const phi = Math.random() * 2 * Math.PI;
                const [rx2, ry2, rz2] = _rotate(ex, ey, ez, dx, dy, dz, phi);
                [pdx, pdy, pdz] = _rotate(dx, dy, dz, rx2, ry2, rz2, theta);
            } else {
                [pdx, pdy, pdz] = [dx, dy, dz];
            }

            let lambda;
            if (rangeEstimates) {
                // Sample within 0.9x to 1.1x of the estimated range
                const est = rangeEstimates[fi];
                lambda = est * (0.9 + Math.random() * 0.2);
            } else {
                let effectiveMax = maxDistance;
                if (dataset.maxRange) {
                    const mr = dataset.maxRange[fi];
                    if (mr > 0) effectiveMax = Math.min(effectiveMax, mr);
                }
                lambda = Math.random() * effectiveMax;
            }

            sampleTs.push(times[fi] - t0);
            sampleX.push(sx + lambda * pdx);
            sampleY.push(sy + lambda * pdy);
            sampleZ.push(sz + lambda * pdz);
        }

        const cx = _fitPoly1D(sampleTs, sampleX);
        const cy = _fitPoly1D(sampleTs, sampleY);
        const cz = _fitPoly1D(sampleTs, sampleZ);
        if (!cx || !cy || !cz) continue;

        let totalErr = 0;
        for (const fi of active) {
            const ti = times[fi] - t0;
            const b = fi * 3;
            totalErr += _angularError(
                _evalPoly(cx, ti), _evalPoly(cy, ti), _evalPoly(cz, ti),
                sensorPos[b], sensorPos[b + 1], sensorPos[b + 2],
                losDir[b], losDir[b + 1], losDir[b + 2]);
        }
        const score = totalErr / active.length;
        if (score < bestScore) {
            bestScore = score;
            bestCoeffsX = cx; bestCoeffsY = cy; bestCoeffsZ = cz;
        }
    }

    if (!bestCoeffsX) return null;

    const positions = new Float32Array(count * 3);
    const residuals = new Float32Array(count).fill(NaN);

    for (let i = 0; i < count; i++) {
        const ti = times[i] - t0;
        const fx = _evalPoly(bestCoeffsX, ti);
        const fy = _evalPoly(bestCoeffsY, ti);
        const fz = _evalPoly(bestCoeffsZ, ti);
        positions[i * 3] = fx;
        positions[i * 3 + 1] = fy;
        positions[i * 3 + 2] = fz;
        if (!excluded.has(i)) {
            const b = i * 3;
            residuals[i] = _angularError(fx, fy, fz,
                sensorPos[b], sensorPos[b + 1], sensorPos[b + 2],
                losDir[b], losDir[b + 1], losDir[b + 2]);
        }
    }
    return {positions, residuals, params: {order, bestScore, numTrials}, activeCount: active.length};
}

// ---------------------------------------------------------------------------
// Kalman Filter (RTS Forward-Backward Smoother)
// ---------------------------------------------------------------------------

export function fitKalmanFilter(dataset, excluded, options = {}) {
    const {sensorPos, losDir, times, count} = dataset;

    const processNoise = options.processNoise ?? 1e-4;
    const measurementNoise = options.measurementNoise ?? 1.0;

    const active = [];
    for (let i = 0; i < count; i++) {
        if (!excluded.has(i)) active.push(i);
    }
    active.sort((a, b) => times[a] - times[b]);
    if (active.length < 2) return null;

    // 6x6 matrix helpers (flat row-major)
    function _mat6Mul(A, B) {
        const C = new Array(36).fill(0);
        for (let i = 0; i < 6; i++)
            for (let k = 0; k < 6; k++) {
                const aik = A[i * 6 + k];
                if (aik === 0) continue;
                for (let j = 0; j < 6; j++) C[i * 6 + j] += aik * B[k * 6 + j];
            }
        return C;
    }

    function _mat6AddInPlace(A, B) {
        for (let i = 0; i < 36; i++) A[i] += B[i];
    }

    function _mat6T(A) {
        const T = new Array(36).fill(0);
        for (let i = 0; i < 6; i++)
            for (let j = 0; j < 6; j++) T[j * 6 + i] = A[i * 6 + j];
        return T;
    }

    function _mulHx(H, x) {
        return [
            H[0] * x[0] + H[1] * x[1] + H[2] * x[2] + H[3] * x[3] + H[4] * x[4] + H[5] * x[5],
            H[6] * x[0] + H[7] * x[1] + H[8] * x[2] + H[9] * x[3] + H[10] * x[4] + H[11] * x[5],
            H[12] * x[0] + H[13] * x[1] + H[14] * x[2] + H[15] * x[3] + H[16] * x[4] + H[17] * x[5],
        ];
    }

    function _computeHPHT(H, P) {
        const PHT = new Array(18).fill(0);
        for (let i = 0; i < 6; i++)
            for (let j = 0; j < 3; j++)
                for (let k = 0; k < 6; k++)
                    PHT[i * 3 + j] += P[i * 6 + k] * H[j * 6 + k];
        const HPHT = new Array(9).fill(0);
        for (let i = 0; i < 3; i++)
            for (let j = 0; j < 3; j++)
                for (let k = 0; k < 6; k++)
                    HPHT[i * 3 + j] += H[i * 6 + k] * PHT[k * 3 + j];
        return HPHT;
    }

    function _computeK(P, H, Sinv) {
        const PHT = new Array(18).fill(0);
        for (let i = 0; i < 6; i++)
            for (let j = 0; j < 3; j++)
                for (let k = 0; k < 6; k++)
                    PHT[i * 3 + j] += P[i * 6 + k] * H[j * 6 + k];
        const K = new Array(18).fill(0);
        for (let i = 0; i < 6; i++)
            for (let j = 0; j < 3; j++)
                for (let k = 0; k < 3; k++)
                    K[i * 3 + j] += PHT[i * 3 + k] * Sinv[k * 3 + j];
        return K;
    }

    function _inv3x3(M) {
        const [a, b, c, d, e, f, g, h, k] = M;
        const det = a * (e * k - f * h) - b * (d * k - f * g) + c * (d * h - e * g);
        if (Math.abs(det) < 1e-30) return null;
        const inv = 1 / det;
        return [
            (e * k - f * h) * inv, (c * h - b * k) * inv, (b * f - c * e) * inv,
            (f * g - d * k) * inv, (a * k - c * g) * inv, (c * d - a * f) * inv,
            (d * h - e * g) * inv, (b * g - a * h) * inv, (a * e - b * d) * inv,
        ];
    }

    function _inv6x6(M) {
        const A = [];
        for (let i = 0; i < 6; i++) A.push(M.slice(i * 6, i * 6 + 6));
        const inv = new Array(36).fill(0);
        for (let col = 0; col < 6; col++) {
            const rhs = new Array(6).fill(0);
            rhs[col] = 1;
            const Acopy = A.map(row => row.slice());
            const sol = _solveLinearSystem(Acopy, rhs);
            if (!sol) {
                const fallback = new Array(36).fill(0);
                const scale = 1 / (M[0] || 1);
                for (let i = 0; i < 6; i++) fallback[i * 6 + i] = scale;
                return fallback;
            }
            for (let row = 0; row < 6; row++) inv[row * 6 + col] = sol[row];
        }
        return inv;
    }

    // Seed from CV fit
    const _cvSeed = fitConstantVelocity(dataset, excluded);

    let x;
    const P_init = new Array(36).fill(0);

    if (_cvSeed) {
        const P0cv = _cvSeed.params.P0;
        const Vcv = _cvSeed.params.V;
        x = [P0cv[0], P0cv[1], P0cv[2], Vcv[0], Vcv[1], Vcv[2]];
        for (let i = 0; i < 3; i++) P_init[i * 6 + i] = 1.0;
        for (let i = 3; i < 6; i++) P_init[i * 6 + i] = 0.01;
    } else {
        const b0 = active[0] * 3;
        x = [
            sensorPos[b0] + losDir[b0],
            sensorPos[b0 + 1] + losDir[b0 + 1],
            sensorPos[b0 + 2] + losDir[b0 + 2],
            0, 0, 0,
        ];
        for (let i = 0; i < 3; i++) P_init[i * 6 + i] = 1e6;
        for (let i = 3; i < 6; i++) P_init[i * 6 + i] = 1.0;
    }

    let P = P_init.slice();

    function _buildQ(dt) {
        const Q = new Array(36).fill(0);
        const q = processNoise;
        const qp = (dt * dt * 0.25) * q;
        const qv = dt * dt * q;
        const qc = dt * dt * 0.5 * q;
        for (let i = 0; i < 3; i++) {
            Q[i * 6 + i] = qp;
            Q[(i + 3) * 6 + (i + 3)] = qv;
            Q[i * 6 + (i + 3)] = qc;
            Q[(i + 3) * 6 + i] = qc;
        }
        return Q;
    }

    const filtX = [], filtP = [], predX = [], predP = [], Fmats = [];

    filtX.push(x.slice());
    filtP.push(P.slice());
    predX.push(x.slice());
    predP.push(P.slice());
    Fmats.push(null);

    // Forward Kalman pass
    for (let ai = 1; ai < active.length; ai++) {
        const prevIdx = active[ai - 1];
        const currIdx = active[ai];
        const dt = times[currIdx] - times[prevIdx];

        const F = new Array(36).fill(0);
        for (let i = 0; i < 6; i++) F[i * 6 + i] = 1;
        for (let i = 0; i < 3; i++) F[i * 6 + (i + 3)] = dt;
        Fmats.push(F);

        const xp = new Array(6).fill(0);
        for (let i = 0; i < 6; i++)
            for (let k = 0; k < 6; k++) xp[i] += F[i * 6 + k] * x[k];

        const FT = _mat6T(F);
        const FP = _mat6Mul(F, P);
        const FPF = _mat6Mul(FP, FT);
        const Q = _buildQ(dt);
        _mat6AddInPlace(FPF, Q);
        const Pp = FPF;

        predX.push(xp.slice());
        predP.push(Pp.slice());

        const bi = currIdx * 3;
        const dx = losDir[bi], dy = losDir[bi + 1], dz = losDir[bi + 2];
        const sx = sensorPos[bi], sy = sensorPos[bi + 1], sz = sensorPos[bi + 2];

        const p00 = 1 - dx * dx, p01 = -dx * dy, p02 = -dx * dz;
        const p10 = -dy * dx, p11 = 1 - dy * dy, p12 = -dy * dz;
        const p20 = -dz * dx, p21 = -dz * dy, p22 = 1 - dz * dz;
        const H = [
            p00, p01, p02, 0, 0, 0,
            p10, p11, p12, 0, 0, 0,
            p20, p21, p22, 0, 0, 0,
        ];

        const z = [
            p00 * sx + p01 * sy + p02 * sz,
            p10 * sx + p11 * sy + p12 * sz,
            p20 * sx + p21 * sy + p22 * sz,
        ];
        const Hxp = _mulHx(H, xp);
        const innov = [z[0] - Hxp[0], z[1] - Hxp[1], z[2] - Hxp[2]];

        const HPHT = _computeHPHT(H, Pp);
        const r = measurementNoise;
        HPHT[0] += r; HPHT[4] += r; HPHT[8] += r;

        const Sinv = _inv3x3(HPHT);
        if (!Sinv) {
            x = xp.slice();
            P = Pp.slice();
        } else {
            const K = _computeK(Pp, H, Sinv);
            const xNew = xp.slice();
            for (let i = 0; i < 6; i++)
                xNew[i] += K[i * 3] * innov[0] + K[i * 3 + 1] * innov[1] + K[i * 3 + 2] * innov[2];

            const KH = new Array(36).fill(0);
            for (let i = 0; i < 6; i++)
                for (let j = 0; j < 6; j++)
                    for (let k = 0; k < 3; k++)
                        KH[i * 6 + j] += K[i * 3 + k] * H[k * 6 + j];

            const IKH = new Array(36).fill(0);
            for (let i = 0; i < 6; i++) IKH[i * 6 + i] = 1;
            for (let i = 0; i < 36; i++) IKH[i] -= KH[i];

            x = xNew;
            P = _mat6Mul(IKH, Pp);
        }
        filtX.push(x.slice());
        filtP.push(P.slice());
    }

    // RTS backward smoother
    const n = active.length;
    const smoothX = filtX.map(s => s.slice());
    const smoothP = filtP.map(p => p.slice());

    for (let ai = n - 2; ai >= 0; ai--) {
        const F = Fmats[ai + 1];
        const xf = filtX[ai];
        const Pf = filtP[ai];
        const xpp = predX[ai + 1];
        const Ppp = predP[ai + 1];
        const xs1 = smoothX[ai + 1];

        const FT = _mat6T(F);
        const PfFT = _mat6Mul(Pf, FT);
        const PppInv = _inv6x6(Ppp);
        const G = _mat6Mul(PfFT, PppInv);

        const diff = xs1.map((v, j) => v - xpp[j]);
        const xsNew = xf.slice();
        for (let i = 0; i < 6; i++)
            for (let k = 0; k < 6; k++)
                xsNew[i] += G[i * 6 + k] * diff[k];
        smoothX[ai] = xsNew;

        const Ps1 = smoothP[ai + 1];
        const dP = Ps1.map((v, j) => v - Ppp[j]);
        const GT = _mat6T(G);
        const GdP = _mat6Mul(G, dP);
        const GdPGT = _mat6Mul(GdP, GT);
        const PsNew = Pf.slice();
        for (let i = 0; i < 36; i++) PsNew[i] += GdPGT[i];
        smoothP[ai] = PsNew;
    }

    const stateAtFrame = new Map();
    for (let ai = 0; ai < active.length; ai++) {
        stateAtFrame.set(active[ai], smoothX[ai]);
    }

    const positions = new Float32Array(count * 3);
    const residuals = new Float32Array(count).fill(NaN);
    let activePtr = 0;

    for (let i = 0; i < count; i++) {
        while (activePtr + 1 < active.length && times[active[activePtr + 1]] <= times[i]) activePtr++;

        let fx, fy, fz;
        if (activePtr + 1 < active.length) {
            const idxA = active[activePtr], idxB = active[activePtr + 1];
            const tA = times[idxA], tB = times[idxB];
            const alpha = tB > tA ? (times[i] - tA) / (tB - tA) : 0;
            const sA = stateAtFrame.get(idxA), sB = stateAtFrame.get(idxB);
            fx = sA[0] + alpha * (sB[0] - sA[0]);
            fy = sA[1] + alpha * (sB[1] - sA[1]);
            fz = sA[2] + alpha * (sB[2] - sA[2]);
        } else {
            const idxLast = active[activePtr];
            const st = stateAtFrame.get(idxLast);
            const dt = times[i] - times[idxLast];
            fx = st[0] + st[3] * dt;
            fy = st[1] + st[4] * dt;
            fz = st[2] + st[5] * dt;
        }

        positions[i * 3] = fx;
        positions[i * 3 + 1] = fy;
        positions[i * 3 + 2] = fz;

        if (!excluded.has(i)) {
            const bi = i * 3;
            residuals[i] = _pointToRayDistance(
                [fx, fy, fz],
                [sensorPos[bi], sensorPos[bi + 1], sensorPos[bi + 2]],
                [losDir[bi], losDir[bi + 1], losDir[bi + 2]],
            );
        }
    }

    return {positions, residuals, params: {states: active.map(idx => stateAtFrame.get(idx))}, activeCount: active.length};
}

// ---------------------------------------------------------------------------
// Shared: build LOS dataset from a sitrec LOS node (ECEF -> ENU)
// ---------------------------------------------------------------------------

import {ECEF2ENU_radii, ECEFToLLA_radii, ENU2ECEF_radii} from "./LLA-ECEF-ENU";
import {GlobalDateTimeNode} from "./Globals";
import {Vector3} from "three";

/**
 * Pack a sitrec LOS node into a flat-array dataset in ENU coordinates.
 * Returns { dataset, originLat, originLon } where lat/lon are in radians.
 */
export function buildLOSDataset(losNode) {
    const frames = losNode.frames;

    let meanX = 0, meanY = 0, meanZ = 0;
    for (let f = 0; f < frames; f++) {
        const los = losNode.v(f);
        meanX += los.position.x;
        meanY += los.position.y;
        meanZ += los.position.z;
    }
    meanX /= frames;
    meanY /= frames;
    meanZ /= frames;

    const originLLA = ECEFToLLA_radii(meanX, meanY, meanZ);
    const originLat = originLLA[0];
    const originLon = originLLA[1];

    const sensorPos = new Float32Array(frames * 3);
    const losDir = new Float32Array(frames * 3);
    const times = new Float64Array(frames);

    for (let f = 0; f < frames; f++) {
        const los = losNode.v(f);
        const posENU = ECEF2ENU_radii(los.position, originLat, originLon);
        sensorPos[f * 3] = posENU.x;
        sensorPos[f * 3 + 1] = posENU.y;
        sensorPos[f * 3 + 2] = posENU.z;

        const dirENU = ECEF2ENU_radii(los.heading, originLat, originLon, true);
        losDir[f * 3] = dirENU.x;
        losDir[f * 3 + 1] = dirENU.y;
        losDir[f * 3 + 2] = dirENU.z;

        times[f] = GlobalDateTimeNode.frameToMS(f) / 1000;
    }

    return {
        dataset: {sensorPos, losDir, times, count: frames, maxRange: null},
        originLat,
        originLon,
    };
}

/**
 * Unpack a Float32Array of ENU positions into an array of {position: Vector3} in ECEF.
 */
export function unpackFitPositions(positions, count, originLat, originLon) {
    const result = [];
    for (let f = 0; f < count; f++) {
        const enuPos = new Vector3(
            positions[f * 3],
            positions[f * 3 + 1],
            positions[f * 3 + 2],
        );
        result.push({position: ENU2ECEF_radii(enuPos, originLat, originLon)});
    }
    return result;
}
