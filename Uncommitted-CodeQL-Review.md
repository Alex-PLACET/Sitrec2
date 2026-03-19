# Uncommitted CodeQL Fix Review

## Scope
Review of all uncommitted changes in `/Users/mick/Dropbox/sitrec-dev/sitrec` intended to address minor CodeQL issues.

## Findings (ordered by severity)

### 1) [P1] Relative video downloads are now blocked
- File: `src/nodes/CNodeVideoWebCodecView.js:99`
- The new URL allowlist rejects relative paths like `./foo.mp4`, `../foo.mp4`, and `foo.mp4`.
- Video references are often stored as `storedRef || fileName` (see `src/nodes/CNodeVideoView.js:254`), which can be relative.
- Side-effect: the download button can silently fail for relative-path video sources.

### 2) [P2] CSV merger escaping is not safe in inline JS-string context
- File: `tools/csv-aircraft-merger.html:526`, `tools/csv-aircraft-merger.html:538`
- `escapeHtml(...)` is inserted inside inline `onclick="downloadFile('...')"` JavaScript string literals.
- HTML escaping is decoded by the browser before JS evaluation, so apostrophes can still break the string and preserve injection risk.
- Side-effect: filenames like `o'hare.csv` can break the download button (and this pattern remains vulnerable).

### 3) [P3] New direct use of transitive `jsdom`
- File: `tools/test-fits-syntax.js:9`
- Script now directly requires `jsdom`, but `jsdom` is not declared in `package.json`.
- It currently works due to transitive installation, but is fragile in stricter/pruned dependency installs.

## Other reviewed changes
- GitHub workflow `permissions` additions appear correct and low-risk.
- `innerHTML` -> `textContent` changes in UI helper paths appear correct.
- `checkLocal()` simplification in `src/configUtils.js` appears correct.
- Express rate-limiter additions are syntactically correct; potential operational side-effect is occasional `429` under very high local/test request volume.

## Validation run
- `npm run build` succeeded.
- `node tools/test-fits-syntax.js` succeeded.

## Recommended plan
1. Fix video URL validation by resolving relative URLs first (`new URL(candidate, window.location.href)`), then validating protocol on the resolved URL.
2. Refactor CSV download buttons to DOM event listeners (`addEventListener`) instead of inline `onclick` JS strings.
3. Add `jsdom` explicitly to `devDependencies` (or remove runtime dependency in that script).
4. Re-run `npm run build` and two smoke checks:
   - Download a video from a relative-path sitch asset.
   - CSV download where filename includes an apostrophe.
