import { MAX_ELECTRODE_LENGTH_MM } from '@brainana/planning-core/model.ts'
import type { Electrode } from '@brainana/planning-core/model.ts'
import { minimumInsertion, maximumInsertion } from '../../../../packages/planning-core/hardware.ts'
import { families, familyKey, optionValues, configureHardware, type HardwareOption } from './configuration.ts'

// Only geometry prerequisites belong here. Connector and acquisition metadata never gate a preview.
const prerequisites: Record<string, string[]> = {
  plexon: ['channels', 'layout', 'spacing', 'totalLength', 'reinforcement'],
  nform: ['rows', 'columns', 'generation', 'lengthProfile', 'length'],
  thumbtack: ['channels'],
  lma: ['shafts', 'length'],
  fma: ['shafts', 'pitch', 'lengthProfile', 'length'],
  mea: ['rows', 'columns', 'lengthProfile', 'length'],
  utah: ['layout', 'lengthProfile', 'length'],
}
export function setupOptions(e: Electrode): HardwareOption[] {
  const id = e.hardware!.presetId,
    key = familyKey(id)
  if (key) return (prerequisites[key] ?? []).map((name) => families[key].options.find((o) => o.key === name)!)
  const numeric = (key: string, label: string, value: number, min: number, max: number): HardwareOption => ({
    key,
    label,
    default: value,
    min,
    max,
    effect: 'geometry',
  })
  return [
    ...(id === 'custom-array'
      ? [
          numeric('rows', 'Array rows', e.hardware!.rows, 1, 16),
          numeric('columns', 'Electrodes per row', e.hardware!.columns, 1, 16),
          numeric('pitchX', 'Electrode spacing (mm)', e.hardware!.pitchX, 0.01, 20),
          numeric('pitchY', 'Row spacing (mm)', e.hardware!.pitchY, 0.01, 20),
        ]
      : []),
    numeric('length', 'Usable shaft length (mm)', e.length ?? 150, 0.5, MAX_ELECTRODE_LENGTH_MM),
    numeric('diameter', 'Shaft diameter (µm)', e.diameter * 1000, 1, 10000),
    ...(id === 'custom-tungsten'
      ? []
      : [
          numeric('sites', 'Recording contacts per shaft', e.contactCount, 1, 8192),
          numeric('siteSpacing', 'Contact spacing (µm)', e.contactSpacing * 1000, 1, 10000),
        ]),
    numeric('siteSize', 'Contact size / exposed tip length (µm)', e.contactLength * 1000, 1, 10000),
    numeric('tipOffset', 'Tip to first contact centre (µm)', e.hardware!.tipOffset * 1000, 0, 10000),
  ]
}
export function setupReady(e: Electrode): boolean {
  return !setupOptions(e).length || e.hardware!.configuration?.setupConfirmed === e.hardware!.presetId
}
export function setupValues(e: Electrode): Record<string, string | number> {
  return { ...Object.fromEntries(setupOptions(e).map((o) => [o.key, o.default])), ...optionValues(e) }
}
export function confirmSetup(e: Electrode, values: Record<string, string | number>): void {
  const options = setupOptions(e)
  for (const o of options) {
    const value = values[o.key]
    if (value === undefined || value === '' || (o.choices && !o.choices.includes(value)))
      throw new Error(`Choose ${o.label} before configuring the device.`)
    if (!o.choices && (!Number.isFinite(Number(value)) || Number(value) < o.min! || Number(value) > o.max!))
      throw new Error(`${o.label} must be between ${o.min} and ${o.max}.`)
  }
  if (familyKey(e.hardware!.presetId)) configureHardware(e, values)
  else {
    const hw = e.hardware!
    for (const key of ['rows', 'columns', 'pitchX', 'pitchY'] as const)
      if (values[key] !== undefined) hw[key] = Number(values[key])
    e.length = Number(values.length)
    e.diameter = Number(values.diameter) / 1000
    e.contactCount = hw.presetId === 'custom-tungsten' ? 1 : Number(values.sites)
    e.contactSpacing = Number(values.siteSpacing ?? e.contactSpacing * 1000) / 1000
    e.contactLength = Number(values.siteSize) / 1000
    hw.tipOffset = Number(values.tipOffset) / 1000
    hw.shankLengths = []
    hw.selectedShank = 0
  }
  e.hardware!.configuration = {
    ...e.hardware!.configuration,
    setupConfirmed: e.hardware!.presetId,
    ...(e.hardware!.presetId === 'micro-fma' ? { variantConfirmed: values.shafts } : {}),
  }
  const min = minimumInsertion(e),
    max = maximumInsertion(e)
  if (min > max)
    throw new Error(
      'The site layout does not fit these shaft lengths. Increase length or reduce site count / spacing.',
    )
  e.depth = Math.max(min, Math.min(e.depth, max))
}
