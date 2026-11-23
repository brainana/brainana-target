import { MAX_ELECTRODE_LENGTH_MM } from '@brainana/planning-core/model.ts'
import type { Electrode,Project } from '@brainana/planning-core/model.ts'
import {
  minimumInsertion,gridCompatibility,
  maximumInsertion,
  shankOffsets,
  shankLength,
} from '@brainana/planning-core/hardware.ts'

export interface HardwareOption {
  key: string
  label: string
  default: string | number
  choices?: Array<string | number>
  min?: number
  max?: number
  step?: number
  effect: 'geometry' | 'metadata'
}
export interface HardwareFamily {
  name: string
  source: string
  options: HardwareOption[]
  limitations: string
}
const select = (
  key: string,
  label: string,
  value: string | number,
  choices: Array<string | number>,
  effect: HardwareOption['effect'] = 'geometry',
): HardwareOption => ({ key, label, default: value, choices, effect })
const numeric = (
  key: string,
  label: string,
  value: number,
  min: number,
  max: number,
  effect: HardwareOption['effect'] = 'geometry',
): HardwareOption => ({ key, label, default: value, min, max, effect })
const connector = select(
  'connector',
  'Connector (saved specification)',
  'Confirm ordered connector',
  [
    'Confirm ordered connector',
    'A11365-001',
    'A12623-001',
    'A8393-001',
    'A79000-001',
    'A79014-001',
    'A70242-001',
    'A79038-001',
    'A79022-001',
    'A72312-001',
    'Customer supplied',
  ],
  'metadata',
)
const wiring = [
  select(
    'reference',
    'Reference connection',
    'Confirm ordered wiring',
    ['Confirm ordered wiring', 'Yes', 'No'],
    'metadata',
  ),
  select(
    'ground',
    'Ground connection',
    'Confirm ordered wiring',
    ['Confirm ordered wiring', 'Yes', 'No'],
    'metadata',
  ),
]
const profiles = select('lengthProfile', 'Electrode length configuration', 'Uniform', [
  'Uniform',
  'Slanted',
  'Staggered',
  'Clustered',
  'Individual lengths',
])
export const families: Record<string, HardwareFamily> = {
  plexon: {
    name: 'Plexon U-Probe order options',
    source: 'https://plexon.com/products/plexon-u-probe-2/',
    options: [
      select('channels', 'Recording contacts / channels', 16, [8, 16, 24, 32, 64]),
      select('layout', 'Site arrangement', 'Single', ['Single', 'Stereotrode', 'Tetrode']),
      select('spacing', 'Site / group pitch (µm)', 100, [50, 75, 100, 150, 200]),
      select('siteSize', 'Recording site diameter (µm)', 15, [15, 20, 25, 40]),
      numeric('totalLength', 'Tip to connector length (mm)', 50, 30, 150),
      numeric('reinforcement', 'Reinforcement tube length (mm)', 25, 5, 125),
      select(
        'reinforcementDiameter',
        'Reinforcement diameter (µm; specification only)',
        460,
        [460, 640],
        'metadata',
      ),
      select('fluid', 'Fluid capillaries', 0, [0, 1, 2, 3, 4]),
      select('optic', 'Optic fibers', 0, [0, 1, 2, 3, 4]),
      select('face', 'Site faces', 'One face', ['One face', 'Janus opposite faces']),
      select(
        'connector',
        'Connector (saved specification)',
        'Confirm ordered connector',
        [
          'Confirm ordered connector',
          'CON/8o50m-10P',
          '2 × CON/8o50m-10P',
          '3 × CON/8o50m-10P',
          'CON/16m-V',
          'CON/16o25m-18P',
          'CON/32m-V',
          '2 × CON/32m-V',
          'CON/64f-Samtec',
        ],
        'metadata',
      ),
      numeric('kink', 'Reinforcement angle (degrees; specification only)', 0, 0, 45, 'metadata'),
      select(
        'connectorOrientation',
        'Connector orientation',
        'Standard',
        ['Standard', 'Rotated 90°', 'Pig-tail custom cable'],
        'metadata',
      ),
      ...wiring,
    ],
    limitations:
      'The reinforcement is reserved above the grid, so usable reach is total length minus reinforcement length. Minimum shaft diameter follows the current U-Probe table; delivered tubing may be larger. Grouped sites use 50 µm intragroup spacing. Janus alternates groups between faces as a planning layout; verify the ordered map. Connector, tube bend, outlet positions and cable clearance are not modeled. Use an explicit site layout for Variotrodes or a supplier drawing.',
  },
  nform: {
    name: 'Plexon N-Form volumetric array',
    source: 'https://plexon.com/products/n-form/',
    options: [
      numeric('rows', 'Array rows', 2, 1, 16),
      numeric('columns', 'Shanks per row', 2, 1, 16),
      select('generation', 'Generation / shank pitch', 'GEN2 / 500 µm', ['GEN1 / 400 µm', 'GEN2 / 500 µm']),
      numeric('length', 'Common shank length (mm)', 3.5, 0.5, 15),
      profiles,
      numeric('shortLength', 'Shortest electrode length (mm)', 2, 0.5, 15),
      numeric('sites', 'Recording sites per shank', 8, 1, 8),
      numeric('firstGap', 'Tip site to next site (µm)', 250, 250, 1000),
      numeric('spacing', 'Other site spacing (µm)', 125, 125, 1000),
      numeric('cableLength', 'Cable length (mm)', 100, 15, 130, 'metadata'),
      select(
        'connector',
        'Output connector',
        'Confirm ordered connector',
        [
          'Confirm ordered connector',
          'Omnetics 32m-V',
          'Omnetics 16m-V',
          'TDT ZC32',
          'Samtec FTSH-118-01-L-DV',
          'CON/64f-Samtec',
          'CON/128f-Samtec',
        ],
        'metadata',
      ),
    ],
    limitations:
      '1–16 shanks and 4–128 channels; maximum 8 sites per shank. All shanks require a tip site. The first gap is at least 250 µm; other gaps at least 125 µm. Long-shank proximal site limits are checked. 125 µm thickness is published, but enclosing width, longer-shank taper and backplate geometry require the ordered drawing. The initial regular footprint and 200 µm width are planning inputs. Cable and backplate are saved/described, not collision geometry.',
  },
  thumbtack: {
    name: 'Plexon Thumbtack technical-table configuration',
    source: 'https://plexon.com/products/thumbtack-probe/',
    options: [
      select('channels', 'Recording contacts / channels', 16, [8, 16, 24]),
      select('diameter', 'Shaft diameter (µm)', 210, [210, 500]),
      select('siteSize', 'Recording site diameter (µm)', 15, [15, 40]),
      numeric('spacing', 'Contact spacing (µm)', 100, 50, 500),
      numeric('cableLength', 'Silicone cable length (mm; specification only)', 100, 1, 1000, 'metadata'),
      select('connector', 'Connector', 'CON/32m-V', ['CON/32m-V', 'Nickel-free CON/32m-V'], 'metadata'),
    ],
    limitations:
      'Uses the technical table’s 3 mm shaft and 450 µm first-site distance. The description mentions broader custom channel and size options without a matching dimension table; enter a measured custom device for those variants. Spacing combinations whose sites exceed the physical shaft are rejected. The 8 mm × 0.15 mm silicone disc and bent leads are not modeled; 100 mm cable is not usable shaft length.',
  },
  lma: {
    name: 'Microprobes LMAv2 design options',
    source: 'https://microprobes.com/support-and-download/online-design-forms/odf-lmav2-ms',
    options: [
      numeric('sites', 'Recording sites per shank', 16, 4, 32),
      select('siteSize', 'Recording site diameter (µm)', 15, [12.5, 15, 25]),
      numeric('shafts', 'Number of shanks', 1, 1, 16),
      numeric('pitch', 'Inter-shank spacing (µm)', 500, 1, 20000),
      numeric('length', 'Polyimide shaft length (mm)', 50, 1, 150),
      numeric('spacing', 'Contact spacing (µm)', 100, 75, 10000),
      select(
        'tipFunction',
        'Tip function (saved specification)',
        'None',
        ['None', 'Recording', 'Stimulation'],
        'metadata',
      ),
      select(
        'rigidTube',
        'Additional rigid tube',
        'None',
        ['None', 'Stainless steel', 'Microfil'],
        'metadata',
      ),
      numeric('tubeLength', 'Additional tube length (mm; specification only)', 0, 0, 150, 'metadata'),
      connector,
      ...wiring,
    ],
    limitations:
      'Shaft diameter and first-site offset remain measured inputs: the contact region is tapered. Shaft count and spacing have app geometry limits, not a published ordering range. Tube dimensions, tip wiring and connector are saved specifications; their additional geometry is not included. Custom site centres can be entered below.',
  },
  fma: {
    name: 'Microprobes FMA design options',
    source: 'https://microprobes.com/products/multichannel-arrays/fma',
    options: [
      select('shafts', 'Physical electrodes / recording channels', '36 / 32', ['18 / 16', '36 / 32']),
      select('pitch', 'Traditional / HD pitch (µm)', 400, [400, 250]),
      numeric('length', 'Uniform electrode length (mm)', 3, 0.5, 10),
      profiles,
      numeric('shortLength', 'Shortest electrode length (mm)', 1, 0.5, 10),
      select(
        'material',
        'Electrode material',
        'Platinum / Iridium',
        ['Platinum / Iridium', 'Pure Iridium', 'Activated Iridium'],
        'metadata',
      ),
      numeric('impedance', 'Nominal impedance (kΩ)', 500, 5, 5000, 'metadata'),
      numeric('cableLength', 'Cable length (mm)', 100, 1, 200, 'metadata'),
      connector,
      ...wiring,
    ],
    limitations:
      '18 / 36 physical electrodes and 16 / 32 recording channels are distinct. The rectangular 3 × 6 or 6 × 6 footprint is a planning approximation; confirm the ceramic hole map. Slanted, staggered and clustered patterns are editable planning layouts, not supplier channel maps. Shaft diameter, exposed tip, reference assignments and holder dimensions require your drawing. Ceramic substrate and cable geometry are not evaluated.',
  },
  mea: {
    name: 'Microprobes MEA design options',
    source: 'https://microprobes.com/support-and-download/online-design-forms/odf-mea',
    options: [
      numeric('rows', 'Array rows', 4, 1, 8),
      numeric('columns', 'Electrodes per row', 4, 1, 16),
      numeric('pitchX', 'Electrode spacing (µm)', 500, 100, 1000),
      numeric('pitchY', 'Row spacing (µm)', 500, 100, 1000),
      numeric('length', 'Electrode beyond epoxy (mm)', 10, 1, 40),
      profiles,
      numeric('shortLength', 'Shortest electrode length (mm)', 5, 1, 40),
      numeric('tipSize', 'Exposed tip diameter (µm)', 3, 1, 6),
      numeric('impedance', 'Nominal impedance (kΩ)', 500, 10, 5000, 'metadata'),
      select(
        'material',
        'Electrode material',
        'Platinum / Iridium',
        ['Platinum / Iridium', 'Pure Iridium'],
        'metadata',
      ),
      select('polyimide', 'Additional polyimide tubing', 'No', ['No', 'Yes'], 'metadata'),
      numeric('epoxyLength', 'Epoxy below connector (mm; specification only)', 0, 0, 150, 'metadata'),
      select(
        'accessory',
        'Integrated accessory',
        'None',
        ['None', 'Optic fiber', 'Drug delivery cannula', 'Both'],
        'metadata',
      ),
      connector,
      ...wiring,
    ],
    limitations:
      'The design form supports 4–64 electrodes. Tip diameter is not shaft diameter: enter the actual enclosing shaft diameter separately. Epoxy, tubing, optical fiber and cannula geometry require a supplier drawing and are not included in clearance. Reference and ground positions are not inferred.',
  },
  utah: {
    name: 'Blackrock Utah research options',
    source: 'https://blackrockneurotech.com/products/utah-array/',
    options: [
      select('layout', 'Illustrated array layout', '10 × 10', ['5 × 5', '8 × 8', '10 × 10']),
      select('length', 'Research electrode length (mm)', 1.5, [0.5, 1, 1.5]),
      select('lengthProfile', 'Electrode length configuration', 'Uniform', [
        'Uniform',
        'Slanted',
        'Individual lengths',
      ]),
      select('shortLength', 'Shortest electrode length (mm)', 0.5, [0.5, 1, 1.5]),
      select('material', 'Metallization', 'Platinum', ['Platinum', 'SIROF / IrOx'], 'metadata'),
      numeric('cableLength', 'Wire bundle length (mm)', 100, 20, 130, 'metadata'),
      select('ports', 'Multi-port option', 1, [1, 2, 3, 4], 'metadata'),
      select(
        'connector',
        'Output connector',
        'Confirm ordered connector',
        [
          'Confirm ordered connector',
          'CerePort 128',
          'CerePort 256',
          'Omnetics 16-Ch 18-pin',
          'Omnetics 32-Ch 36-pin',
          'Custom',
        ],
        'metadata',
      ),
      ...wiring,
    ],
    limitations:
      "The manufacturer shows 5 × 5, 8 × 8 and 10 × 10 layouts. Confirm how many electrodes in your device are wired for recording; 1024 channels describes a system of multiple arrays. Some published dimensions have no stated units and are not used here. Electrode diameter, taper and contact size are examples to check. The base, connectors and cables are not included in clearance checks. This is a surface array; cable length does not let its electrodes reach deeper through a chamber.",
  },
  np: {
    name: 'Neuropixels fixed probe geometry',
    source: 'https://www.neuropixels.org/probe2-0',
    options: [
      select(
        'cap',
        'Cap / holder (saved specification)',
        'Confirm variant',
        ['Confirm variant', 'Metal cap', 'Silicon cap'],
        'metadata',
      ),
      select(
        'acquisition',
        'Acquisition system',
        'Confirm system',
        ['Confirm system', 'OneBox', 'PXIe'],
        'metadata',
      ),
    ],
    limitations:
      "Each manufactured Neuropixels version has its own shaft length, number of shafts and contact layout. Changing those values makes a custom planning model, not a manufacturer-approved configuration. Choosing recording banks changes acquisition, not the physical geometry. Cap choices depend on the device version. The holder, base electronics and cable are not included in clearance checks.",
  },
}
export function familyKey(id: string): string | undefined {
  if (id.startsWith('plexon-u')) return 'plexon'
  if (id.startsWith('np')) return 'np'
  return (
    {
      'plexon-nform': 'nform',
      'plexon-thumbtack': 'thumbtack',
      'micro-lma': 'lma',
      'micro-fma': 'fma',
      'micro-mea': 'mea',
      utah: 'utah',
    } as Record<string, string>
  )[id]
}
export function optionValues(e: Electrode): Record<string, string | number> {
  const key = familyKey(e.hardware?.presetId ?? '')
  if (!key) return {}
  const values = Object.fromEntries(families[key].options.map((o) => [o.key, o.default]))
  if (key === 'plexon' && e.hardware?.presetId === 'plexon-u32') values.channels = 32
  return { ...values, ...e.hardware?.configuration }
}
function lengthPattern(e: Electrode, v: Record<string, string | number>): void {
  const h = e.hardware!,
    count = h.rows * h.columns,
    long = Number(v.length),
    short = Number(v.shortLength)
  if (v.lengthProfile === 'Individual lengths') return
  if (v.lengthProfile === 'Uniform') {
    h.shankLengths = []
    return
  }
  if (short > long)
    throw new Error('The shortest electrode length must not exceed the longest electrode length.')
  h.shankLengths = Array.from({ length: count }, (_, i) => {
    if (v.lengthProfile === 'Slanted')
      return short + ((long - short) * (i % h.columns)) / Math.max(1, h.columns - 1)
    if (v.lengthProfile === 'Staggered')
      return (Math.floor(i / h.columns) + (i % h.columns)) % 2 ? short : long
    return i % h.columns < h.columns / 2 ? short : long
  })
}
/** Mutates only inside a validated ProjectStore edit. All unit conversions happen here. */
export function configureHardware(e: Electrode, patch: Record<string, string | number>): void {
  const h = e.hardware!,
    key = familyKey(h.presetId)
  if (!key) return
  const family = families[key],
    v = { ...optionValues(e), ...patch }
  // Dormant endpoint values must not prevent choosing a documented length configuration.
  // Explicitly entered endpoints still validate; only adapting the common length or mode clamps it.
  if (
    family.options.some((o) => o.key === 'lengthProfile') &&
    (patch.length !== undefined || patch.lengthProfile !== undefined) &&
    patch.shortLength === undefined &&
    Number(v.shortLength) > Number(v.length)
  )
    v.shortLength = Number(v.length)

  for (const option of family.options) {
    const value = v[option.key]
    if (option.choices && !option.choices.includes(value)) throw new Error(`Unsupported ${option.label}.`)
    if (
      !option.choices &&
      (typeof value !== 'number' || !Number.isFinite(value) || value < option.min! || value > option.max!)
    )
      throw new Error(`${option.label} is outside the supported range.`)
  }
  if (key === 'plexon' && patch.reinforcementDiameter === 460 && e.diameter >= 0.236)
    throw new Error('This shaft diameter requires a 640 µm reinforcement tube.')
  if (
    Object.keys(patch).length &&
    Object.keys(patch).every((k) => family.options.find((o) => o.key === k)?.effect === 'metadata')
  ) {
    h.configuration = v
    h.modified = true
    return
  }
  if (key === 'plexon') {
    h.shape = 'round'
    h.rows = h.columns = 1
    h.selectedShank = 0
    const n = Number(v.channels),
      group = v.layout === 'Single' ? 1 : v.layout === 'Stereotrode' ? 2 : 4,
      extras = Number(v.fluid) + Number(v.optic),
      allowed = n === 64 ? 1 : group === 1 ? 4 : 2
    if (extras > allowed)
      throw new Error(`This configuration permits at most ${allowed} total fluid capillaries / optic fibers.`)
    if (n === 64 && group === 4)
      throw new Error('Plexon does not offer a 64-channel tetrode U-Probe in this specification.')
    if (n === 64 && !(group === 1 ? [50, 75, 100] : [100, 150]).includes(Number(v.spacing)))
      throw new Error('Unsupported pitch for the 64-channel configuration.')
    const total = Number(v.totalLength),
      reinforce = Number(v.reinforcement)
    if (total - reinforce < 25)
      throw new Error('Plexon requires at least 25 mm between the tip and reinforcement tube.')
    const table: Record<number, number[]> =
      group === 1
        ? {
            8: [185, 185, 210, 260, 300],
            16: [185, 210, 236, 300, 320],
            24: [210, 236, 300, 320, 360],
            32: [260, 260, 300, 320, 360],
            64: [320, 360],
          }
        : {
            8: [185, 185, 210],
            16: [185, 236, 236],
            24: [210, 260, 260],
            32: [260, 300, 300],
            64: [320, 360],
          }
    const diameter = table[n][extras]
    if (diameter >= 236 && patch.reinforcementDiameter === 460)
      throw new Error('This shaft diameter requires a 640 µm reinforcement tube.')
    if (diameter >= 236) v.reinforcementDiameter = 640
    e.length = total - reinforce
    h.reservedLength = reinforce
    h.shankLengths = []
    e.diameter = diameter / 1000
    h.width = e.diameter
    h.thickness = e.diameter
    e.contactCount = n
    h.recordingChannels = n
    e.contactSpacing = Number(v.spacing) / 1000
    e.contactLength = Number(v.siteSize) / 1000
    h.siteColumns = group === 1 ? 1 : 2
    h.sitePitchX = 0.05
    h.tipOffset =
      ({ 185: 320, 210: 360, 236: 410, 260: 450, 300: 520, 320: 560, 360: 620 } as Record<number, number>)[
        diameter
      ] / 1000
    h.sitePositions = Array.from({ length: n }, (_, i) => {
      const g = Math.floor(i / group),
        j = i % group,
        x = group === 1 ? 0 : j % 2 ? 0.025 : -0.025,
        face = v.face === 'Janus opposite faces' && g % 2 ? -1 : 1
      return [
        x,
        face * Math.sqrt((e.diameter / 2) ** 2 - x ** 2),
        h.tipOffset +
          g * (e.contactSpacing + (group === 4 ? 0.05 : 0)) +
          (group === 4 ? Math.floor(j / 2) * 0.05 : 0),
      ]
    })
  } else if (key === 'nform') {
    const rows = Number(v.rows),
      columns = Number(v.columns),
      sites = Number(v.sites),
      count = rows * columns
    if (
      ![rows, columns, sites].every(Number.isInteger) ||
      count > 16 ||
      sites * count < 4 ||
      sites * count > 128
    )
      throw new Error('N-Form requires 1–16 shanks, 1–8 sites per shank and 4–128 total sites.')
    h.rows = rows
    h.columns = columns
    h.pitchX = h.pitchY = v.generation === 'GEN1 / 400 µm' ? 0.4 : 0.5
    h.selectedShank = Math.min(h.selectedShank, count - 1)
    if (h.shankLengths.length !== count) h.shankLengths = []
    e.length = Number(v.length)
    e.contactCount = sites
    e.contactSpacing = Number(v.spacing) / 1000
    e.contactLength = 0.025
    h.tipOffset = 0
    h.recordingChannels = count * sites
    lengthPattern(e, v)
    const backs = Array.from({ length: sites }, (_, i) =>
      i === 0 ? 0 : Number(v.firstGap) / 1000 + (i - 1) * e.contactSpacing,
    )
    for (let i = 0; i < count; i++) {
      const length = h.shankLengths[i] ?? e.length
      if (
        (length > 4 && Math.max(...backs) > 3) ||
        (length >= 3.625 && length <= 3.875 && Math.max(...backs) > 2.5)
      )
        throw new Error('N-Form site locations exceed the published proximal limit for this shank length.')
    }
    h.sitePositions = backs.map((back) => [0, h.thickness / 2, back])
  } else if (key === 'thumbtack') {
    h.shape = 'round'
    h.rows = h.columns = 1
    h.selectedShank = 0
    e.length = 3
    h.reservedLength = 0
    e.diameter = Number(v.diameter) / 1000
    h.width = h.thickness = e.diameter
    e.contactCount = Number(v.channels)
    h.recordingChannels = e.contactCount
    e.contactLength = Number(v.siteSize) / 1000
    e.contactSpacing = Number(v.spacing) / 1000
    h.tipOffset = 0.45
    delete h.sitePositions
  } else if (key === 'lma') {
    const count = Number(v.shafts)
    if (!Number.isInteger(count) || !Number.isInteger(Number(v.sites)))
      throw new Error('Shank and site counts must be integers.')
    h.rows = 1
    h.columns = count
    h.pitchX = Number(v.pitch) / 1000
    h.selectedShank = Math.min(h.selectedShank, count - 1)
    h.shankLengths = []
    e.length = Number(v.length)
    e.contactCount = Number(v.sites)
    e.contactSpacing = Number(v.spacing) / 1000
    e.contactLength = Number(v.siteSize) / 1000
    h.recordingChannels = count * e.contactCount
    if (Object.keys(patch).some((k) => ['sites', 'spacing', 'siteSize'].includes(k))) delete h.sitePositions
  } else if (key === 'fma' || key === 'mea' || key === 'utah') {
    if (key === 'fma') {
      h.rows = v.shafts === '18 / 16' ? 3 : 6
      h.columns = 6
      h.pitchX = h.pitchY = Number(v.pitch) / 1000
      h.recordingChannels = v.shafts === '18 / 16' ? 16 : 32
    } else if (key === 'mea') {
      const rows = Number(v.rows),
        columns = Number(v.columns)
      if (!Number.isInteger(rows) || !Number.isInteger(columns) || rows * columns < 4 || rows * columns > 64)
        throw new Error('MEA requires 4–64 physical electrodes in the rectangular layout.')
      h.rows = rows
      h.columns = columns
      h.pitchX = Number(v.pitchX) / 1000
      h.pitchY = Number(v.pitchY) / 1000
      h.recordingChannels = rows * columns
      e.contactLength = Number(v.tipSize) / 1000
      h.tipOffset = e.contactLength / 2
    } else {
      h.rows = h.columns = Number(String(v.layout).split(' ')[0])
      h.pitchX = h.pitchY = 0.4
      // Only the standard 10x10 template has an assumed wired-channel count.
      h.recordingChannels = Math.min(h.recordingChannels, h.rows * h.columns)
    }
    h.selectedShank = Math.min(h.selectedShank, h.rows * h.columns - 1)
    if (h.shankLengths.length !== h.rows * h.columns) h.shankLengths = []
    e.length = Number(v.length)
    h.reservedLength = 0
    lengthPattern(e, v)
  }
  h.configuration = v
  h.modified = true
  e.depth = Math.max(minimumInsertion(e), Math.min(e.depth, maximumInsertion(e)))
}
export function initializeConfiguration(e: Electrode): void {
  if (!familyKey(e.hardware?.presetId ?? '')) return
  configureHardware(e, {})
  const family = families[familyKey(e.hardware!.presetId)!]
  e.hardware!.notes += '\n' + family.limitations
  if (!e.hardware!.sources.includes(family.source)) e.hardware!.sources.push(family.source)
  e.hardware!.modified = false
}

