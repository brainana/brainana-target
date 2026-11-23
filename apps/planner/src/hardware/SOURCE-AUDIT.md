# Electrode catalog and configuration audit

Checked 2026-10-11 against manufacturer product pages, technical tables, design forms and the Plexon Probe Technical Guide. This is a source audit for the planning library, not an assertion that every orderable variant or every product in the four manufacturers’ catalogs is implemented.

## Implemented configuration coverage

| Family | Geometry applied to the project | Saved order specifications | Geometry still requiring an ordered drawing |
| --- | --- | --- | --- |
| Plexon U-Probe | 8/16/24/32/64 sites; single/stereotrode/tetrode maps; 15/20/25/40 µm sites; published pitch choices; total versus reinforcement length; accessory-dependent minimum shaft diameter and first-site offset; opposing-face planning layout | Fluid/optic counts, reinforcement diameter, connectors, bend angle, connector orientation, reference/ground | Actual tubing OD, custom outlet positions, Janus face assignment, oval sites, custom cable and angled reinforcement clearance |
| Plexon N-Form | Regular footprint, 1–16 shanks, up to 8 sites/shank and 4–128 total; 0.5–15 mm lengths; 400/500 µm pitch; tip site and minimum site gaps; proximal site limits; individual shank lengths | Connector and cable length | Actual footprint, enclosing width, varying per-shank site maps, taper and backplate |
| Plexon Thumbtack | Technical-table 3 mm shaft; 8/16/24 sites; 210/500 µm shaft diameter; 15/40 µm sites; variable pitch; 450 µm tip offset | Cable and connector | Silicone disc, bent leads and custom variants outside the technical table |
| Microprobes FMA | 18/36 physical electrodes, 16/32 recording channels; traditional/HD pitch; common and individual 0.5–10 mm lengths; uniform/slanted/staggered/clustered planning patterns | Material, impedance, cable, connector, reference and ground | Exact 18/36 hole map, actual shaft diameter, reference needle assignments and ceramic substrate |
| Microprobes LMAv2 | 4–32 sites/shank; 12.5/15/25 µm sites; >=75 µm spacing; multiple regular shanks; custom site centres | Tip function, additional support tube, connector, reference and ground | Maximum enclosing diameter, taper, additional support tube geometry and exact tip wiring |
| Microprobes MEA | 4–64 physical electrodes; rectangular rows/columns; 100–1000 µm pitch; 1–40 mm lengths; individual lengths; 1–6 µm exposed tips | Material, impedance, tubing, epoxy length, accessories, connector, reference and ground | Enclosing shaft diameter, custom footprints, epoxy, cannula/fiber and reference geometry |
| Blackrock Utah | Gallery 5×5/8×8/10×10 footprints, 400 µm pitch, 0.5/1/1.5 mm research needles; slanted or individual lengths | Metallization, cable length, port count, connector, reference and ground | Needle diameter/taper/site dimensions, wired channel map, substrate and custom nonstandard dimensions |
| Neuropixels | 1.0, 2.0 single/four shank, 1.0 HD, NHP Short and Long fixed geometry templates | Cap and acquisition-system descriptions | Exact channel/site maps where still illustrative, electronics and holders; not an arbitrary custom-fabrication service |

Every manufacturer option is explicitly tagged as geometry or descriptive metadata. Geometry options update physical paths, site coordinates and the saved project. Metadata options preserve measured custom geometry. Explicit site centres support custom variable-spacing/opposing-face maps; they are validated against physical shaft size/length and exported without replacing them with regular spacing.

The hardware library displays the currently applied reach, physical length, cross-section, needle/site count, site size and extent. Its selector follows the selected electrode and Undo/Redo, rather than a separate stale dropdown choice.

## Primary sources and decisions

