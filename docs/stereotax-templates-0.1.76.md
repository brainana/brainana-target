# Stereotax templates and adjustments (0.1.76)

The same catalog, physical coordinates and geometry are used in planning and evaluation. Open **Stereotaxic setup…** beside the 3D viewer, or use **Configure stereotax…** in Review / evaluation Setup. Changes preview immediately; **Apply frame** keeps them. Frame settings are included in portable projects.

## Finding a frame

Mouse, rat and tree-shrew projects initially show small-animal models. Macaque projects show large frames. Marmoset projects show Narishige SR-6C-HT and the adaptable SR-5 frames. Unspecified / Other species show the whole catalog. **Show all animal sizes** exposes the whole catalog for unusual setups. A previously saved out-of-family frame is retained rather than replaced. Tree-shrew choices are based on size, not a manufacturer claim of validated species compatibility.

Ear tips and bite adaptors are filtered by both frame family and species. The filter is a convenience; measurements are still needed to align hardware to the animal. Custom frames, base plates and arms remain available.

## Verified manufacturer dimensions

| Assembly | Dimensions represented | Manufacturer reference |
|---|---|---|
| Kopf 900 / 900-C | 353.06 × 254 mm plate; ear axis 53 mm above plate; 960 XYZ travel 80 mm; 0.1 mm vernier | [900](https://kopfinstruments.com/product/model-900-small-animal-stereotaxic-instrument1/) |
| Kopf 940 | Same plate and ear height; ear zero 222.5802 mm from posterior plate edge; digital 0.010 mm readout | [940](https://kopfinstruments.com/product/model-940-small-animal-stereotaxic-instrument-with-digital-display-console/) |
| Kopf 900LS / 900-E | Same plate, ear height and posterior offset; rotating base; 960 included | [900LS](https://kopfinstruments.com/product/model-900ls-small-animal-stereotaxic-instrument/) |
| Kopf 902 / 942 / 962 | Two manipulators: 960 / digital / 961 respectively | [902](https://kopfinstruments.com/product/model-902-dual-small-animal-stereotaxic-instrument/), [942](https://kopfinstruments.com/product/model-942-small-animal-stereotaxic-instrument-with-digital-display-console/), [962](https://kopfinstruments.com/product/model-962-dual-ultra-precise-small-animal-stereotaxic-instrument/) |
| Kopf 930 | 431.8 × 254 mm plate; 53 mm ear height; posterior offset 234.95 mm; 18.7 mm square AP rail, 254 mm long, 127 mm posterior to zero; ±100 mm calibration | [930](https://kopfinstruments.com/product/model-930-small-animal-stereotaxic-frame-assembly/) |
| Kopf 920 rat adaptor | AP travel 44 mm; tooth bar DV −20 to +10 mm; 1 mm/revolution, 0.1 mm graduations | [920](https://kopfinstruments.com/product/model-920-rat-adaptor/) |
| Kopf 957 rat ear bars | 6.3 mm square shaft, 35 mm calibration, 18° taper, 0.8 mm tip radius | [920](https://kopfinstruments.com/product/model-920-rat-adaptor/), [ear-bar table](https://kopfinstruments.com/product/ear-bars/) |
| Kopf ear-bar families | 800: 6.3 mm / 50 mm scale; 900: 6.3 / 35; 1700: 9.4 / 50; 1900: 4.75 / 15. Species-specific cup, blunt, rounded, pin and auditory-bore profiles | [Ear-bar table](https://kopfinstruments.com/product/ear-bars/) |
| Kopf 912 | 609.6 × 304.8 × 25.4 mm plate | [Base plates](https://kopfinstruments.com/product/base-plates/) |
| Kopf 1211 | 406.4 × 304.8 × 9.525 mm plate; 19.05 mm mounting socket | [1211](https://kopfinstruments.com/product/model-1211-base-plate/) |
| Kopf 900M | 18.7 mm square, 254 mm AP rail; 955M 45° tips with 20 mm calibration; rat adaptor AP 46 mm and DV −10 to +10 mm | [900M](https://kopfinstruments.com/product/model-900m-small-animal-mri-stereotaxic-instrument/) |
| Narishige SR-5R-HT / SR-5M-HT / SR-6C-HT | 400 × 300 × 110 mm overall base assembly; 18.7 mm AP rail. Rat / mouse / marmoset families with appropriate jaw adaptors | [Rat](https://products.narishige-group.com/group1/SR-5R-HT/stereotaxic/english.html), [mouse](https://products.narishige-group.com/group1/SR-5M-HT_SR-5M1-HT/stereotaxic/english.html), [marmoset](https://products.narishige-group.com/group1/SR-6C-HT/stereotaxic/english.html) |
| Narishige EB-3A / EB-3B | 70 mm overall length; rat/marmoset / mouse respectively | [EB-3A](https://products.narishige-group.com/group1/EB-3A/stereotaxic/english.html), [EB-3B](https://products.narishige-group.com/group1/EB-3B/stereotaxic/english.html) |

## Adjustments and geometry

The frame origin is the initial ear-tip midpoint. Whole-frame R/A/S and rotation align it to the scan. Individual ear blocks have front/back and height offsets; the pair also has spacing and lateral centering controls. Each tip can be placed from the volume crosshair. Ear bars have actual end profiles and calibration ticks, rather than a single rectangular beam.

A base plate is positioned by the ear axis height and distance from its posterior edge, independently from AP rail length and rail drop. The 1211 includes its circular mounting socket; socket position and shaft extension remain schematic. Plates can be hidden or given custom dimensions.

Manipulators show clamps, posts, links, universal joints, carriages, three slides, controls and holders. Model travel bounds the stage sliders; custom stage travel is editable. Stage offsets start at the middle of the entered assembly location. Tool tilt and swivel rotate the slide axes and holder. Changing stage coordinates or tilt updates the geometry and the holder-tip location used by the slice locator. The 960 universal joint allows ±90° tilt and 360° swivel, with 2° manufacturer angle graduations. The UI permits continuous geometric adjustment rather than treating a graduation as a mechanical stop.

For the 920/926 family, bite-adaptor AP travel is separate from the contact coordinate, and DV sliders use the published range. Contact can be set from the crosshair.

## What is still approximate

This is a dimensioned planning drawing, not manufacturer CAD. Catalog pages do not provide every rail spacing, plate thickness, clamp, carriage, support, jaw, holder or knob dimension. These parts use editable, explicitly labeled illustrative dimensions. For example, an unpublished plate thickness initially draws as 6 mm. The Narishige 110 mm figure is **overall assembly height**, not plate thickness or ear-axis height; its ear-axis height and rail positioning require measurements. Narishige tip widths/tapers are also approximate where only length is published. Changing species never changes an existing saved frame silently.

Sources checked 2026-11-21. Model catalog and kinematics live in `packages/planning-core/stereotax.ts` and `stereotaxSetup.ts`; both workspaces use `stereotaxGeometry.ts` and the shared settings UI. Numeric geometry, family filtering, travel, portable save/reopen and packaged desktop interactions are covered by stereotax regression tests.
