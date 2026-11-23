# BrainanaTarget 0.1.55 — implemented optimizations

The changes in this version address the remaining performance work from the 0.1.54 review. They preserve geometry definitions and file formats while moving expensive file work out of the interface thread and retaining unchanged rendered objects.

## Background file operations and shared job handling

- Portable project packing and opening, STL/grid ZIP generation, CSV export and HTML-report generation run in a worker in the desktop/browser app. Progress messages identify the current stage. Finished binary results transfer back without another worker-to-interface copy.
- `workers/task.ts` owns completion, progress, errors, abort listeners and worker termination. Placement and file jobs use the same task implementation. Persistent image/surface workers retain their separate source-caching lifetime.
- `features/projectExports.ts` owns file actions. It captures a single coherent project snapshot and output filename before yielding; repeated clicks share an in-flight job; cancellation prevents stale downloads. Report screenshots and exported coordinates describe the same captured plan. Unapplied-preview reports remain blocked as before.
- Project save requests copy only referenced asset payloads into the worker, excluding orphaned image bytes. Main workspace activation also drops unreferenced payload entries.

## Retained geometry and GPU resources

- Split geometry generation into `render/sceneParts.ts`, with bounded per-object caches. Unchanged headposts, painted patches and hardware keep their generated geometry while another object changes.
- Split GPU mesh ownership into `render/sceneMeshes.ts`. Unchanged vertex/index buffers remain uploaded. Changed or removed parts replace/release only their own meshes. Drawing order, visibility, slice filtering and clipping ownership are preserved.
- `scene.ts` is reduced from about 1,100 to about 915 lines. Image loading/synchronization remains in this module; this is an incremental split, not a claim that all application coordination has been refactored.
- Grid target-coloring invalidation now includes allowed target miss, so the retained geometry cannot hide a change in that constraint.

## Faster geometry and fewer copies

- Binary STL writes fixed records directly, avoiding temporary vectors per triangle.
- Vertex transforms calculate the pose basis once per buffer, instead of once per vertex.
- Mesh combination preallocates typed buffers and offsets indices directly.
- Printable-grid sampling uses cached trigonometry, scalar coordinates and a numeric hole lookup. Its resolution and physical channel geometry are unchanged.
- Surface ray indexes cache triangle centroids and partition their index array in place instead of repeatedly sorting and slicing entire subtrees. Nearest-hit, maximum-projection and one-sided mounting behavior remain covered by geometric checks.
- Browser File/Blob and WebCrypto already snapshot their input. The new byte-view helper removes an unnecessary preparatory JavaScript copy while respecting subarray boundaries and shared-buffer fallback.
- Both MRI dark-band boundary methods now retain the one-sided outer-surface flag after reload, including the direct method that uses no supplied mask.

## Local measurements

Median warm-run times from three measured repetitions, recorded before and after these changes:

| Operation | Before | After |
| --- | ---: | ---: |
| Binary STL, 100,000 triangles | 37.91 ms | 2.19 ms |
| Transform headpost, 300,000 vertices | 28.66 ms | 0.60 ms |
| Combine 1,000 mesh buffers | 9.93 ms | 0.53 ms |
| Printable grid, 14 mm diameter, 15° tilt | 374.13 ms | 273.21 ms |
| Surface index, 100,000 triangles | 157.08 ms | 37.66 ms |

These are local function timings, not whole-app frame rates. The benchmark can be rerun with `npm run planner:benchmark`; timing varies by machine and load.

## Verification and limits

- All 18 core and 29 workflow script groups passed, plus the TypeScript/production build and lint.
- Real background-worker tests compare decompressed archive files and geometry exports with the existing formats, compare report/CSV output, reopen projects, verify that source image buffers are retained, exercise progress/error/cancellation paths, and observe the interface event loop continuing during worker execution.
- Retention tests verify that target edits reuse existing avoidance/headpost CPU geometry and GPU mesh objects, replacement affects the changed mesh, removal releases the old mesh, and drawing order/visibility remain correct. GPU I/O is mocked for these state tests.
- Geometry checks cover exact vertex transforms and STL records, tilted guide bores, 300 rays against a brute-force reference, vertex projections, ray limits, one-sided support, duplicate centroids, and byte-subarray/File snapshot behavior.
- Autosave storage format is unchanged. Initial image decoding, worker-message input copies, WebGL uploads and IndexedDB writes can still have a cost with very large projects. No claim is made that every possible stall is eliminated.
- Native interactive testing was unavailable in this environment; this release is not pixel-verified against the user's CT/MRI datasets.
