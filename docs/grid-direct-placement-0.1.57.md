# BrainanaTarget 0.1.57

## Grid seating and placement feedback

The chamber top is the reference plane and its wall extends downward. An automatically seated grid now has its highest edge flush with that plane. Its bottom position follows changes in tilt, bore and thin-edge thickness. Custom vertical positioning is still available explicitly.

For a 10 mm bore with a 2 mm thin edge at 30 degrees, maximum grid thickness is 7.7735 mm. The insert fits within an 8 mm straight cylinder. Changing back to zero degrees seats the 2 mm insert below the lip. Fitted chamber rims can have shorter walls; those cases still require the physical grid to fit. Some individual holes may be blocked by the wall and remain visible in the blocked-hole color.

Placement results and errors now survive replacement of the sidebar while a worker is running. Pending calculations have a visible status and cancel action; changing placement tabs cannot leave an old request permanently pending.

## Electrodes without chambers

New project tasks include an electrode implant without a chamber, with or without a headpost. Existing electrodes can also switch mounting method in Electrode. Direct placement stores an electrode reference and preferred skull entry without creating a chamber or guide grid. Automatic and Manual tabs support entry search, surface clicks, previews and explicit application. Position also permits adjustment of applied reference coordinates, angles and insertion depth.

A floating FMA or Utah array has a separate array base and skull entry. The solver estimates the array base from the target and actual selected needle length; cable length is not counted as shaft reach. This does not establish contact with cortex or design the bone opening or cable route. Review the base against the anatomy. Direct search checks the selected entry approach and the array's needles against selected hard constraints and ranks soft conflicts. It does not test unmarked tissue or mutual electrode collisions.

Ordinary guide grids are unavailable for FMA, Utah and other fixed multi-shaft footprints. Applying incompatible hardware disables a grid when no compatible electrode still uses it. Chamber specifications also prevent enabling an ordinary grid when only incompatible devices are defined.

## Independent skull connectors

Published Blackrock overall dimensions are provided for CerePort 128, CerePort 256 and the documented Omnetics output connector. These are occupied-space envelopes, not connector fabrication models. Neck diameters are recorded, but an unpublished base/neck profile is not invented. A connector has its own skull position and orientation and remains independent of the implanted array. Placed connectors are conservative hard obstacles in subsequent searches. Their coordinates, dimensions, source references and reference STL are exported.

FMA pedestals vary by connector and mounting variant. Enter the measured overall pedestal dimensions for the ordered variant; this release does not invent a universal FMA pedestal size. Manufacturer information is linked from the editor.

References:

- Blackrock Utah array specifications: https://blackrockneurotech.com/products/utah-array/
- Microprobes FMA, connectors and pedestal variants: https://www.microprobes.com/products/multichannel-arrays/fma
- Omnetics A79022-001 drawings and STEP reference: https://www.omnetics.com/product/a79022-001/

## Verification

Core geometry and workflow regressions cover the reported chamber dimensions, repeated tilt changes, arbitrary chamber orientation, explicit protrusion mode, grid compatibility, direct FMA/Utah placement, selected-needle offsets, stale-result rejection, hard/soft/ignored avoidance, independent connector rendering, coordinate/STL export and portable save/reopen. Delayed-worker DOM tests verify results/errors after sidebar replacement and cancellation. An actual background worker exercises direct search/apply and a supported 10/2/8 chamber with a 30-degree grid.

Native interactive window behavior was not visually verified in this session. The release uses the previously packaged Apple Silicon runtime with rebuilt application assets and verified archive integrity. Source code is included separately.
