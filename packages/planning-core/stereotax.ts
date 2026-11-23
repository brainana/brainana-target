const railDimensions = { widthMm: 18.7, lengthMm: 305, spacingMm: 177.8, posteriorMm: 120.8 } as const

const smallUFrame = { widthMm: 18.7, lengthMm: 254, spacingMm: 100, posteriorMm: 127, earBarWidthMm: 6.3 } as const
const narishigeSource = 'https://products.narishige-group.com/group1/SR-6C-HT/stereotaxic/english.html'
export const stereotaxPresets = {
  'kopf-900': {
    name: 'Kopf 900 · U-frame', ...smallUFrame,
    source: 'https://kopfinstruments.com/product/model-900-small-animal-stereotaxic-instrument1/',
  },
  'kopf-940': {
    name: 'Kopf 940 · digital', ...smallUFrame,
    source: 'https://kopfinstruments.com/product/model-940-small-animal-stereotaxic-instrument-with-digital-display-console/',
  },
  'kopf-900ls': { name: 'Kopf 900LS · rotating base', ...smallUFrame, source: 'https://kopfinstruments.com/product/model-900ls-small-animal-stereotaxic-instrument/' },
  'kopf-902': { name: 'Kopf 902 · dual manipulator', ...smallUFrame, source: 'https://kopfinstruments.com/product/model-902-dual-small-animal-stereotaxic-instrument/' },
  'kopf-942': { name: 'Kopf 942 · dual digital', ...smallUFrame, source: 'https://kopfinstruments.com/product/model-942-small-animal-stereotaxic-instrument-with-digital-display-console/' },
  'kopf-962': { name: 'Kopf 962 · dual ultra precise', ...smallUFrame, source: 'https://kopfinstruments.com/product/model-962-dual-ultra-precise-small-animal-stereotaxic-instrument/' },
  'narishige-sr5rht': { name: 'Narishige SR-5R-HT · rat', ...smallUFrame, source: 'https://products.narishige-group.com/group1/SR-5R-HT/stereotaxic/english.html' },
  'narishige-sr5mht': { name: 'Narishige SR-5M-HT · mouse', ...smallUFrame, source: 'https://products.narishige-group.com/group1/SR-5M-HT_SR-5M1-HT/stereotaxic/english.html' },
  'narishige-sr6cht': {
    name: 'Narishige SR-6C-HT · common marmoset', ...smallUFrame, source: narishigeSource,
  },
  'kopf-1430': {
    name: 'Kopf 1430 / 1404',
    source: 'https://kopfinstruments.com/product/model-1430-stereotaxic-frame/',
    earBarWidthMm: 6.3,
    ...railDimensions,
  },
  'kopf-1430m': {
    name: 'Kopf 1430M MRI',
    source: 'https://kopfinstruments.com/product/model-1430m-mri-stereotaxic-instrument/',
    earBarWidthMm: 12.7,
    ...railDimensions,
  },
  'kopf-1530': {
    name: 'Kopf 1530', source: 'https://kopfinstruments.com/product/model-1530-stereotaxic-frame/',
    earBarWidthMm: 6.3, ...railDimensions, lengthMm: 374.7,
  },
  'kopf-1730': {
    name: 'Kopf 1730', source: 'https://kopfinstruments.com/product/model-1730-intracellular-frame-assembly/',
    earBarWidthMm: 9.4, ...railDimensions, widthMm: 21.65,
  },
  'kopf-1530m': {
    name: 'Kopf 1530M MRI', source: 'https://kopfinstruments.com/product/model-1530m-mri-stereotaxic-instrument/',
    earBarWidthMm: 12.7, ...railDimensions, lengthMm: 374.7,
  },
  'kopf-930': {
    name: 'Kopf 930 · single rail', source: 'https://kopfinstruments.com/product/model-930-small-animal-stereotaxic-frame-assembly/',
    earBarWidthMm: 6.3, widthMm: 18.7, lengthMm: 254, posteriorMm: 127, spacingMm: 80,
  },
  'kopf-900m': {
    name: 'Kopf 900M MRI · single rail', source: 'https://kopfinstruments.com/product/model-900m-small-animal-mri-stereotaxic-instrument/',
    earBarWidthMm: 6.3, widthMm: 18.7, lengthMm: 254, posteriorMm: 127, spacingMm: 80,
  },
} as const

const railDimensionsWithBars = { ...railDimensions, earBarWidthMm: 6.3 }

export const kopfArmSource = 'https://kopfinstruments.com/product/electrode-manipulators-models-1460-1460-61/'
export type StereotaxPreset = keyof typeof stereotaxPresets

