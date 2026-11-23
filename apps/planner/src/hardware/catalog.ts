import type { Electrode, ElectrodeHardware } from '@brainana/planning-core/model.ts'
import { minimumInsertion, maximumInsertion } from '@brainana/planning-core/hardware.ts'
export interface HardwarePreset {
  id: string
  label: string
  manufacturer: string
  facts: string
  assumptions: string
  sources: string[]
  length: number
  diameter: number
  sites: number
  spacing: number
  siteSize: number
  geometry: Partial<ElectrodeHardware>
}
import { initializeConfiguration } from './configuration.ts'
const np = 'https://www.neuropixels.org/'
const micro = 'https://www.microprobes.com/products/multichannel-arrays/'
export const hardwareCatalog: HardwarePreset[] = [
  {
    id: 'custom-linear',
    label: 'Custom linear probe',
    manufacturer: 'Custom',
    facts: 'User-defined dimensions.',
    assumptions: 'Initial values are examples; enter your device dimensions.',
    sources: [],
    length: 150,
    diameter: 0.3,
    sites: 1,
    spacing: 1,
    siteSize: 0.05,
    geometry: {},
  },
  {
    id: 'custom-tungsten',
    label: 'Custom single tungsten microelectrode',
    manufacturer: 'Custom',
    facts: 'One exposed recording contact on one tungsten microelectrode. Enter measured dimensions.',
    assumptions: 'Material is descriptive; tip exposure and usable length must match your device.',
    sources: [],
    length: 50,
    diameter: 0.125,
    sites: 1,
    spacing: 0.1,
    siteSize: 0.025,
    geometry: { tipOffset: 0.0125 },
  },
  {
    id: 'custom-array',
    label: 'Custom rectangular array',
    manufacturer: 'Custom',
    facts: 'User-defined rigid, parallel-shaft array.',
    assumptions: 'Initial 4 × 4 layout is an example. Holder and substrate are not modeled.',
    sources: [],
    length: 20,
    diameter: 0.1,
    sites: 1,
    spacing: 0.1,
    siteSize: 0.015,
    geometry: { rows: 4, columns: 4, pitchX: 1, pitchY: 1, tipOffset: 0.02, recordingChannels: 16 },
  },
  {
    id: 'plexon-u',
    label: 'Plexon U-Probe',
    manufacturer: 'Plexon',
    facts:
      'One configurable family: 8, 16, 24, 32 or 64 recording sites/channels. Choose single, stereotrode or tetrode grouping; supported choices depend on channel count. Dimensions follow the selected configuration.',
    assumptions:
      "50 mm is an example length from the 30–150 mm family range. Check your ordered length and tube size. The reinforcement tube and connector are not shown. Contact numbers run from tip toward base here and may differ from Plexon channel numbers.",
    sources: [
      'https://plexon.com/products/plexon-u-probe-2/',
      'https://plexon.com/wp-content/uploads/2024/11/Custom-Probe-Brochure.pdf',
    ],
    length: 50,
    diameter: 0.185,
    sites: 16,
    spacing: 0.1,
    siteSize: 0.015,
    geometry: { tipOffset: 0.32, recordingChannels: 16 },
  },
  {
    id: 'np1',
    label: 'Neuropixels 1.0 · 960 sites / 384 channels',
    manufacturer: 'imec / Neuropixels',
    facts:
      '10 mm silicon shank, 70 × 24 µm cross-section; 960 selectable sites, 384 simultaneous recording channels.',
    assumptions:
      "The preview uses a simplified two-column contact layout: 20 µm between rows, 32 µm between columns, 200 µm from the tip to the first contact, and 12 µm contact size. It does not reproduce the exact staggered channel map. The cap, base electronics and cable are not shown.",
    sources: [np + 'probe1-0'],
    length: 10,
    diameter: 0.07,
    sites: 960,
    spacing: 0.02,
    siteSize: 0.012,
    geometry: {
      shape: 'blade',
      width: 0.07,
      thickness: 0.024,
      siteColumns: 2,
      sitePitchX: 0.032,
      tipOffset: 0.2,
      recordingChannels: 384,
    },
  },
  {
    id: 'np2-single',
    label: 'Neuropixels 2.0 · single shank',
    manufacturer: 'imec / Neuropixels',
    facts:
      '10 mm shank, 70 × 24 µm; 1280 sites in two columns, 15 µm row pitch and 32 µm column pitch; 384 channels.',
    assumptions:
      '12 µm site size and 200 µm tip offset are illustrative inputs. Electronics, cap and cable omitted; channel bank selection is not modeled.',
    sources: [np + 'probe2-0', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8244810/'],
    length: 10,
    diameter: 0.07,
    sites: 1280,
    spacing: 0.015,
    siteSize: 0.012,
    geometry: {
      shape: 'blade',
      width: 0.07,
      thickness: 0.024,
      siteColumns: 2,
      sitePitchX: 0.032,
      tipOffset: 0.2,
      recordingChannels: 384,
    },
  },
  {
    id: 'np2-four',
    label: 'Neuropixels 2.0 · four shanks',
    manufacturer: 'imec / Neuropixels',
    facts:
      'Four 10 mm shanks, 250 µm shank pitch, 70 × 24 µm cross-section; 1280 sites per shank / 5120 total; 384 recording channels. Site pitch 15 µm along and 32 µm across each shank.',
    assumptions:
      '12 µm site size and 200 µm tip offset are illustrative inputs. Cap, base electronics, cable and channel bank selection omitted.',
    sources: [np + 'probe2-0', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8244810/'],
    length: 10,
    diameter: 0.07,
    sites: 1280,
    spacing: 0.015,
    siteSize: 0.012,
    geometry: {
      shape: 'blade',
      width: 0.07,
      thickness: 0.024,
      rows: 1,
      columns: 4,
      pitchX: 0.25,
      siteColumns: 2,
      sitePitchX: 0.032,
      tipOffset: 0.2,
      recordingChannels: 384,
    },
  },
  {
    id: 'np-nhp-long',
    label: 'Neuropixels 1.0 NHP Long · 45 mm',
    manufacturer: 'imec / Neuropixels',
    facts:
      'Manufacturer lists a 45 mm shank, 70 × 122 µm cross-section, 4416 selectable sites and 384 simultaneous channels.',
    assumptions:
      'Two-column regular layout, 20 µm row pitch, 32 µm column pitch, 12 µm site size and 200 µm tip offset are illustrative. Site map, sharpened tip, base electronics, cap and cable omitted. Verify the exact variant: published research versions have different dimensions.',
    sources: [np + 'probe-1-0-nhp-long'],
    length: 45,
    diameter: 0.122,
    sites: 4416,
    spacing: 0.02,
    siteSize: 0.012,
    geometry: {
      shape: 'blade',
      width: 0.07,
      thickness: 0.122,
      siteColumns: 2,
      sitePitchX: 0.032,
      tipOffset: 0.2,
      recordingChannels: 384,
    },
  },
  {
    id: 'np-hd',
    label: 'Neuropixels 1.0 HD · 6144 sites',
    manufacturer: 'imec / Neuropixels',
    facts:
      '10 mm shank, 70 × 24 µm; 8 × 768 sites, 6 µm pitch, 5 × 5 µm sites; 384 channels; 175 µm tip length.',
    assumptions:
      'First site centre placed at 177.5 µm as an illustrative offset inferred from tip length; verify the drawing. Electronics, cap and cable omitted.',
    sources: [
      np + 'support',
      'https://1d1204a4-e092-4bd5-ab7d-6d350a74299f.filesusr.com/ugd/328966_5e6cfe79dad24d74b3f9a7ca97561f56.pdf',
    ],
    length: 10,
    diameter: 0.07,
    sites: 6144,
    spacing: 0.006,
    siteSize: 0.005,
    geometry: {
      shape: 'blade',
      width: 0.07,
      thickness: 0.024,
      siteColumns: 8,
      sitePitchX: 0.006,
      tipOffset: 0.1775,
      recordingChannels: 384,
    },
  },
  {
    id: 'micro-lma',
    label: 'Microprobes LMAv2 · configurable',
    manufacturer: 'Microprobes',
    facts:
      '4–32 sites per shaft; minimum site spacing 75 µm; published site diameters 12.5, 15 and 25 µm. Multi-shank versions are available.',
    assumptions:
      "The starting values of 50 mm length, 300 µm maximum shaft diameter and 200 µm tip-to-first-contact distance are examples to verify. The real shaft is narrower near the contacts and wider toward the connector. Enter its widest diameter so fit checks do not underestimate its size.",
    sources: [
      micro + 'lma/lmav2',
      'https://www.microprobes.com/support-and-download/online-design-forms/odf-lmav2-ms',
    ],
    length: 50,
    diameter: 0.3,
    sites: 16,
    spacing: 0.1,
    siteSize: 0.015,
    geometry: { tipOffset: 0.2, recordingChannels: 16 },
  },
  {
    id: 'micro-fma',
    label: 'Microprobes FMA · configurable family',
    manufacturer: 'Microprobes',
    facts:
      'Traditional FMA: 36 physical electrodes / 32 recording channels; 400 µm spacing; individual lengths 0.5–10 mm. HD spacing is 250 µm.',
    assumptions:
      '6 × 6 rectangular arrangement, 3 mm uniform length, 50 µm shaft diameter and 15 µm exposed tip are illustrative. Verify actual hole arrangement and shaft diameter. Ceramic substrate and reference wiring omitted.',
    sources: [micro + 'fma'],
    length: 3,
    diameter: 0.05,
    sites: 1,
    spacing: 0.1,
    siteSize: 0.015,
    geometry: { rows: 6, columns: 6, pitchX: 0.4, pitchY: 0.4, tipOffset: 0.015, recordingChannels: 32 },
  },
  {
    id: 'plexon-nform',
    label: 'Plexon N-Form · configurable 3D array',
    manufacturer: 'Plexon / Modular Bionics',
    facts:
      '1–16 shanks, 4–128 sites, up to 8 sites per shank; shank lengths 0.5–15 mm, GEN1 / GEN2 spacing 400 / 500 µm, 25 µm sites, nominal 125 µm thickness.',
    assumptions:
      'Initial 2 × 2 regular footprint and 200 µm width require the ordered drawing. Long-shank thickness may increase. Backplate, taper, holder and cable geometry omitted.',
    sources: ['https://plexon.com/products/n-form/'],
    length: 3.5,
    diameter: 0.2,
    sites: 8,
    spacing: 0.125,
    siteSize: 0.025,
    geometry: {
      shape: 'blade',
      width: 0.2,
      thickness: 0.125,
      rows: 2,
      columns: 2,
      pitchX: 0.5,
      pitchY: 0.5,
      tipOffset: 0,
      recordingChannels: 32,
    },
  },
  {
    id: 'plexon-thumbtack',
    label: 'Plexon Thumbtack · configurable',
    manufacturer: 'Plexon',
    facts:
      'Technical table: 3 mm shaft, 8 / 16 / 24 sites, diameter 210 / 500 µm; 15 / 40 µm sites, 50–500 µm spacing and 450 µm first-site distance.',
    assumptions:
      '3 mm is physical shaft length, distinct from 100 mm cable. Silicone disc and bent leads omitted. Ordered variants may differ from the technical table.',
    sources: ['https://plexon.com/products/thumbtack-probe/'],
    length: 3,
    diameter: 0.21,
    sites: 16,
    spacing: 0.1,
    siteSize: 0.015,
    geometry: { tipOffset: 0.45, recordingChannels: 16 },
  },
  {
    id: 'micro-mea',
    label: 'Microprobes MEA · configurable',
    manufacturer: 'Microprobes',
    facts: '4–64 electrodes; lengths 1–40 mm, spacing 100–1000 µm, exposed tips 1–6 µm.',
    assumptions:
      '4 × 4, 10 mm and 80 µm enclosing shaft diameter are initial planning values. Actual shaft diameter, epoxy and reference geometry require the ordered drawing.',
    sources: [micro + 'mea', 'https://microprobes.com/support-and-download/online-design-forms/odf-mea'],
    length: 10,
    diameter: 0.08,
    sites: 1,
    spacing: 0.1,
    siteSize: 0.003,
    geometry: { rows: 4, columns: 4, pitchX: 0.5, pitchY: 0.5, tipOffset: 0.0015, recordingChannels: 16 },
  },
  {
    id: 'np-nhp-short',
    label: 'Neuropixels NHP Short · NP1015',
    manufacturer: 'imec / Neuropixels',
    facts: '10 mm shank, 70 × 122 µm cross-section, 960 sites and 384 recording channels.',
    assumptions:
      'Regular site map and 200 µm offset are illustrative; confirm the variant drawing. Base, holder and cable geometry omitted.',
    sources: [np + 'probe-1-0-nhp-short'],
    length: 10,
    diameter: 0.122,
    sites: 960,
    spacing: 0.02,
    siteSize: 0.012,
    geometry: {
      shape: 'blade',
      width: 0.07,
      thickness: 0.122,
      siteColumns: 2,
      sitePitchX: 0.032,
      tipOffset: 0.2,
      recordingChannels: 384,
    },
  },
  {
    id: 'utah',
    label: 'Blackrock Utah · configurable family',
    manufacturer: 'Blackrock Neurotech',
    facts:
      '400 µm pitch; research needle lengths 0.5–1.5 mm. Manufacturer illustrates a 10 × 10 array and a 4 × 4 mm substrate.',
    assumptions:
      '100 shafts include all physical needles; recording count set to 96 as a planning example. 80 µm enclosing shaft diameter and 20 µm exposed site are illustrative, not manufacturer-verified. Substrate, taper and channel assignments omitted. This cortical array generally cannot reach a target from a tall chamber grid.',
    sources: ['https://blackrockneurotech.com/products/utah-array/'],
    length: 1.5,
    diameter: 0.08,
    sites: 1,
    spacing: 0.1,
    siteSize: 0.02,
    geometry: { rows: 10, columns: 10, pitchX: 0.4, pitchY: 0.4, tipOffset: 0.02, recordingChannels: 96 },
  },
]
export function applyHardwarePreset(e: Electrode, preset: HardwarePreset): void {
  delete e.guideTube
  e.length = preset.length
  e.diameter = preset.diameter
  e.contactCount = preset.sites
  e.contactSpacing = preset.spacing
  e.contactLength = preset.siteSize
  e.hardware = {
    presetId: preset.id,
    manufacturer: preset.manufacturer,
    model: preset.label,
    sources: [...preset.sources],
    checkedAt: '2026-10-11',
    notes: preset.facts + '\n' + preset.assumptions,
    modified: false,
    shape: 'round',
    width: preset.diameter,
    thickness: preset.diameter,
    rows: 1,
    columns: 1,
    pitchX: 1,
    pitchY: 1,
    rotation: 0,
    selectedShank: 0,
    shankLengths: [],
    reservedLength: 0,
    siteColumns: 1,
    sitePitchX: 0.032,
    tipOffset: preset.siteSize / 2,
    recordingChannels: preset.sites,
    ...preset.geometry,
  }
  initializeConfiguration(e)
  e.depth = Math.max(minimumInsertion(e), Math.min(e.depth, maximumInsertion(e)))
  e.targetId = null
}