- [U-Probe current product specification](https://plexon.com/products/plexon-u-probe-2/) supplies the current minimum-diameter table and dependent options.
- [Plexon Probe Technical Guide](https://plexon.com/wp-content/uploads/2020/01/Probe-Technical-Guide.pdf), revision PRBTN0003f, supplies group diagrams. Stereotrode sites are side by side; tetrodes have a 2×2 arrangement. The tetrode intergroup gap is measured between neighboring rows, not group centres.
- The guide and current U-Probe web table disagree for the 16-channel zero-accessory diameter (210 versus 185 µm). The app uses the current web table and labels the value as a minimum, not a guaranteed delivered dimension.
- [N-Form](https://plexon.com/products/n-form/) supplies shank/site constraints. The initial width and rectangular arrangement are clearly labeled planning inputs. The model does not infer longer-shank taper from a nominal thickness.
- [Thumbtack](https://plexon.com/products/thumbtack-probe/) has broader channel/size claims in the description than in its technical table. The implemented controls follow the technical table. Combinations whose site extent exceeds the 3 mm shaft are rejected.
- [LMAv2 product](https://www.microprobes.com/products/multichannel-arrays/lma/lmav2) and [multi-shank design form](https://microprobes.com/support-and-download/online-design-forms/odf-lmav2-ms) supply separate geometry and ordering fields. App caps on regular shank count, spacing and length are not presented as supplier fabrication limits.
- [FMA](https://microprobes.com/products/multichannel-arrays/fma) distinguishes physical electrodes and recording channels, and documents traditional/HD pitches and custom individual lengths. Microprobes names Uniform, Slanted, Staggered and Clustered length configurations; fixed default shortest/longest lengths are not established by the source. The generated arrangements are labeled planning examples, with editable endpoints and per-electrode overrides (verified 2026-10-11).
- [MEA product](https://microprobes.com/products/multichannel-arrays/mea) and [MEA design form](https://microprobes.com/support-and-download/online-design-forms/odf-mea) supply the length/spacing/count fields. An exposed tip diameter is not reused as a shaft diameter.
- [Microprobes comparison chart](https://microprobes.com/products/multichannel-arrays/array-comparison-chart) is explicitly labeled October 2018 and disagrees with some newer product pages. Family-specific product/design pages take precedence; chart ranges are not silently mixed into LMAv2.
- [Utah](https://blackrockneurotech.com/products/utah-array/) supplies research lengths and gallery footprints. “1024 channels” is a multi-array system count. The “2–12” array-dimension entry lacks units; it is not used as a fabricated rows/columns range. Small-array wired counts remain measured inputs.
- [Neuropixels 2.0](https://www.neuropixels.org/probe2-0) identifies fixed single/four-shank variants, sites and simultaneous channels. Metal/silicon cap alternatives are documented for 2.0 and require confirmation for other variants.
- [NHP Short NP1015](https://www.neuropixels.org/probe-1-0-nhp-short) differs from ordinary NP1.0 in thickness. [NHP Long NP1032](https://www.neuropixels.org/probe-1-0-nhp-long) uses the current product dimensions; older research variants are not interchangeable.
- [NP1.0 HD datasheet](https://1d1204a4-e092-4bd5-ab7d-6d350a74299f.filesusr.com/ugd/328966_5e6cfe79dad24d74b3f9a7ca97561f56.pdf) supplies the dense site grid. The first-site centre remains a labeled inference from tip length.

## Further products found in the referenced catalogs

These entries are researched coverage gaps, not usable presets masquerading as complete models:

| Product | Source / status | Required before a faithful planner model |
| --- | --- | --- |
| Plexon S-Probe / V-Probe | [Technical Guide](https://plexon.com/wp-content/uploads/2020/01/Probe-Technical-Guide.pdf); individual product-page fetches returned HTTP 429 during this audit | Separate OD/first-site tables and tip profiles; do not copy U-Probe dimensions |
| Plexon SiNAPS | [Product overview](https://plexon.com/products/neural-electrodes-probes-and-arrays/) | Exact variant drawings, site maps, shank and package dimensions |
| Plexon NeuroLight | Same overview | LED/stimulation geometry and supported site/variant drawings |
| Microprobes MBA | [MBA](https://microprobes.com/products/multichannel-arrays/mba) | Wires deliberately splay during implantation; a rigid parallel array cannot reproduce their deployed paths |
| Microprobes MWA | [MWA](https://microprobes.com/products/multichannel-arrays/mwa) | Distinguish custom PtIr and discontinued standard NiCr. Current table/form conflicts need variant confirmation before offering presets |
| Microprobes WFMA / LMAv1 / optogenetic variants | [Manufacturer product navigation](https://microprobes.com/products/multichannel-arrays/array-comparison-chart) | Wireless package, version-specific dimensions and integrated accessory geometry |
| Neuropixels quad-base / specialty probes | [2.0 variants](https://www.neuropixels.org/probe2-0) | Quad-base electrical/channel differences and exact variant geometry, beyond selecting four shanks |

The planner currently checks inserted shafts against marked avoidance regions and arrays against the chamber bore. It does not evaluate holder/substrate/cable/accessory clearance. Low-profile cortical arrays still use the grid-plane attachment model; direct surface implantation is a distinct workflow that remains to be implemented.

## Verification

Manufacturer tests check dependency-driven OD and tip changes, reinforcement versus usable reach, grouped-site coordinates, 64-channel restrictions, array/channel distinctions, length patterns, family bounds, N-Form proximal rules, cable-versus-needle length, custom site validation and CSV coordinates. Browser tests check the actual saved project, selection changes, geometry edits, Undo/Redo, rejected edits, guide order and visual readouts.
