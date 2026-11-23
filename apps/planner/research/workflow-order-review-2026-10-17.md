# Workflow order audit — BrainanaTarget 0.1.8

## Executed simulations

- Every permutation of five setup actions (chamber, target, hardware configuration,
  target assignment, surface availability), for MRI-first and CT-first projects:
  240 orders, 2,920 counted state transitions. Actions blocked by prerequisites
  were revisited after prerequisites existed (280 such attempts).
- Every ordered pair of the 16 hardware presets: 256 family switches. Checked
  setup confirmation, valid geometry and insertion limits, and target retention
  using the same preservation rule as the configuration dialog.
- Every permutation of four image actions (underlay selection, blending,
  window/colormap adjustment, 3D opacity), with MRI-first and CT-first projects:
  48 orders through the actual renderer with GPU I/O mocked.
- Search versus apply, stale candidate rejection after moving a target, failed
  edits preserving the project, target removal/undo/redo, branching after Undo,
  reset clearing history, individual/uniform lengths and CT planning activation.
- Actual image-editor handlers with a mocked DOM: history changes update controls,
  Close does not reapply old settings, New project closes image/layer windows, and
  an asynchronous import finishing in another project is discarded.
- CT rim-fit provenance validation and invalidation for segmentation changes;
  display-only opacity, colormap and visibility changes retain fitted geometry.

## Fixes

1. Image editors observe changed stored display settings even when focused.
   External history/header changes cancel pending stale updates. CT checkboxes,
   threshold and crop controls synchronize too. Closing an idle editor no longer
   performs a write that could reverse Undo.
2. Image imports and editor initialization check project/asset identity after
   asynchronous decoding. Late work cannot attach an old-frame image to a new
   project. Reset also closes prior image/layer tools.
3. Main-project Undo/Redo shortcuts do not run behind modal hardware drafts.
4. Explicitly enabled CT preview assets are accepted as rim-fit provenance.
   Changing threshold, crop, planning inclusion or source bytes invalidates the
   dependent rim; display-only changes do not.
5. Corrected prerequisite text when entering Electrode before defining a chamber,
   and removed an obsolete reference to the old atlas dropdown in Targets.

## Reproduction and limits

Run `npm run planner:test:workflow`, `npm run planner:test`, `npm run lint`, and
`npm run planner:build`. These checks passed. The workflow suite uses real domain
transactions and actual renderer/editor logic, with mocked GPU/DOM I/O where
needed. It does not model every numeric parameter, all possible event timings,
all modal interactions, or native rendered pixels.

The Playwright graphics test was attempted. Chromium/ANGLE failed to initialize
inside this environment before the app could be exercised. Native macOS visual
and pointer behavior therefore remain unverified; successful compilation and
mocked tests are not presented as a native end-to-end pass.

Only the Apple Silicon macOS package was rebuilt for this release.
