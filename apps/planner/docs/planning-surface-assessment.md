# Surface preview changes in 0.1.15

Surface editing now has an isolated, rotatable live preview with a larger popout option. Threshold, crop, resolution and component sliders automatically trigger a background update after 300 ms of inactivity. Superseded workers are cancelled; draft geometry never enters the main scene cache, saved project or planning source.

One **Finalize surface** action extracts a welded, interpolated binary-mask isosurface using marching tetrahedra, saves its extraction settings, and activates it for planning. The prior separate Build and Inspect/use stages are removed. Finalization does not invent scan detail or perform morphological repair; the mask and physical sampling resolution still bound its accuracy. Existing saved voxel-face meshes remain supported until re-finalized.

The inline preview stays visible while scrolling preparation controls. The main anatomy/implant view remains available for anatomical context, and only changes when finalization updates the selected surface. Invalid drafts preserve the previously finalized surface.

The assessment below records the 0.1.14 findings; its workflow and voxel-face-final-output descriptions are superseded by this change.

# Planning surface assessment — 0.1.14

The surface is a planning input, not an image-display option. It controls whether a new chamber is outside anatomy and supports subsequent local base fitting. A bad or unintended source can therefore invalidate an otherwise convincing placement.

## Findings and changes

| Previous behavior | Change |
|---|---|
| Surface extraction embedded among CT display controls | Dedicated Planning surface tab after Load images; Project is first and unnumbered |
| Implicit preference for any imported skull, then enabled CT, then brain meshes | Explicit reviewed source selection saved with the project; new projects start without a selected surface; older projects retain labelled automatic selection until changed |
| Fixed 2 mm nearest-sampled grid | Explicit 0.5, 1 or 2 mm sampling; new CT preparation starts at 1 mm; legacy configurations retain 2 mm |
| All thresholded objects retained | Explicit all/largest six-connected component policy; counts and removed sample totals reported |
| Crop cells could extend beyond their maximum bound | New preparations use full voxel-edge bounds; partial cells are sampled at their own centers and clamped to the requested physical crop; contact with crop boundary reported because artificial cut faces can be generated |
| Preview built twice on UI thread | Worker-based extraction and prepared-geometry reuse in the renderer |
| Geometry change could keep a previous surface cache | Geometry key includes resolution and component policy; obsolete geometry excluded from readiness; fitting invalidation includes these inputs |
| A visible mesh implied usability | Structural checks for finite coordinates, indices, nonempty/nondegenerate triangles, plus rough reference-bounds overlap; explicit user review before switching source |

## Workflow

1. Load an MRI or CT as reference and any already aligned additional images.
2. In Planning surface, import an aligned skull mesh, choose a CT, or choose an available brain approximation. Brain hemispheres may be selected together. RAS millimetres are required; import performs no registration.
3. For CT, specify threshold, physical crop, sampling resolution and component cleanup. Build a preview while keeping views interactive. Draft controls do not silently change the last built geometry.
4. Inspect alignment, coverage, scanner-bed removal and the intended approach area using the shared anatomy/3D views. Confirm review and select the source for planning. Rebuilding CT disables its planning use until reviewed again.
5. Define hardware and compute placements. Visibility/opacity is independent of source selection. Changing source or segmentation invalidates dependent rim fits and current candidate previews.

## Limits that remain material