export function singleRail(preset: StereotaxPreset | 'custom'): boolean {
  return preset === 'kopf-930' || preset === 'kopf-900m' || preset === 'narishige-sr5rht' || preset === 'narishige-sr5mht'
}
export const singleRailFields = [
  ['Ear-bar support span (mm)', 'earSupportSpanMm', 5, 500],
  ['Rail left/right of center (mm)', 'railLateralMm', -250, 250],
] as const

export const customFrameFields = [
  ['Rail length (mm)', 'lengthMm', 10, 1000],
  ['Rail center spacing (mm)', 'spacingMm', 5, 500],
  ['Rail width (mm)', 'widthMm', 1, 100],
  ['Rail length behind ear bars (mm)', 'posteriorMm', 0, 1000],
  ['Ear-bar width (mm)', 'earBarWidthMm', 0.5, 50],
] as const

export type FrameDimensions = Record<typeof customFrameFields[number][1], number>
export const measuredFrameSpecs = {
  'kopf-900': 'Published: 353.1 × 254 mm base plate, ear-bar axis 53 mm above plate, Model 960 manipulator.',
  'kopf-940': 'Published: 353.06 × 254 mm base plate, 53 mm ear axis, 80 mm XYZ travel and 10 µm readout.',
  'kopf-900ls': 'Published: rotating 353.06 × 254 mm base plate, 53 mm ear axis and Model 960.',
  'kopf-902': 'Published: 353.06 × 254 mm base plate, 53 mm ear axis and two Model 960 manipulators.',
  'kopf-942': 'Published: 353.06 × 254 mm base plate, 53 mm ear axis and two digital manipulators.',
  'kopf-962': 'Published: 353.06 × 254 mm base plate, 53 mm ear axis and two Model 961 manipulators.',
  'narishige-sr5rht': 'Published: 400 × 300 × 110 mm base assembly, one 18.7 mm AP rail and EB-3A rat ear bars.',
  'narishige-sr5mht': 'Published: 400 × 300 × 110 mm base assembly, one 18.7 mm AP rail and EB-3B mouse ear bars.',
  'narishige-sr6cht': 'Published: 400 × 300 × 110 mm base assembly, 18.7 mm square rail, EB-3A ear bars and a dedicated auxiliary ear bar.',
} as const
export function editableFrame(preset: StereotaxPreset | 'custom'): boolean {
  return preset === 'custom' || Object.hasOwn(measuredFrameSpecs, preset)
}
export function frameDimensions(rig: { preset: StereotaxPreset | 'custom'; dimensions?: FrameDimensions }): FrameDimensions {
  if (rig.dimensions && editableFrame(rig.preset)) return rig.dimensions
  return rig.preset === 'custom' ? railDimensionsWithBars : stereotaxPresets[rig.preset]
}


