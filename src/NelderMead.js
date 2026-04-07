// Nelder-Mead simplex optimizer
// Minimizes costFn(params) over a parameter vector with optional box bounds.

export function nelderMead(costFn, x0, options = {}) {
    const n = x0.length;
    const maxIter = options.maxIter ?? 2000;
    const tol = options.tol ?? 1e-8;
    const lo = options.lo ?? null;  // lower bounds array (or null)
    const hi = options.hi ?? null;  // upper bounds array (or null)
    const initialScale = options.initialScale ?? null; // per-param simplex spread (array or null)

    const alpha = 1.0;  // reflection
    const gamma = 2.0;  // expansion
    const rho = 0.5;    // contraction
    const sigma = 0.5;  // shrink

    function clamp(x) {
        if (!lo && !hi) return x;
        const c = x.slice();
        for (let i = 0; i < n; i++) {
            if (lo && c[i] < lo[i]) c[i] = lo[i];
            if (hi && c[i] > hi[i]) c[i] = hi[i];
        }
        return c;
    }

    // Build initial simplex: n+1 vertices
    const simplex = [clamp(x0.slice())];
    for (let i = 0; i < n; i++) {
        const v = x0.slice();
        const delta = initialScale ? initialScale[i] : (Math.abs(v[i]) * 0.05 || 0.00025);
        v[i] += delta;
        simplex.push(clamp(v));
    }

    const costs = simplex.map(v => costFn(v));

    function centroid(exclude) {
        const c = new Array(n).fill(0);
        for (let i = 0; i <= n; i++) {
            if (i === exclude) continue;
            for (let j = 0; j < n; j++) c[j] += simplex[i][j];
        }
        for (let j = 0; j < n; j++) c[j] /= n;
        return c;
    }

    function addVec(a, b, scale) {
        const r = new Array(n);
        for (let j = 0; j < n; j++) r[j] = a[j] + scale * (b[j] - a[j]);  // wrong form
        return r;
    }

    // point = centroid + scale * (centroid - worst)
    function reflect(c, worst, scale) {
        const r = new Array(n);
        for (let j = 0; j < n; j++) r[j] = c[j] + scale * (c[j] - worst[j]);
        return clamp(r);
    }

    for (let iter = 0; iter < maxIter; iter++) {
        // Sort simplex by cost
        const indices = Array.from({length: n + 1}, (_, i) => i);
        indices.sort((a, b) => costs[a] - costs[b]);
        const sorted = indices.map(i => simplex[i]);
        const sortedCosts = indices.map(i => costs[i]);
        for (let i = 0; i <= n; i++) {
            simplex[i] = sorted[i];
            costs[i] = sortedCosts[i];
        }

        // Convergence check: spread of costs
        const spread = costs[n] - costs[0];
        if (spread < tol) break;

        const c = centroid(n); // centroid excluding worst
        const worst = simplex[n];

        // Reflection
        const xr = reflect(c, worst, alpha);
        const fr = costFn(xr);

        if (fr < costs[0]) {
            // Try expansion
            const xe = reflect(c, worst, gamma);
            const fe = costFn(xe);
            if (fe < fr) {
                simplex[n] = xe; costs[n] = fe;
            } else {
                simplex[n] = xr; costs[n] = fr;
            }
        } else if (fr < costs[n - 1]) {
            // Accept reflection
            simplex[n] = xr; costs[n] = fr;
        } else {
            // Contraction
            const inside = fr >= costs[n];
            const xc = inside
                ? reflect(c, worst, -rho)   // inside contraction
                : reflect(c, worst, rho);    // outside contraction (toward reflected)
            const fc = costFn(xc);

            if (fc < (inside ? costs[n] : fr)) {
                simplex[n] = xc; costs[n] = fc;
            } else {
                // Shrink all toward best
                for (let i = 1; i <= n; i++) {
                    for (let j = 0; j < n; j++) {
                        simplex[i][j] = simplex[0][j] + sigma * (simplex[i][j] - simplex[0][j]);
                    }
                    simplex[i] = clamp(simplex[i]);
                    costs[i] = costFn(simplex[i]);
                }
            }
        }
    }

    // Return best
    let bestIdx = 0;
    for (let i = 1; i <= n; i++) {
        if (costs[i] < costs[bestIdx]) bestIdx = i;
    }
    return {params: simplex[bestIdx], cost: costs[bestIdx]};
}