- **Thresholding is not skull recognition.** Intensities are scaled using NIfTI slope/intercept; HU calibration is not assumed. Metal, teeth and bed may exceed bone intensity. Largest-component cleanup can retain a bed or discard separated skull pieces. Always inspect the result.
- **Sampling is approximate.** The extractor creates a voxel-face mesh. Thin structures and openings may be missed or become blocky, particularly at 2 mm; 0.5 mm does not create information absent in the scan. No automatic smoothing, closing or hole filling is applied because those operations change geometry.
- **Crop contact is a warning, not an automatic failure.** Neck cropping is sometimes intentional, but crop caps are not anatomical mounting patches. Do not mount on an artificial crop face.
- **Reference-bounds overlap is only a coarse check.** Overlapping bounds do not prove registration, orientation or correct units. Structural checks do not prove watertightness, absence of self-intersection or anatomical correctness.
- **Search and base fitting answer different questions.** Search uses surface vertices to construct a conservative exterior envelope, bridging concavities. Local rim fitting uses triangle intersections. The search can reject viable concave approaches; neither establishes skull thickness or guarantees a manufacturable implant.
- **Brain surfaces are fallback approximations.** They do not represent the skull. MRI-only users should preferably supply a professionally reviewed skull segmentation; brain-only planning needs independent standoff/reach checks.
- **Older projects remain reproducible.** Missing sampling/component fields retain the previous 2 mm/all policy. Legacy automatic source selection is shown explicitly. New selection, extraction settings and original image bytes round-trip in project archives.

## Next priorities

1. Import an aligned binary/label segmentation as a surface source, preserving voxel geometry and external segmentation provenance. This provides a practical route from Slicer or a processing pipeline without duplicating a full segmentation package.
2. Add interactive crop-box/crop-plane display and an optional segmentation overlay in slices, so threshold edits can be checked directly against bone.
3. Add component picking by crosshair/3D click; support multiple retained skull fragments. Largest-only is insufficient for some scans.
4. Add mesh topology diagnostics (weld-aware boundary/nonmanifold edges, self-intersection checks) and a repair/export handoff. Report changes rather than silently repairing anatomy.
5. Replace or supplement the conservative envelope with accelerated exact surface/body collision tests and an explicit allowable mounting region. This needs independent geometric validation, especially near concavities and crop caps.
6. Add local thickness estimates only for validated paired inner/outer skull surfaces, with explicit uncertainty and scan-resolution limits.

## Reference

3D Slicer's Segment Editor separates threshold segmentation, connected-component cleanup and smoothing. The implementation follows that separation of responsibilities rather than treating a threshold preview as a validated skull segmentation:
https://slicer.readthedocs.io/en/latest/user_guide/modules/segmenteditor.html


## 0.1.18 editor update

The editor keeps rendering bounds fixed to the full CT image, preserving scale and user zoom while threshold and crop change. New drafts start at the finest native voxel spacing, with explicit downsampling factors; saved sampling settings remain unchanged until edited. Both draft and final use the same bounded Taubin-smoothed triangle mesh, stored as the `smooth` representation. Legacy `voxel` and `isosurface` representations retain their extraction behavior. Crop-face vertices are fixed; smoothing displacement is limited to half the sampling interval. This is not an automatic skull-only outer-envelope segmentation: thresholded bone may include inner walls, implants, or connected non-skull anatomy.

Protective budgets are now 32 million samples and 2.4 million triangles. These are application memory/performance budgets, not detected system memory exhaustion. No silent downsampling or threshold changes occur. Worker equivalence, smoothing displacement/connectivity/roughness, and actual NiiVue framing math are tested without native GPU rendering.


## 0.1.19 outer mounting workflow

The CT editor now extracts an outer radial skull envelope rather than the inner and outer boundaries of a threshold mask. Thresholding and component selection are preprocessing. The selected bone component supplies the outermost supported intersection of rays from outside toward an intracranial reference point. Default reference is the component bounding-box center, not the image FOV center or electrode target. The user can select another connected bone component at the Anatomy crosshair, or correct the reference point. No rays are projected through a bone-valued reference point. New CT preparations use this representation; saved legacy representations remain readable.

This is a star-shaped cranial-vault approximation, not a general-purpose anatomical segmentation or a claim to reproduce Slicer Wrap Solidify. Strong concavities, skull-base geometry, hardware touching bone, and a component containing bed plus bone require inspection and correction (component selection/crop, reference point, threshold, or an imported prepared skull mesh). Unlike a convex hull, radial depth varies with direction; no triangles span unsupported rays, crop-truncated bone, or abrupt radial discontinuities. The source CT is immutable. Smoothing is bounded to half the sampling interval. Angular coverage/missing/crop/discontinuity reports are shown, not silently repaired.

