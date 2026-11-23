# BrainanaTarget 0.1.60 · deep audit

Reviewed the planner, evaluation workspace, shared planning geometry and the boundaries between project state, archive files, workers and rendering. The review started from 0.1.59. It kept the startup recovery from that release and did not alter the format of existing projects or clear local storage.

## Findings and fixes

| Area | Confirmed problem | Correction |
| --- | --- | --- |
| Geometry export | A chamber whose dimensions were saved but whose position was never applied could appear in CSV, HTML clearance summaries and STL exports at its placeholder pose. | Applied coordinates and meshes exclude unplaced assemblies. Specifications still round-trip in JSON and portable projects. An independently placed connector is still exported. |
| Electrode configuration | Switching a device with an off-centre guide-hole assignment to an incompatible array could reject the edit or leave a misleading hole offset; rejected edits could still close the dialog. | Commit the configuration as one validated edit, reset the new device to the centre, keep any grid still used by a compatible electrode, and leave the dialog open when the commit fails. Reject stale drafts rather than overwrite a newer electrode edit. |
| Grid geometry | A flat insert could mark a guide channel clear even when the specified drill diameter crossed the bore edge. | Include the explicit channel radius in the flat-grid edge check. |
| Manual placement | Rebuilding the Position panel after coordinate edits collapsed the section containing the Apply button. Turning on drag mode also treated an unplaced chamber as placed, even without a drag. | Keep the manual section expanded across redraws. Require an applied or explicitly accepted measured pose before drag mode. Leave drag mode when switching tabs. |
| Placement state | Switching electrodes could leave the previous skull-click handler, candidate preview or in-flight job attached to the new selection. In direct mode, an older completion could clear the pending flag of a newer request. | Cancel and clear selection-specific work on electrode change. Give pending direct requests an owner and preserve the selected result through a redraw. |
| Postoperative track fit | A single seeded iteration could converge to the wrong axis when its seed was perpendicular to the true dominant direction. It also reported an arbitrary direction for a symmetric mask. | Use a stable covariance calculation and solve the three-axis symmetric eigenproblem. Reject masks without a unique dominant direction. Tip selection still requires confirmation. |
| Cortical distance | Changing hemisphere visibility or hiding cortex could change or remove the reported distance. A failed surface patch could interrupt the redraw. | Measure across all loaded meshes of the selected cortical surface type, independent of visibility. An unavailable patch falls back to a point marker. |
| Archives and autosave | A supported project identifier with an underscore could be saved but filtered out during reopen; path-like identifiers could generate non-round-trippable filenames. Autosave completion relied on timestamps that can repeat. | Use the same safe asset-ID rule when writing and reading portable archives, reject duplicate recognized entries, and encode model identifiers in STL paths. Match autosave completion to the exact snapshot. |

## Remaining limits

- Browser autosave is scoped to the local origin. If a server starts on a different loopback port because the preferred port is occupied, autosave from the other origin may not appear. A portable project can still be opened. Fixing this across already installed versions would require a storage migration; this release does not move or erase old autosaves.
- The supplied NMT masks exercise the real import, cortex and comparison code. The audit does not establish registration accuracy, validate a surgical placement or replace checking an individual subject's CT and mask.
- The placement solver samples discrete candidates, and does not validate unmarked anatomy or all device-to-device interactions. Geometry tests cover constructed cases, including angled grids, fitted rims, and direct and fixed-chamber workflows.

## Verification

- Production build and lint passed.
- All 18 core and 35 workflow test groups passed. New regression cases cover off-centre incompatible hardware changes, stale drafts, unplaced export suppression, independent connectors, archive identifier round-trips, flat channel edge clearance, and a fitted-axis counterexample.
- Chrome passed the refreshed demo workflow: define an angled grid and unplaced chamber, apply measured placement, edit insertion depth, save/reopen in a fresh context, resume autosave, and import a standalone NIfTI.
- Chrome passed all six template-space tracks from the supplied NMT ZIP and a saved-plan comparison. Exported cortical distance was unchanged with the hemisphere filtered or the surface hidden.
- The packaged Apple Silicon app passed startup, both workspace routes, the planning demo, portable save, and shutdown with an isolated profile. Bundled assets and signature were verified.
