# BrainanaTarget code review — 20 October 2026 (0.1.54)

## Scope and result

Reviewed application startup and project loading, undo/snapshots/autosave, image and atlas state, CT/MRI surface editors, avoidance painting and worker transport, chamber/electrode/grid state, placement previews and asynchronous search, floating-window/preview lifetime, and export boundaries. Read the relevant implementations and ran the complete planner core and workflow regression commands. This review is scoped to the planner and its planning-core package; unrelated existing viewer changes were preserved.

The domain/UI separation is useful: `packages/planning-core` owns geometry, constraints and validation; rendering and editing tools sit in `apps/planner`; project snapshots/history are separate from image payloads and GPU objects. The largest weaknesses are coordination and resource ownership, rather than a need to rewrite the solver or reorganize every panel.

## Verified issues fixed

1. **Out-of-order placement requests.** Different manual/automatic requests could finish in reverse order and older callbacks could replace a newer preview, or clear a newer map on error. Added a shared per-store placement-task owner, cancellation signals and geometry-aware completion checks. Switching placement tabs, leaving the section, changing planning inputs, replacing/clearing a project, or starting a newer request cancels superseded work and terminates its worker. Presentation-only edits do not invalidate a calculation. Removed whole-project JSON comparisons that serialized large headpost/avoidance meshes during search/apply validation.

2. **Late project/atlas loads.** A project or atlas decode could complete after clearing the workspace, or an older request could replace a newer selection. Scene loading now uses request generations; atlas installation checks both generation and the caller's active-project guard. Atlas import commits against the current same-project state, preserving edits made while decoding. A failed reference/mesh parse retains the previous caches rather than clearing them before parsing. Removed a duplicate atlas load during project restoration.

3. **Repeated image copies.** `nativeSurfaceSpacing` constructed a complete `VolumeSampler`, which reorients/copies the voxel array, merely to obtain physical spacing. MRI editor redraws called this more than once. It now reads and validates only the affine matrix. A regression test forbids voxel-buffer access while reading spacing.

4. **Redundant GPU rebuilds.** Repeated calls to clear an already empty placement map invalidated all generated scene meshes. This occurred on ordinary project/display updates. Empty-map clearing is now a no-op; nonempty map reuse also checks its source geometry. A renderer test verifies that repeated empty clears preserve the same mesh objects.

5. **Temporary preview GPU lifetime.** NiiVue `cleanup()` releases observers/listeners but not its WebGL context. Temporary surface/headpost previews relied on that method alone. Centralized idempotent preview cleanup explicitly releases temporary contexts and handles failed/unfinished attachment. Chamber previews use the same cleanup. Old asynchronous preview attachment cannot dispose a newer preview instance.

6. **Image-tool lifetime.** Removing stale adjustment-window DOM nodes bypassed their resize-listener cleanup, retaining closed tools and their captured state. Project changes now close the actual floating-window objects. Close is idempotent and cancels pending display timers. Two clicks while an image is being decoded now open only one tool window.

7. **Electrode-selection navigation.** Selecting an electrode in Position always changed the active section to Electrode. Selection now refreshes the current section without redirecting it.

8. **Worker send failure.** A failed surface-paint `postMessage` left a pending request and a transport whose geometry-cache state did not match the worker. Failed sends now reject the request, cancel/reset the transport and allow the next stroke to start cleanly.

9. **Surface-editor polling cost.** The surface workspace's refresh key included serialized opening-marker polygon buffers. It now compares immutable geometry identities, consistent with the main scene's existing cache strategy.

## Verification

- `npm run planner:test`: 17 script groups passed, covering geometry, manufacturer hardware, angled grids, local/automatic placement, surface support, avoidance, persistence/import, CT segmentation and skull openings.
- `npm run planner:test:workflow`: 25 script groups passed, including MRI processing/worker parity, startup, guide/state ordering, preview persistence, target voxels, image controls/history, headposts, export and the new lifecycle tests.
- New tests explicitly cover project/atlas requests completed in reverse order; clear during loading; failed reference import; placement supersession/cancellation and worker termination; geometry-versus-display invalidation; temporary context cleanup; image-tool listener teardown and duplicate opening; failed paint-worker sends/recovery; and affine-only spacing reads.
- Existing image tests exercise MRI-first and CT-first permutations for selection, blending, contrast/window and independent 3D opacity.
- TypeScript/production build and lint passed. Packaged Apple Silicon assets were compared with the build; local signature and ZIP integrity were checked.

GPU I/O is mocked in the renderer state tests. They verify transitions, ownership and rendering decisions, not final pixels. Native interactive verification was unavailable: the Mac was locked, and the sandbox refused the local preview-server bind. No user autosave was loaded or overwritten for this review. No claim is made that synthetic solver tests establish correctness for every subject-specific CT, skull defect or implant.

## Organization assessment and next work

- `main.ts` and `render/scene.ts` still each exceed 1,000 lines. `main.ts` mixes project activation/import, saving, command wiring, selection, guide orchestration and scene refresh; `scene.ts` mixes image/atlas synchronization, mounting surfaces, implant mesh generation and picking. Those are the next boundaries to extract, using the lifecycle tests to preserve behavior. This pass extracted shared placement-task and temporary-preview ownership instead of a broad rewrite.
- A common cancellable-job interface would make placement, image loading and surface tools more consistent. The worker implementations already support source caching and cancellation in several places; the new placement ownership closes a gap.
- STL/grid generation, report generation and portable ZIP creation still include synchronous work. Large exports can pause the main thread; moving export generation into a worker is a useful next performance improvement. This review does not claim that every possible stall has been eliminated.
- Projects maintain immutable shared polygon buffers, which avoids cloning them for every history update. Keep that rule: replacing geometry creates a new value; editing metadata must not mutate shared buffers.
- Further solver changes should be driven by reproducible saved projects and comparisons against known feasible placements, with separate reporting for unsupported surface, hardware reach, wall clearance and avoidance. Do not loosen constraints merely to make a failed search return a candidate.