Three CT cross-sections show the exact draft mesh contours. Their slice sliders and picking work independently of the main 3D view. Picking moves the Anatomy crosshair used for component/reference selection. Preview scale remains tied to the full CT bounds. Finalize saves representation, threshold, crop, native/downsampled spacing, component seed, and actual reference point together. Reload reconstructs the same exterior; cache and previous rim fits invalidate on center/component changes.

Search uses a triangle BVH to check rim support before the target plane and the complete sampled chamber-base fitting checks before offering a candidate. For the outward-oriented CT envelope, back faces cannot provide support through a missing near wall. The bore itself may lie over a craniotomy; the inner/outer rim and wall thickness must remain supported. Feasible candidates include the fitted base profile in preview and Apply. Thus search, visible chamber geometry, and later conformity use the same finalized surface. Existing fixed-chamber planning retains its measured pose.

Tests cover hollow shells without inner walls, bed selection, crop truncation without caps, real openings, outward normals, analytic curved rims, support relocation, search/apply/conform consistency, actual worker transport, CT pixel/contour rendering with mocked canvas, persistence, cache keys, and fit invalidation. Native rendering against an acquired CT still requires visual assessment.

Outer wrapping background: https://github.com/sebastianandress/Slicer-SurfaceWrapSolidify


## 0.1.20 corrections, opening entities and bounded views

The live CT review supports Navigate, Remove segmentation voxels, and Restore threshold voxels. The adjustable brush diameter is in millimetres; its slab thickness is the current segmentation sampling interval. Pointer movement forms continuous planar capsules and a surface update is scheduled only after the completed stroke. Red/green stroke overlays are independent of the source CT. Undo/redo and reset operate on draft strokes; Finalize stores them with the surface configuration. Replay occurs before component labeling, so removed connecting structures can separate correctly. Restore never paints synthetic bone below the original threshold. Source samples are immutable, and worker/direct extraction agree. Resize/letterbox coordinate mapping is tested.

Optional opening detection analyzes closed manifold mesh-boundary loops. Physical diameter bounds, crop-edge distance, projected circularity and planarity filter obvious base/crop/slit boundaries. Results are candidate openings, not identification of screw-hole etiology. Natural anatomy and threshold artifacts remain possible. Each `SurfaceOpening` is a separate asset/frame-linked entity with RAS center, exclusion radius, detected/manual provenance, geometry fingerprint, review state, and avoidance flag. The user can locate, size, remove/undo, or manually add missed markers. Detection reruns deduplicate existing locations. CT slices and the editor 3D view display markers; confirmed exclusions also render in the main avoidance layer.

Only explicitly reviewed, enabled annotations matching their source CT hash and saved segmentation constrain placement. Generic avoidance-area selection does not override these independent per-opening switches. Geometry changes mark prior reviews inactive; rows, Finalize status and Position explain this. Finalize atomically saves surface corrections and opening records. Project archives round-trip both; global history refreshes opening-only edits, image removal removes dependent annotations, and changed strokes invalidate cached geometry and chamber rim fits. Chamber-body exclusion checks use the fitted wall depth rather than nominal height alone.

The preview uses separate bounded 3D/slice rows with a relative-size slider. Captions, status and action buttons occupy a footer rather than shrinking into the canvases. Small windows can scroll instead of overlapping contents. The guide has a scrollable instruction body and fixed action footer. Window movement dispatches a synchronous geometry-update event for highlights; it no longer relies on the 250 ms state poll. Native visual rendering remains unverified in this execution environment; DOM/canvas fixtures exercise structure, gestures, picking, guide tracking and tool actions.