/** Use the same rules for offered choices and committed geometry. No invalid options are advertised. */
export function availableChoices(e: Electrode, option: HardwareOption): Array<string | number> {
  return (option.choices ?? []).filter((value) => {
    try {
      configureHardware(structuredClone(e), { [option.key]: value })
      return true
    } catch {
      return false
    }
  })
}

/** Preserve all other physical lengths when one electrode is customized. */
export function setIndividualLength(e: Electrode, index: number, length: number): void {
  const h = e.hardware!
  const key = familyKey(h.presetId)
  const option = key ? families[key].options.find((o) => o.key === 'length') : undefined
  const min = option?.min ?? 0.5
  const max = option?.max ?? (key === 'utah' ? 1.5 : MAX_ELECTRODE_LENGTH_MM)
  if (!Number.isFinite(length) || length < min || length > max)
    throw new Error(`Electrode / shank lengths must be between ${min} and ${max} mm for this family.`)
  const offsets = shankOffsets(e)
  if (!Number.isInteger(index) || index < 0 || index >= offsets.length)
    throw new Error('Select an existing electrode or shank.')
  if (!h.shankLengths.length) h.shankLengths = offsets.map((_, i) => shankLength(e, i))
  h.shankLengths[index] = length
  h.configuration = { ...h.configuration, lengthProfile: 'Individual lengths' }
  h.modified = true
}

