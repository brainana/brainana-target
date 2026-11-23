# Planner architecture and extension guide

## Dependency direction

```text
apps/planner (composition, UI, adapters)
 ├── packages/planning-core (domain model, validation, geometry, reslicing)
 ├── packages/brainana-data (shared dataset discovery + atlas metadata)
 └── packages/core-* and ui (existing platform)

apps/viewer → same brainana-data + platform packages
```

Shared packages do not import application code. `core-purity_test.mjs` checks this boundary. Existing Viewer import paths are compatibility re-exports, not duplicated implementations.

## Components

| Location | Responsibility |
|---|---|
| `packages/planning-core/model.ts` | Serializable objects and identities; image frame, targets, chamber pose, grid, electrodes |
| `packages/planning-core/geometry.ts` | Pure rigid transforms, grid geometry, trajectories, contact positions and nearest-hole estimates |
| `packages/planning-core/validation.ts` | File/DB boundary checks, finite numbers, ranges, IDs and relationships |
| `packages/planning-core/reslice.ts` | Physical slice-plane sampling with injected world-space volume sampler |
| `packages/brainana-data` | Brainana reconstruction discovery, derived surface assets and atlas tables |
| `apps/planner/src/state/store.ts` | Transactional project edits, bounded history and grouped gestures |
| `apps/planner/src/data` | File import, checksum verification, archive codec, atomic persistence and exports |
| `apps/planner/src/render` | NiiVue scene adapter, volume sampler, hardware primitives and trajectory canvases |
| `apps/planner/src/features` | Independent workflow panels with an explicit registry and injected context |
| `apps/planner/src/ui` | DOM controls and dataset dialog |
| `apps/planner/src/main.ts` | Composition root: orchestrates adapters and binds project changes to the interface |

Image payloads are kept outside undo history. The project contains asset IDs and checksums; a separate byte repository owns the payloads. An IndexedDB transaction saves the project and its payload map together. `SaveQueue` serializes writes and snapshots input so an older save cannot overwrite a newer one.

The project model is independent of NiiVue. GPU resources and temporary source URLs are adapter state. Archives contain original image/model bytes, not GPU state or source-session tokens.

## Add a panel

Create `src/features/<feature>.ts` exporting a `PlannerFeature`; register it in `features/index.ts`. Use the context's edit action for geometry changes, rather than modifying the store's returned snapshot. Use shared controls for consistent inputs and error handling. A feature must not import another panel.

Keep presentation-only selection in application state. Persist any selection that changes the interpretation of saved geometry or exported results. Live controls must preserve focus and pointer capture; a grouped edit should end when its gesture finishes.

## Add a hardware type

Define a serializable, versioned hardware definition and instance in planning-core. Keep immutable library definitions separate from placed instances. Add pure functions for its reference points and trajectories, validation for its dimensions and relationships, then a render adapter and panel. A mesh alone is insufficient: define units, local origin, insertion axis and attachments.

The initial schema uses arrays even though the prototype permits one chamber/grid. Additional assemblies can be enabled when selection, grid ownership and all panels support them. Introduce stable IDs rather than relying on array positions for that extension.

## Add CT or stereotactic calibration

Introduce named frames and explicit typed transform relationships: source frame, destination frame, convention, transform format, direction, provenance and review state. Extend frame validation before introducing new overlays. Preserve original image headers and transforms; displaying two volumes together does not establish a registration.

Use rigid transforms for physical hardware. Nonlinear atlas mappings may transfer targets and segmentations, but must not deform chambers or electrodes. An external registration worker should return a transform, diagnostics and provenance to the domain layer; it should never write directly into UI state.

## Evolve the project schema

Add an explicit schema migration before accepting a new version. Unknown versions must fail clearly. Validate archive and database reads before allocating graphics resources. Preserve full numeric precision and verify original payload hashes. Add fixtures for old projects when a migration is introduced.

## Validation strategy

Geometry tests use analytically known rigid rotations, electrode endpoints, grid holes and reslice values. Persistence tests verify original payload round-trips, checksums, atomic DB restore, ordered saves and rejected edits. Browser tests exercise the complete macaque planning workflow and portable reopen in a fresh context.

The existing Viewer suite protects the shared dataset extraction and platform behavior. Heavy numerical or registration additions need independent reference cases and landmark/error validation, not screenshots alone.

## Deliberate initial tradeoffs

A regular grid and straight electrode are parameterized directly; a generic plugin/hardware framework is deferred until a second hardware type establishes its requirements. Trajectory reslicing runs on a small CPU canvas; larger volumes, multiple simultaneous reslices or dynamic overlays may justify a worker or GPU adapter. Portable archives are stored ZIP files so already-compressed images are not redundantly recompressed.

## Constrained trajectory search

`packages/planning-core/optimization.ts` implements finite-segment/sphere clearance, bounded new-placement search, fixed-grid search, ranking, and stale-candidate rejection. It receives plain project objects and returns candidates plus rejection counts; it neither renders nor mutates during search. `targeting.ts` provides direct fitting commands with the same avoidance/tolerance checks. `features/targeting.ts` renders shared search controls and reviewable candidates; `features/avoidance.ts` edits constraints.

`Project.planning` and `Project.avoidRegions` are optional backward-compatible schema additions. Absent fields retain legacy project round-trip behavior; settings defaults are supplied by the core. Add future surface-based candidate generators or mesh/segmentation clearance methods in the core, retaining the explicit search/apply boundary. The current new-placement generator samples a user-defined planar access patch; it does not infer skull geometry from pial surfaces.

## Avoidance drawing and view transforms

`ui/avoidanceBrush.ts` owns pointer capture, stroke preview, cancellation and slice locking; world mapping is injected for NiiVue and trajectory planes. `AvoidRegion.points` optionally stores a continuous centreline with one metric brush radius. Sphere regions retain their original representation. `optimization.ts` uses exact segment-to-segment distances for shaft/capsule clearance. Rendering combines stroke spheres/cylinders in 3D and evaluates exact intersections in trajectory slices. Completed strokes enter the transactional store once, preserving undo and archive compatibility. Zoom controls use NiiVue's physical pan/scale API or change the reslice plane field of view; drawing and picking reuse the active transforms.

## Batch rendering and avoidance masks

`scene.update(..., updateAvoidance)` holds the last rendered avoidance snapshot during a drawing batch. Geometry constraints in the store remain current; finishing, changing panels, or an explicit surface update publishes the snapshot. Brush display meshes use fewer tessellation segments, without changing the saved centres, paths, radii, or solver geometry. Avoidance meshes are omitted from the NiiVue slice renderer.

`planning-core/avoidance-mask.ts` computes exact pixel-centre capsule membership only in projected segment bounding boxes and culls off-plane segments. `render/avoidanceOverlay.ts` maps NiiVue slice tiles to world-space planes and displays cached 2D masks; `reslices.ts` uses the same mask implementation. Caches include plane transforms, resolution, and constraint geometry, so zooming or editing cannot reuse a stale mask. Browser regressions count WebGL buffer uploads during stroke release to verify deferred surface work.