export const earBarSource = 'https://kopfinstruments.com/product/ear-bars/'
const profiles = [
  { suffix: '21', name: 'Zygoma cup', cup: true },
  { suffix: '22', name: '60° blunt taper', taper: 60 },
  { suffix: '51', name: '20° taper, 1.5 mm tip radius', taper: 20, radius: 1.5 },
  { suffix: '52', name: '20° taper with shoulder and pin', taper: 20, shoulder: 4.8, pin: 3, pinLength: 2 },
  { suffix: '53', name: 'Auditory opening, 5.1 mm', aperture: 5.1 },
  { suffix: '55', name: '45° taper, 0.8 mm tip radius', taper: 45, radius: .8 },
  { suffix: '56', name: 'Pigeon shoulder and pin', taper: 20, shoulder: 4.8, pin: 3, pinLength: 2 },
  { suffix: '57', name: '18° taper, 0.8 mm tip radius', taper: 18, radius: .8 },
]
export interface EarBar {
  id: string; name: string; family: string; width: number; scale: number
  taper?: number; radius?: number; cup?: boolean; shoulder?: number; pin?: number; pinLength?: number; aperture?: number
  source?: string; length?: number
}
export const earBars: EarBar[] = [
  ...[
    { family: '8', width: 6.3, scale: 50 },
    { family: '9', width: 6.3, scale: 35 },
    { family: '17', width: 9.4, scale: 50 },
    { family: '19', width: 4.75, scale: 15 },
  ].flatMap(family => profiles
    .filter(profile => family.family !== '19' || ['21', '22', '55', '57'].includes(profile.suffix))
    .map(({suffix, name, ...profile}) => ({
      ...family, ...profile, id: family.family + suffix, name: family.family + suffix + ' · ' + name,
    }))),
  { id: 'EB-3B', name: 'EB-3B · mouse', family: 'narishige', width: 6.3, scale: 0, length: 70, source: 'https://products.narishige-group.com/group1/EB-3B/stereotaxic/english.html' },
  { id: 'EB-3A', name: 'EB-3A · rat / marmoset', family: 'narishige', width: 6.3, scale: 0, length: 70, taper: 30,
    source: 'https://products.narishige-group.com/group1/EB-3A/stereotaxic/english.html' },
  { id: '851M', name: '851M · MRI fluid-marker tip', family: 'large-mri', width: 12.7, scale: 50, taper: 20, source: stereotaxPresets['kopf-1430m'].source },
  { id: '922M', name: '922M · MRI mouse blunt taper', family: 'small-mri', width: 6.3, scale: 20, taper: 60, source: 'https://kopfinstruments.com/product/model-923m-mri-mouse-gas-anesthesia-adaptor/' },
  { id: '955M', name: '955M · MRI rat ear bars, 45°', family: 'small-mri', width: 6.3, scale: 20, taper: 45, source: 'https://kopfinstruments.com/product/model-900m-small-animal-mri-stereotaxic-instrument/' },
]
export function compatibleEarBars(preset: StereotaxPreset | 'custom'): EarBar[] {
  if (preset === 'custom') return earBars
  const families: Record<StereotaxPreset, string> = {
    'kopf-900ls':'9', 'kopf-902':'9', 'kopf-942':'9', 'kopf-962':'9', 'narishige-sr5rht':'narishige', 'narishige-sr5mht':'narishige',
    'kopf-900': '9', 'kopf-940': '9', 'narishige-sr6cht': 'narishige',
    'kopf-1430': '8', 'kopf-1530': '8', 'kopf-1730': '17', 'kopf-930': '9',
    'kopf-1430m': 'large-mri', 'kopf-1530m': 'large-mri', 'kopf-900m': 'small-mri',
  }
  const family = families[preset]
  return earBars.filter(bar => bar.family === family)
}
export const defaultEarBar: Record<StereotaxPreset, string> = {
  'kopf-900ls':'957', 'kopf-902':'957', 'kopf-942':'957', 'kopf-962':'957', 'narishige-sr5rht':'EB-3A', 'narishige-sr5mht':'EB-3B',
  'kopf-900': '957', 'kopf-940': '957', 'narishige-sr6cht': 'EB-3A',
  'kopf-1430': '851', 'kopf-1430m': '851M', 'kopf-1530': '851', 'kopf-1730': '1751',
  'kopf-1530m': '851M', 'kopf-930': '957', 'kopf-900m': '955M',
}
export const frameOffsetOptions = [
  { id: '865', name: '865 · Raised ear bars, 35 mm', rise: 35, frames: ['kopf-1430'], source: 'https://kopfinstruments.com/product/model-865-35-mm-offset-ear-bars-riser-block/' },
  { id: '866', name: '866 · Raised ear bars and inverted palate clamp, 35 mm', rise: 35, frames: ['kopf-1430'], source: 'https://kopfinstruments.com/product/model-866-35-mm-offset-ear-bars-raised-eye-bars-and-inverted-palate-clamp/' },
  { id: '1430M-H', name: '1430M-H · Raised MRI ear bars, 45 mm', rise: 45, frames: ['kopf-1430m'], source: stereotaxPresets['kopf-1430m'].source },
]
interface BiteAdaptor {
  id: string; name: string; kind: 'palate' | 'tooth' | 'molar' | 'inverted'; travel: string; source: string; frames: string[]
}
export const biteAdaptors: BiteAdaptor[] = [
  { id: '1245', name: '1245 · Cat/monkey palate clamp', kind: 'palate', travel: 'Palate up/down 45 mm, adaptor front/back 34.9 mm, eye bar front/back 20.5 mm', source: 'https://kopfinstruments.com/product/model-1245-cat-monkey-adaptor/', frames: ['kopf-1430'] },
  { id: '1245M', name: '1245M · MRI palate clamp', kind: 'palate', travel: 'Palate up/down 50.8 mm, adaptor front/back 57.1 mm, eye bar front/back 46 mm', source: stereotaxPresets['kopf-1430m'].source, frames: ['kopf-1430m'] },
  { id: '1248', name: '1248 · Squirrel monkey/marmoset palate clamp', kind: 'palate', travel: 'Palate up/down 45 mm, adaptor front/back 34.9 mm, eye bar front/back 20.5 mm', source: 'https://kopfinstruments.com/product/model-1248-squirrel-monkey-adaptor/', frames: ['kopf-1430'] },
  { id: '1745', name: '1745 · Cat/monkey palate clamp', kind: 'palate', travel: 'Palate up/down 45 mm, adaptor front/back 34.9 mm, eye bar front/back 20.5 mm', source: stereotaxPresets['kopf-1730'].source, frames: ['kopf-1730'] },
  { id: '1535', name: '1535 · Dog/monkey tooth bar', kind: 'tooth', travel: 'Tooth bar front/back 79.3 mm and up/down 36.8 mm, adaptor front/back 31.75 mm', source: 'https://kopfinstruments.com/product/model-1535-dog-monkey-adaptor/', frames: ['kopf-1530'] },
  { id: '1535M', name: '1535M · MRI dog/monkey tooth bar', kind: 'tooth', travel: 'Tooth bar front/back 79.3 mm and up/down 36.8 mm, adaptor front/back 31.75 mm', source: stereotaxPresets['kopf-1530m'].source, frames: ['kopf-1530m'] },
  { id: '866', name: '866 · Inverted palate clamp', kind: 'inverted', travel: '', source: frameOffsetOptions[1].source, frames: ['kopf-1430'] },
  { id: '920', name: '920 · Rat tooth bar', kind: 'tooth', travel: 'Tooth bar up/down 30 mm (+10 to −20 mm), adaptor front/back 44 mm', source: 'https://kopfinstruments.com/product/model-920-rat-adaptor/', frames: ['kopf-930', 'kopf-900', 'kopf-940'] },
  { id: '920M', name: '920M · MRI rat tooth bar', kind: 'tooth', travel: 'Tooth bar up/down 20 mm, adaptor front/back 46 mm', source: stereotaxPresets['kopf-900m'].source, frames: ['kopf-900m'] },
  { id: '926', name: '926 / 1226 / 1726 · Mouse tooth bar', kind: 'tooth', travel: 'Tooth bar up/down 30 mm (+10 to −20 mm), adaptor front/back 44 mm', source: 'https://kopfinstruments.com/product/model-926-mouse-adaptor/', frames: ['kopf-1430', 'kopf-1730', 'kopf-930', 'kopf-900', 'kopf-940'] },
  { id: '923-B', name: '923-B · Mouse anesthesia adaptor', kind: 'molar', travel: '', source: 'https://kopfinstruments.com/product/model-923-b-mouse-gas-anesthesia-head-holder/', frames: ['kopf-1430', 'kopf-1730', 'kopf-930', 'kopf-900', 'kopf-940'] },
  { id: '923M', name: '923M · MRI mouse tooth bar', kind: 'tooth', travel: 'Tooth bar up/down 20 mm, adaptor front/back 46 mm', source: 'https://kopfinstruments.com/product/model-923m-mri-mouse-gas-anesthesia-adaptor/', frames: ['kopf-900m'] },
  { id: '1923-B', name: '1923-B · Mouse molar bars', kind: 'molar', travel: '', source: 'https://kopfinstruments.com/product/model-1923-b-mouse-gas-anesthesia-head-holder/', frames: [] },
  { id: '1929-B', name: '1929-B · Rat tooth bar', kind: 'tooth', travel: '', source: 'https://kopfinstruments.com/product/model-1929-b-rat-gas-anesthesia-head-holder/', frames: [] },
  { id:'CA-6', name:'CA-6 · marmoset upper-jaw support', kind:'tooth', travel:'', source:'https://products.narishige-group.com/group1/SR-5R-HT/stereotaxic/english.html', frames:['narishige-sr5rht','narishige-sr5mht','narishige-sr6cht'] },
  { id:'RA-6N', name:'Narishige RA-6N · rat mouth/nose clamp', kind:'tooth', travel:'', source:'https://products.narishige-group.com/group1/SR-5R-HT/stereotaxic/english.html', frames:['narishige-sr5rht','narishige-sr5mht','narishige-sr6cht'] },
  { id:'MA-6N', name:'Narishige MA-6N · mouse mouth/nose clamp', kind:'tooth', travel:'', source:'https://products.narishige-group.com/group1/SR-5M-HT_SR-5M1-HT/stereotaxic/english.html', frames:['narishige-sr5rht','narishige-sr5mht'] },
  { id: 'SR-6C-HT-jaw', name: 'SR-6C-HT · upper-jaw support', kind: 'tooth', travel: '', source: narishigeSource, frames: ['narishige-sr6cht'] },
  { id: 'custom', name: 'Custom bite bar', kind: 'tooth', travel: '', source: '', frames: [] },
]
export function compatibleBiteAdaptors(preset: StereotaxPreset | 'custom'): BiteAdaptor[] {
  if (['kopf-900ls','kopf-902','kopf-942','kopf-962'].includes(preset)) preset='kopf-900'
  return biteAdaptors.filter(adaptor => preset === 'custom' || adaptor.id === 'custom' || adaptor.frames.includes(preset))
}
export const biteBarFields = [
  ['Contact left/right (mm)', 'lateralMm', -500, 500],
  ['Contact front/back (mm)', 'apMm', -500, 500],
  ['Contact up/down (mm)', 'heightMm', -200, 200],
  ['Bar length forward from contact (mm)', 'lengthMm', .1, 500],
  ['Bar width (mm)', 'widthMm', .1, 100],
  ['Bar thickness (mm)', 'thicknessMm', .1, 50],
] as const
export type BiteBar = { adaptorId: string; apOffsetMm?: number } & Record<typeof biteBarFields[number][1], number>

