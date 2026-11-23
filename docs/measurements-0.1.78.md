# Stereotax references and measurements (0.1.78)

Planning has a dedicated Stereotax tab beside Review. Evaluation has the same tab and shared measurement controls. Existing frame/ear-bar/manipulator settings remain available from Configure stereotax or the 3D viewer toolbar.

## Workflow

1. Select From and To using named points, targets, frame zero, either ear tip, the current ear-tip midpoint, placed chamber top centers, guide-grid origins, headpost bases, electrode reference entries/tips or modeled arm holder tips. Crosshair buttons capture fixed image-coordinate snapshots instead of creating a live crosshair reference.
2. Choose image, stereotax-frame, chamber, grid or arm axes. The distance is the full straight 3D separation. Signed components are To minus From, projected onto the selected axes. Positive image RAS directions are right, anterior/front and superior/up. Rotated object axes retain their own X/Y/Z meaning.
3. Save a measurement, optionally name it, and adjust its ruler visibility/color. Locate From / To moves the slice crosshair without moving objects. Linked references follow edits and previews; fixed snapshots retain their captured positions.
4. Save named reference points from the slice crosshair. Existing imported landmarks appear in the same list. Rename, enter precise R/A/S coordinates, update from crosshair, or remove a point. Planner Undo/Redo restores these edits.
5. Review includes a measurement summary. Portable projects contain measurement definitions and a derived measurements.csv; coordinate exports and HTML reports also include the measurements. CSV keeps unrounded numbers and image identity. Hidden rulers remain in exports.

Frame zero and the current ear-tip midpoint are distinct. Asymmetric block positions or lateral centering may move the midpoint away from zero. Ear references use the modeled tip centers, including the frame pose and independent block offsets. An arm holder tip is the end of the modeled holder, not a calibrated physical electrode working tip.

## Rendering and persistence

Amber is the first ruler color; subsequent rulers use distinct defaults, with user-selected colors retained. Rulers and named-point labels are screen overlays, so they do not alter 3D fitting, opacity, physical geometry or collision calculations. Slice rulers are projected into each cardinal plane. Dashed lines and a `3D projection` label distinguish off-plane endpoints; the number always reports the full 3D distance. Named points appear only near their slice plane.

References use object identities. Removing an object makes its measurements unavailable; restoration through Undo restores the result. Arm identities are retained when another arm is removed; measurements never silently switch to a different arm at the same list index. Changing frame presets replaces arm identities, correctly invalidating references to the old arms.

Evaluation edits a working copy. Save project with measurements writes a portable reference/plan plus its measurements. Standalone MRI or CT evaluation can also save named points and measurements. Imported measured-track files remain separate. No hardware is controlled, no fiducial registration is estimated, and no physical dial calibration is performed in this foundation release.

## Organization and validation

- `packages/planning-core/measurements.ts`: reference resolution, coordinate bases and distance calculation.
- `apps/planner/src/ui/measurements.ts`: shared editable panel and Review summary.
- `apps/planner/src/render/measurementOverlay.ts`: non-geometric rulers and labels.
- `apps/planner/src/data/measurementExport.ts`: derived measurement rows/CSV.
- Project schema validation checks references structurally, finite points, valid colors and unique identities while permitting unavailable references to remain editable.

Domain tests cover signs, rotated axes, distance invariance, ear midpoint offsets, grid/electrode references, stable arm IDs, removed references, portable archives, CSV/report output and transactional Undo/Redo. Packaged desktop tests cover panel controls, physical overlay alignment, live frame preview/revert/apply, reference editing/removal, exports, both workspaces, and MRI-only evaluation saving.
