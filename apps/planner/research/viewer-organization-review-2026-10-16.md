# Viewer-inspired organization review and implementation

Reference inspected October 16, 2026: current public main branch
https://raw.githubusercontent.com/brainana/brainana-viewer/main/apps/viewer/src/ui/dashboard.ts
Retrieved through the connected web reader; direct shell networking was unavailable.
The source is a live branch, not a pinned release. Source comments describe a
wrapping cluster toolbar and a persistent underlay rail, with synchronized
brightness/contrast and exact window limits. Target adopts those relationships;
it does not copy a Viewer layout designed for browsing many subjects.

## Diagnosis

Target had accumulated access points without a clear ownership rule. Loaded
projects offered MRI/CT import in both Data and Images; project files were
repeated in the sidebar and global toolbar. Anatomy combined two selectors,
two overlay-related buttons, zoom and a long picker hint, yet brightness and
contrast required opening a window. The 3D header merged brain and skull opacity
while important view controls were dispersed between file dialogs and popovers.
The result was both repetition and poor access to frequent actions.

## Ownership rules implemented

| Concern | Canonical place | Reason |
| --- | --- | --- |
| Create an initial reference | Welcome workspace | One clear startup path for MRI, CT, pipeline dataset or demo. |
| New/open/save project, history, application preferences, tutorial | Global toolbar | These operate on the session rather than a particular image. |
| Project name, provenance, reference, coordinate convention | Project workflow panel (formerly Data) | Context and identity; no second import or save toolbar. |
| Add aligned MRI, CT, functional maps, atlases and skull meshes; inspect loaded files | Images workflow panel | A single file-management hub. Chamber offers a navigation link to Images rather than another file picker. |
| Choose anatomical underlay | Anatomy panel header | Visible next to the image being changed; independent of planning reference. |
| Brightness and contrast | Compact Anatomy header sliders | Synchronized with exact limits in the existing live display window; neither causes registration changes. |
| Detailed image window, colormap, crop, CT preview generation | Display button in Anatomy or a per-file Adjust action in Images | One shared editor with a view-local shortcut and a specific-file entry point. |
| Functional maps, image blending and atlas visibility | Overlays button in Anatomy | One movable layer manager. Atlas exploration is reached here or from its specific loaded file. |
| Brain, Skull, Implant opacity | Separate compact sliders in 3D header | Anatomical types are distinct; absent renderings disable their sliders with explanations. |
| Implant visibility, enhancements and cross-section details | Movable Scene window | One advanced 3D control surface. Cut is a shortcut to its cross-section controls, not another independent settings model. |
| Targeting, constraints, chamber and electrode dimensions | Existing planning panels | Geometry belongs to the planning workflow, not visualization settings. |

## Specific consistency decisions

- The header atlas selector is no longer presented beside a second atlas window
  selector; the explorer retains atlas selection and ROI controls.
- Startup import and tutorial actions are not duplicated in Project and the
  welcome area. Global Open/Save and Tutorial remain accessible throughout.
- Brain opacity affects brain surfaces or MRI fallback volume; Skull opacity
  affects skull surfaces, CT previews and CT fallback volume. Implant opacity
  continues to affect implant parts without hiding target/avoidance markers.
- Skull-preview opacity is no longer a competing per-image slider; the 3D Skull
  control is its owner. Threshold/crop construction remains an image-specific
  operation, and does not rebuild on ordinary brightness/opacity adjustments.
- Panel headers are structured as heading/actions and a compact quick-control
  row. Related controls stay clustered and adapt to actual pane width.
- File editors, ROI exploration and the layer manager are contextual tools, not
  additional workflow stages. Their state remains shared with the header controls.

## Deliberate differences from Viewer

Target retains its planning inspector, four views, candidate preview/apply
workflow and fixed coordinate reference. Viewer-style subject comparison,
longitudinal analysis and morphometry are not introduced as empty controls.
Additional images still must be aligned; visualization is not registration.
CT threshold previews remain approximate visualization meshes, not validated
skull segmentations or automatic mounting surfaces.

## Validation scope

Check single ownership of imports, shared quick/exact window state, responsive
header dimensions, separate brain/skull rendering, hide/restore at zero opacity,
nonmodal advanced tools, and unchanged project reference/geometry. Desktop build
success is separate from native operating-system runtime verification.

Actual verification in this session: TypeScript/Vite build, lint, full planner
unit suite, and renderer-state tests with GPU I/O mocked passed. The renderer
checks cover mixed brain/skull meshes, MRI versus CT volume fallbacks, independent
opacities and zero/restore. The browser organization check was attempted but
Chromium/ANGLE could not initialize in this sandbox. Consequently responsive
pixel bounds, live screenshots and native-window behavior are not claimed as
verified here. The test remains available for a graphics-enabled environment.