const kopfMicroSource = 'https://kopfinstruments.com/product/micro-manipulators-models-1760-1760-61/'
export const manipulatorPresets = {
  'kopf-960': { name: 'Kopf 960', source: stereotaxPresets['kopf-900'].source,
    travel: '80 mm on X, Y and Z · 0.1 mm vernier · up to 90° tilt · 360° swivel' },
  'kopf-961': { name: 'Kopf 961 · ultra precise', source: stereotaxPresets['kopf-962'].source, travel: '80 mm XYZ travel · 10 µm dial · 1 mm per turn · ±90° tilt' },
  'kopf-940-digital': { name: 'Kopf 940 digital manipulator', source: stereotaxPresets['kopf-940'].source,
    travel: '10 µm digital readout' },
  'kopf-1460': { name: 'Kopf 1460', source: kopfArmSource,
    travel: '80 mm X/Z travel · ±100 mm manual A/P · 0.1 mm vernier' },
  'kopf-1460-61': { name: 'Kopf 1460-61', source: kopfArmSource,
    travel: '80 mm X/Z travel · ±100 mm manual A/P · 25 mm fine A/P, 10 µm increments' },
  'kopf-1760': { name: 'Kopf 1760 / 1760-SB', source: kopfMicroSource,
    travel: '80 mm X/Z travel, 10 µm increments · ±100 mm manual A/P' },
  'kopf-1760-61': { name: 'Kopf 1760-61 / 1760-61-SB', source: kopfMicroSource,
    travel: '80 mm X/Z and 25 mm fine A/P travel, 10 µm increments · ±100 mm manual A/P' },
  'narishige-sm15': { name: 'Narishige SM-15R/L', source: 'https://products.narishige-group.com/group2/SM-15R_L/group2/japanese.html',
    travel: '60 mm X and 50 mm Z coarse travel · 8 mm fine Z travel, 10 µm graduation', size: [120, 75, 180] },
  'narishige-smm100': { name: 'Narishige SMM-100', source: 'https://products.narishige-group.com/group1/SMM-100/stereotaxic/english.html',
    travel: '80 × 20 × 80 mm XYZ travel · 10 µm graduation · AP or ML tilt', size: [85, 162, 256] },
  'narishige-smm200': { name: 'Narishige SMM-200', source: 'https://products.narishige-group.com/group1/SMM-200/stereotaxic/english.html',
    travel: '80 × 20 × 80 mm XYZ travel · 10 µm graduation · simultaneous AP and ML tilt', size: [85, 162, 286] },
} satisfies Record<string, { name: string; source: string; travel: string; size?: number[] }>
export type ManipulatorPreset = keyof typeof manipulatorPresets
export const manipulatorDefaults: Partial<Record<StereotaxPreset, ManipulatorPreset>> = {
  'kopf-900ls':'kopf-960', 'kopf-902':'kopf-960', 'kopf-942':'kopf-940-digital', 'kopf-962':'kopf-961', 'kopf-930':'kopf-1460', 'kopf-900m':'kopf-1460', 'narishige-sr5rht':'narishige-sm15', 'narishige-sr5mht':'narishige-sm15',
  'kopf-900': 'kopf-960', 'kopf-940': 'kopf-940-digital', 'kopf-1430': 'kopf-1460',
  'kopf-1530': 'kopf-1460', 'kopf-1730': 'kopf-1760', 'narishige-sr6cht': 'narishige-sm15',
}
