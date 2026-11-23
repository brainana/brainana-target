# Trajectory views: purpose and layout assessment

## What the two views provide

**Along trajectory** is an oblique anatomical reslice through the selected electrode's shaft, from the grid toward its tip. It helps inspect anatomical structures and marked exclusions along the insertion path when the trajectory is not aligned with a cardinal plane. One such plane is insufficient to inspect every side of the shaft; rotating the plane around the shaft is necessary.

**Across trajectory** is a reslice perpendicular to the shaft. At the tip it shows nearby anatomy and target relationships. Moving it up and down the shaft exposes local cross-sections along the insertion path, including other shafts intersecting that plane. It is potentially useful for arrays, but it is not a quantitative collision or vessel-clearance guarantee.

The old implementation fixed the along-plane orientation and the cross-section at the tip. It sampled only the chosen anatomy image in grayscale. During image loading, target definition and hardware configuration, the panes were commonly empty or uninformative yet occupied almost half the viewer workspace. Zoom and clicking alone did not justify permanent panes.

## Decision in 0.1.15

The default workspace has two full-height panels: Anatomy and 3D anatomy/implants. Anatomy has a view selector:

- Cardinal slices, the default.
- Along trajectory, with a 0–180° rotation control around the shaft.
- Across trajectory, with distance from grid adjustable from the entry plane through 10 mm beyond the tip, and an At tip reset.

Trajectory modes become available when the selected electrode has an applied or previewed placement. Invalid/unplaced geometry returns the viewport to cardinal slices. Only the requested reslice is sampled; resolution scales with the displayed viewport, capped at 768 pixels. Clicks still map to physical RAS coordinates. The controls change inspection planes, never the electrode's actual insertion depth or placement.

## Alternatives considered

| Layout | Benefit | Cost / judgment |
|---|---|---|
| Four permanent panes | Simultaneous cardinal, 3D and both trajectory views | Poor use of space before placement; rejected as the default |
| Anatomy view selector | Large useful views, minimal header controls, no empty permanent panes | Switching is required to compare cardinal and oblique views; chosen default |
| Optional popout or pinning | Simultaneous comparison on larger displays | More window management; reasonable later extension, not required by every user |
| Replace two cardinal slots with along/across | Keeps one cardinal reference visible | Requires a more complex linked layout/orientation controller; useful future advanced mode |
| 3D clipping / cutaway only | Intuitive implant context, complements slicing | Occlusion, transparency and contrast can conceal local anatomy; supplements but does not replace high-contrast reslicing |

## Current limits

Trajectory reslices show the selected MRI or CT in grayscale, plus targets, hardware and marked exclusions. They do not currently reproduce all atlas, fMRI or MRI/CT blending layers from the cardinal renderer. The mode help states this explicitly. Multilayer oblique compositing is a worthwhile next improvement, with label maps sampled using nearest-neighbor interpolation and continuous images interpolated separately.
