# Implant design references — reviewed 20 October 2026

The app now provides further-reading sections in Chamber, Electrode, and Headpost. Existing electrode presets also retain their manufacturer source links in their configuration and saved specifications. Custom dimensions are user measurements, not published templates.

## Chambers

- McAndrew et al. (2012), Individualized recording chambers for non-human primate neurophysiology: https://pmc.ncbi.nlm.nih.gov/articles/PMC3348412/ (metadata, abstract and figures verified at https://pubmed.ncbi.nlm.nih.gov/22498201/; PMC full text presented a browser challenge). Describes custom skull-conforming implants using aligned MRI/CT. Not a single universal dimension preset.
- Adams et al. (2011): https://pmc.ncbi.nlm.nih.gov/articles/PMC3174814/
- Psarou et al. (2023): https://doi.org/10.1016/j.jneumeth.2023.109899 — modular headpost and connector chambers. Connector housing is distinguished from electrode access.

## Open Ephys review

Reviewed homepage, system showcase, ShuttleDrive, flexDrive, R2, ONIX, acquisition systems and Twister3 pages, plus their linked design repositories/documentation.

- ShuttleDrive: https://open-ephys.org/shuttledrive — mouse tetrode/microwire implant. Files: https://github.com/open-ephys/shuttle-drive . Electrode arrangement is user-specific. Do not turn drive dimensions into electrode dimensions.
- R2: https://open-ephys.org/r2system — rodent probe carriers and drives, not electrode contact geometries. Documentation: https://3dneuro.github.io/r2-docs/index.html . Publication: https://doi.org/10.7554/eLife.65859 . The design repository linked from the vendor page is https://github.com/buzsakilab/3d_print_designs . No commercial-version equivalence is inferred.
- flexDrive: https://open-ephys.org/flexdrive — discontinued, superseded by ShuttleDrive; explicitly marked legacy.
- Twister3: https://open-ephys.org/twister3 and https://github.com/jonnew/twister3 — electrode preparation reference, not an implant preset.
- ONIX and acquisition headstages are recording electronics; compatible probe names do not establish new mechanical electrode designs.
- No macaque chamber or implanted headpost template was found on the reviewed Open Ephys pages. No rodent drive is relabeled as a macaque chamber or post.

Caps and chair holders are excluded from the headpost reference section, per user scope. Existing headpost manufacturer/publication links remain available. None of these links automatically changes project geometry or claims that CAD is bundled. Imported models and measured custom dimensions remain the basis of actual geometry.
