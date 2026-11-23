import { MAX_ELECTRODE_LENGTH_MM } from '@brainana/planning-core/model.ts'
import { revealField, followupField } from '../ui/revealField.ts'
import { hoverHelp } from '../ui/hoverHelp.ts'
import { h } from '@brainana/ui/dom.ts'
import type { Electrode, Vec3 } from '@brainana/planning-core/model.ts'
import {
  shankLength,
  shankOffsets,
  minimumInsertion,
  maximumInsertion,
} from '@brainana/planning-core/hardware.ts'
import type { FeatureContext } from '../features/contracts.ts'
import { section, readout, note, selectField, numberField, button } from '../ui/controls.ts'
import { details } from './disclosure.ts'
import {
  families,
  familyKey,
  optionValues,
  configureHardware,
  availableChoices,
  setIndividualLength,
} from './configuration.ts'
export function manufacturerOptions(ctx: FeatureContext, e: Electrode): HTMLElement {
  const family = families[familyKey(e.hardware!.presetId) ?? ''],
    v = optionValues(e),
    member = e.hardware!.shape === 'blade' ? 'Shank' : 'Electrode',
    lengthOption = family?.options.find((o) => o.key === 'length'),
    individualMin = lengthOption?.min ?? 0.5,
    individualMax = lengthOption?.max ?? (familyKey(e.hardware!.presetId) === 'utah' ? 1.5 : MAX_ELECTRODE_LENGTH_MM)
  const update = (patch: Record<string, string | number>, root: ParentNode): void => {
    ctx.edit((p) =>
      configureHardware(
        p.electrodes.find((x) => x.id === e.id)!,
        patch,
      ),
    )
    ctx.refresh()
    const current = ctx.store.project?.electrodes.find((x) => x.id === e.id)
    if (!current || Object.entries(patch).some(([key, value]) => optionValues(current)[key] !== value)) return
    const profile = patch.lengthProfile
    if (profile === 'Individual lengths') revealField(root, 'individual-lengths')
    else if (profile && profile !== 'Uniform') revealField(root, 'shortLength')
    else if (patch.rigidTube && patch.rigidTube !== 'None') revealField(root, 'tubeLength')
    else if (Number(patch.shafts) > 1) revealField(root, 'pitch')
  }
  const controls = (metadata: boolean): HTMLElement[] =>
    (family?.options ?? [])
      .filter((o) => (o.effect === 'metadata') === metadata)
      .filter((o) => familyKey(e.hardware!.presetId) !== 'fma' || o.key !== 'shafts')
      .filter(
        (o) =>
          o.key !== 'shortLength' ||
          (v.lengthProfile !== 'Uniform' && v.lengthProfile !== 'Individual lengths'),
      )
      .filter((o) => o.key !== 'length' || v.lengthProfile !== 'Individual lengths')
      .filter((o) => o.key !== 'pitch' || familyKey(e.hardware!.presetId) !== 'lma' || Number(v.shafts) > 1)
      .filter((o) => o.key !== 'pitchX' || Number(v.columns) > 1)
      .filter((o) => o.key !== 'pitchY' || Number(v.rows) > 1)
      .filter((o) => o.key !== 'tubeLength' || (v.rigidTube && v.rigidTube !== 'None'))
      .filter((o) => o.key !== 'cap' || e.hardware!.presetId.startsWith('np2'))
      .map((o) => {
        const choices = availableChoices(e, o)
        const generated =
          v.lengthProfile && v.lengthProfile !== 'Uniform' && v.lengthProfile !== 'Individual lengths'
        const label =
          o.key === 'lengthProfile'
            ? `${member} length configuration`
            : o.key === 'shortLength'
              ? `Shortest ${member.toLowerCase()} length (mm)`
              : o.key === 'length' && v.lengthProfile
                ? `${generated ? 'Longest' : 'Uniform'} ${member.toLowerCase()} length (mm)`
                : o.label
        const field = o.choices
          ? selectField(
              label,
              String(v[o.key]),
              choices.map((value) => ({ value: String(value), label: String(value) })),
              (value) =>
                update(
                  { [o.key]: typeof o.default === 'number' ? Number(value) : value },
                  field.closest('dialog') ?? document,
                ),
            )
          : numberField(
              label,
              Number(v[o.key]),
              (value) => update({ [o.key]: value }, field.closest('dialog') ?? document),
              {
                min: o.min,
                max: o.key === 'shortLength' ? Math.min(o.max ?? 150, Number(v.length)) : o.max,
                step: ['rows', 'columns', 'sites', 'shafts'].includes(o.key) ? 1 : undefined,
              },
            )
        field.dataset.followup = o.key
        hoverHelp(
          field,
          o.choices && choices.length < o.choices.length
            ? `Only choices compatible with the current device configuration are listed. ${o.key === 'optic' || o.key === 'fluid' ? 'Fluid capillaries and optic fibers share a total allowance determined by channel count and site arrangement. Reduce the other accessory count to make room.' : "The choices here depend on the channel count, contact arrangement, accessories and spacing you selected above."}`
            : o.effect === 'metadata'
              ? 'Saved device specification. This field does not change physical targeting geometry.'
              : 'Updates physical device dimensions and the live preview. Verify these against your actual ordered hardware.',
        )
        return field
      })
  const lengths = h('textarea', {
    ariaLabel: 'Individual shaft lengths (mm)',
    rows: 4,
    placeholder: 'One length per physical electrode; row-major order',
  })
  lengths.style.width = '100%'
  lengths.value = shankOffsets(e)
    .map((_, i) => shankLength(e, i).toFixed(3))
    .join(', ')
  const sites = h('textarea', {
    ariaLabel: 'Explicit site centres (mm)',
    rows: 5,
    placeholder: 'x, y, distance back from tip — one site per line',
  })
  sites.style.width = '100%'
  sites.value = e.hardware!.sitePositions?.map((p) => p.join(', ')).join('\n') ?? ''
  const editLayout = (fn: (electrode: Electrode) => void): void => {
    ctx.edit((p) => {
      const el = p.electrodes.find((x) => x.id === e.id)!
      fn(el)
      el.hardware!.modified = true
      el.depth = Math.max(minimumInsertion(el), Math.min(el.depth, maximumInsertion(el)))
    })
    ctx.refresh()
  }
  return section('Manufacturer configuration', [
    ...(family
      ? [
          readout('Product family', family.name),
          ...controls(false),
          note(
            family.options.some((o) => o.key === 'lengthProfile')
              ? "Uniform gives every electrode the same length. Slanted changes lengths gradually across columns; Staggered alternates short and long electrodes; Clustered groups them. Set the shortest and longest lengths for these layouts. You can then edit any individual length; the mode changes to Individual lengths and keeps the other values. Generated layouts are examples: check them against your ordered device."
              : 'Geometry options update the draft and live preview. Apply the configuration when finished.',
          ),
          details(ctx.store, 'manufacturer-order', [
            h('summary', {}, ['Connector, material and other order specifications']),
            ...controls(true),
            note(
              "These choices are saved for reference. They do not add connectors, cables or accessories to the 3D model or collision checks.",
            ),
          ]),
          note(family.limitations),
          h('a', { href: family.source, target: '_blank', rel: 'noopener noreferrer' }, [
            'Manufacturer configuration source',
          ]),
        ]
      : [note('User-defined hardware. Enter measured dimensions below.')]),
    ...(shankOffsets(e).length > 1
      ? [
          h('h3', {}, [`Individual ${member.toLowerCase()} lengths`]),
          note(
            family?.options.some((o) => o.key === 'lengthProfile')
              ? "Choose Uniform to set every electrode to the same length, then adjust individual lengths below if needed. Editing one switches to Individual lengths and leaves the others unchanged. Numbers match the top view. Enter shaft lengths, not cable lengths."
              : "Set a common shaft length first, then adjust individual numbered electrodes below. Changing one leaves the others unchanged. Numbers match the top view. Enter shaft lengths, not cable lengths.",
          ),
          followupField(
            h(
              'div',
              { class: 'needle-length-table' },
              shankOffsets(e).map((_, i) =>
                followupField(
                  numberField(
                    `${member} ${i + 1} · row ${Math.floor(i / e.hardware!.columns) + 1}, column ${(i % e.hardware!.columns) + 1} (mm)`,
                    shankLength(e, i),
                    (value) =>
                      editLayout((el) => {
                        const key = familyKey(el.hardware!.presetId)
                        const option = key ? families[key].options.find((o) => o.key === 'length') : undefined
                        const maximum = option?.max ?? (key === 'utah' ? 1.5 : MAX_ELECTRODE_LENGTH_MM)
                        if (value < (option?.min ?? 0.5) || value > maximum)
                          throw new Error(
                            `This family supports electrode / shank lengths up to ${maximum} mm. Verify the ordered device; cable length cannot increase reach.`,
                          )
                        setIndividualLength(el, i, value)
                      }),
                    { min: individualMin, max: individualMax },
                  ),
                  `individual-length-${i}`,
                ),
              ),
            ),
            'individual-lengths',
          ),
        ]
      : []),
    ...(e.hardware!.rows * e.hardware!.columns > 1
      ? [
          details(ctx.store, 'manufacturer-lengths', [
            h('summary', {}, [`Edit all individual ${member.toLowerCase()} lengths`]),
            note(
              "Enter one usable shaft length for every physical electrode, including reference electrodes. Numbers follow the top view from left to right, then row by row. The generated length layouts are starting examples; use this list to match your actual ordered device.",
            ),
            lengths,
            button('Apply individual lengths', () =>
              editLayout((el) => {
                const values = lengths.value
                  .trim()
                  .split(/[\s,;]+/)
                  .map(Number)
                if (values.length !== shankOffsets(el).length || values.some((x) => !Number.isFinite(x)))
                  throw new Error('Enter exactly one finite length for each physical electrode.')
                const key = familyKey(el.hardware!.presetId),
                  lengthOption = key ? families[key].options.find((o) => o.key === 'length') : undefined
                const min = lengthOption?.min ?? (key === 'utah' ? 0.5 : 0.5),
                  max = lengthOption?.max ?? (key === 'utah' ? 1.5 : MAX_ELECTRODE_LENGTH_MM)
                if (values.some((x) => x < min || x > max))
                  throw new Error(`Electrode lengths must be between ${min} and ${max} mm for this family.`)
                el.hardware!.shankLengths = values
                if (el.hardware!.configuration)
                  el.hardware!.configuration.lengthProfile = 'Individual lengths'
              }),
            ),
          ]),
        ]
      : []),
    details(ctx.store, 'manufacturer-sites', [
      h('summary', {}, ['Custom site map / variable spacing']),
      note(
        "Enter one recording-contact position per line, in millimetres from the shaft tip: X across the shaft, Y across the other direction, then distance along the shaft toward its base. The same list is used on every shaft. Use your device drawing for custom spacing or contacts on opposite sides. This replaces the evenly spaced contact layout in the preview and coordinate export.",
      ),
      sites,
      button('Apply explicit site map', () =>
        editLayout((el) => {
          const points = sites.value
            .trim()
            .split('\n')
            .filter((row) => row.trim())
            .map((row) =>
              row
                .trim()
                .split(/[\s,;]+/)
                .map(Number),
            )
          if (!points.length || points.some((p) => p.length !== 3 || p.some((x) => !Number.isFinite(x))))
            throw new Error('Enter three finite coordinates per site, one site per line.')
          el.contactCount = points.length
          el.hardware!.sitePositions = points as Vec3[]
        }),
      ),
      button('Return to regular site map', () =>
        editLayout((el) => {
          delete el.hardware!.sitePositions
        }),
      ),
    ]),
  ])
}
