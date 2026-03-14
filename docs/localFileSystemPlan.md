# Local File System Future Improvements

## Purpose

This document is a forward-looking roadmap for improving Sitrec's local-folder workflow.

It assumes the current baseline already exists:

- Sitrec can remember a working folder
- local saves can copy imported assets into that folder
- local sitches can reload nested relative asset paths

The focus here is what should improve next, why it matters, and where the code will likely need to change.

## Guiding Goal

Treat a local folder like a durable Sitrec project workspace:

- easy to start
- predictable to save
- explicit about where files came from
- portable when needed
- recoverable when permissions or files change

## Near-Term Priorities

### 1. Make the Local Workflow Self-Explaining

The current flow works, but new users still need to infer the model.

Planned improvements:

- Add a first-time hint that explains the working-folder concept before the user hits a confusing save/open state
- Make local status language more task-oriented:
  - current folder
  - current sitch target
  - whether save will write immediately or prompt
- Add clearer empty-state guidance when no folder is selected

Success criteria:

- A first-time user can understand the difference between `Select Local Sitch Folder`, `Open Local Sitch`, `Save Local`, and `Save Local As...` without trial and error.

### 2. Track File Provenance Explicitly

Local asset handling still relies too much on behavior inferred from current state.

Planned improvements:

- Add provenance metadata per loaded file, for example:
  - `working-folder`
  - `transient-import`
  - `remote`
  - `generated`
- Use provenance for save-time decisions instead of heuristics based on filenames or URLs
- Surface provenance in UI where useful so users understand what will be copied, reused, or referenced

Why this matters:

- save behavior becomes deterministic
- collision handling can be smarter
- future import UX becomes easier to reason about

### 3. Add Import-Time Copy Decisions

Right now the portability decision mostly happens at save time. That is functional, but late.

Planned improvements:

- When importing a file into a sitch with a working folder, offer:
  - `Copy into working folder`
  - `Keep for this session`
  - `Leave as remote reference` where applicable
- Make the recommended option context-sensitive
- Remember the user's last choice when reasonable

Why this matters:

- users can choose portability intentionally
- save becomes less surprising
- file organization can happen once, at import time, instead of implicitly later

### 4. Replace Silent Collision Rules with Explicit UX

Automatic suffixing is safe, but not always what the user wants.

Planned improvements:

- On local file collision, offer:
  - `Replace existing`
  - `Keep both`
  - `Reuse existing`
- Show enough context to compare the incoming file with the existing one
- Keep auto-suffixing as a non-interactive fallback for flows that must remain automatic

Why this matters:

- prevents hidden project clutter
- avoids accidental duplication
- makes local saves feel deliberate instead of magical

### 5. Add Focused Regression Coverage for Local Folder Behavior

The local workflow now spans permission state, persistent handles, save semantics, and path resolution. It needs targeted regression tests, not just manual verification.

Planned test coverage:

- reconnect flow after permission loss
- cancelled picker/save flows
- stale remembered folder + filename combinations
- `Cmd/Ctrl+S` behavior across local/server save modes
- identical-file reuse inside the working folder
- suffix collision handling
- nested relative path reloads

Success criteria:

- local-folder regressions are caught by focused automated tests instead of only by manual reproduction

## Mid-Term Improvements

### 6. Add Folder Drop as a First-Class Open Flow

Dragging a folder onto Sitrec should be able to:

- set the working folder
- detect sitch files inside it
- open the most likely candidate or ask the user which one to open

This is a power-user feature, but it fits the project-workspace model well.

Constraints:

- Chromium-centric API support
- must preserve current file-drop behavior as fallback

### 7. Add Project-Level Asset Management

Once provenance exists, Sitrec can expose more project maintenance tools.

Possible improvements:

- show all locally referenced assets for the current sitch
- show which assets are unused
- let the user consolidate duplicates
- let the user move assets between preferred subfolders

This should come after provenance and collision UX, not before.

### 8. Reassess Helper-App / Wrapper Direction Only If Browser Limits Still Hurt

A browser-only solution should remain the default plan.

Only revisit a helper app or desktop wrapper if real pain remains after the roadmap above, for example:

- browser permission friction remains too high
- folder watching is important enough to justify native integration
- non-Chromium support becomes a hard requirement

If that happens, define the trigger conditions first instead of drifting into infrastructure work prematurely.

## Open Product Decisions

These need explicit answers before some UX work can be finalized:

1. Should `Copy into working folder` be the default recommendation for most local projects?
2. Should provenance be visible in the main UI, or only in advanced/project management views?
3. When a remote asset is used in a local sitch, should save warn, auto-copy, or ask every time?
4. Should collision dialogs appear immediately at import, only at save, or both?
5. Should project asset organization be fixed (`local/media`, `local/tracks`, etc.) or user-configurable?

## Acceptance Criteria

The local-folder experience is "good enough" for the next stage when:

1. A new user can understand the working-folder model without external explanation.
2. Save behavior is predictable from the UI before the user clicks.
3. Imported files have explicit provenance and deterministic save behavior.
4. Name collisions are user-visible and recoverable.
5. Local-project regressions are covered by focused tests.

## Likely Code Touchpoints

| File | Likely Role in Future Work |
|------|-----------------------------|
| `src/CFileManager.js` | Provenance tracking, local save behavior, collision handling, import/save decisions |
| `src/CustomSupport.js` | Serialization of provenance and local asset references |
| `src/DragDropHandler.js` | Import-time UX, folder-drop support, copy/session-only choices |
| `src/fileSystemFetch.js` | Nested path handling and local read behavior |
| `src/FileUtils.js` | Save/open picker flows and user-facing file prompts |
| `src/SitrecObjectResolver.js` | Reference canonicalization for mixed local/remote asset states |
| `src/index.js` | Startup reconnect flow and working-folder restoration UX |

## Recommended Order

1. Add onboarding/status polish.
2. Add provenance tracking.
3. Add focused local-folder regression coverage.
4. Add import-time copy/session-only UX.
5. Add explicit collision choices.
6. Reevaluate folder-drop and project-level asset tools.
7. Only then decide whether a helper app is justified.