/** A common-length edit explicitly resets a customized array to a uniform configuration. */
export function setUniformLength(e: Electrode, length: number): void {
  const key = familyKey(e.hardware?.presetId ?? '')
  const option = key ? families[key].options.find((o) => o.key === 'length') : undefined
  const min = option?.min ?? 0.5
  const max = option?.max ?? (key === 'utah' ? 1.5 : MAX_ELECTRODE_LENGTH_MM)
  if (!Number.isFinite(length) || length < min || length > max)
    throw new Error(`Electrode / shank lengths must be between ${min} and ${max} mm for this family.`)
  e.length = length
  if (e.hardware) {
    e.hardware.shankLengths = []
    e.hardware.configuration = { ...e.hardware.configuration, lengthProfile: 'Uniform' }
    if (key && families[key].options.some((o) => o.key === 'lengthProfile'))
      e.hardware.configuration.length = length
    e.hardware.modified = true
  }
}

/** Upgrade legacy family names without replacing physical dimensions or customized sites. */
export function normalizeLegacyPreset(e: Electrode): void {
  const hw = e.hardware
  if (!hw || !['plexon-u16', 'plexon-u32'].includes(hw.presetId)) return
  const confirmed = hw.configuration?.setupConfirmed === hw.presetId
  const values = optionValues(e)
  hw.presetId = 'plexon-u'
  hw.model = 'Plexon U-Probe'
  hw.configuration = values
  if (confirmed) hw.configuration.setupConfirmed = 'plexon-u'
  else delete hw.configuration.setupConfirmed
}


/** Install the hardware draft atomically; incompatible hardware no longer uses its old guide hole. */
export function installConfiguredElectrode(project:Project,original:Electrode,configured:Electrode):void{
 const i=project.electrodes.findIndex(e=>e.id===original.id)
 if(i<0||JSON.stringify(project.electrodes[i])!==JSON.stringify(original))throw new Error('The electrode changed while the configurator was open. Reopen it to edit the current electrode.')
 const next=structuredClone(configured)
 project.electrodes[i]=next
 if(gridCompatibility(next).available)return
 next.hole=[0,0]
 const grid=project.grids.find(g=>g.id===next.gridId)
 if(grid&&!project.electrodes.some(e=>e.gridId===grid.id&&gridCompatibility(e).available)){
  grid.enabled=false
  for(const e of project.electrodes)if(e.gridId===grid.id)e.hole=[0,0]
 }
}
