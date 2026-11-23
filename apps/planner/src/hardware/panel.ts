import {followupField} from '../ui/revealField.ts'
import { designReferencePanel } from '../ui/designReferences.ts'
import { MAX_ELECTRODE_LENGTH_MM } from '@brainana/planning-core/model.ts'
import { guideTubePanel } from '../features/guideTube.ts'
import { h } from '@brainana/ui/dom.ts'
import type { Electrode } from '@brainana/planning-core/model.ts'
import {
  maximumInsertion,
  minimumInsertion,
  shankOffsets,
  shankLength,
  siteSpan,
} from '@brainana/planning-core/hardware.ts'
import { hardwareCatalog, applyHardwarePreset } from './catalog.ts'
import { setIndividualLength, setUniformLength } from './configuration.ts'
import { openHardwareConfiguration } from './configuration-dialog.ts'
import { manufacturerOptions } from './options-panel.ts'
import { details } from './disclosure.ts'
import { hardwareSchematic } from './schematic.ts'
import { section, selectField, button, note, readout, numberField } from '../ui/controls.ts'
import type { FeatureContext } from '../features/contracts.ts'
export function configureElectrode(ctx:FeatureContext,e:Electrode,focusField?:string):void {
 openHardwareConfiguration(ctx,e,undefined,(draft,device)=>hardwarePanel(draft,device,true),focusField)
}
export function hardwarePanel(ctx: FeatureContext, e: Electrode, configuring = false): HTMLElement {
  if (!configuring) {
    const open = (presetId?: string): void =>
      openHardwareConfiguration(ctx, e, presetId, (draft, device) => hardwarePanel(draft, device, true))
    return section('Hardware library', [
      selectField(
        'Hardware preset',
        (e.hardware?.presetId?.startsWith('plexon-u') ? 'plexon-u' : e.hardware?.presetId) ??
          '',
        [...(!e.hardware ? [{ value: '', label: 'Choose hardware family…' }] : []), ...hardwareCatalog.map((p) => ({ value: p.id, label: p.label }))],
        (id) => { if (id) open(id) },
      ),
      button('Configure electrode hardware', () => open(), 'primary'),
      designReferencePanel('electrodes'),
      readout('Current device', e.hardware?.model ?? 'Not defined — configure above'),
      ...(e.hardware ? [readout('Common usable shaft length', `${(e.length ?? 150).toFixed(2)} mm`),
      readout(
        'Selected targeting electrode / shank',
        `Electrode ${(e.hardware?.selectedShank ?? 0) + 1} · ${shankLength(e, e.hardware?.selectedShank ?? 0).toFixed(2)} mm usable`,
      ),
      readout(
        'Electrodes / physical sites',
        `${shankOffsets(e).length} / ${shankOffsets(e).length * e.contactCount}`,
      ),
      ] : []),
      note(
        "Choose a device family to open its configuration window. Apply saves all the dimensions together. Cancel keeps the electrode already in your project.",
      ),
    ])
  }
  const choice =
    (e.hardware?.presetId?.startsWith('plexon-u') ? 'plexon-u' : e.hardware?.presetId) ??
    hardwareCatalog[0].id
  const preset = hardwareCatalog.find((p) => p.id === choice) ?? hardwareCatalog[0]
  const hware = e.hardware
  const change = (fn: (el: Electrode) => void): void => {
    ctx.edit((d) => {
      const el = d.electrodes.find((x) => x.id === e.id)!
      fn(el)
      if (el.hardware) el.hardware.modified = true
      const min = minimumInsertion(el),
        max = maximumInsertion(el)
      if (min > max)
        throw new Error(
          "The recording contacts or differences between electrode lengths do not fit within the available shaft length. Reduce contact count or spacing, or increase the shorter electrode lengths to match your actual device.",
        )
      el.depth = Math.max(min, Math.min(el.depth, max))
    })
  }
  const pieces: HTMLElement[] = [
    section('Hardware library', [
      selectField(
        'Hardware preset',
        preset.id,
        hardwareCatalog.map((p) => ({ value: p.id, label: p.label })),
        (id) => {
          const selected = hardwareCatalog.find((p) => p.id === id)!
          ctx.edit((d) => {
            const el = d.electrodes.find((x) => x.id === e.id)!
            const target = el.targetId
            applyHardwarePreset(el, selected)
            el.targetId = target
          })
          ctx.refresh()
        },
      ),
      readout('Current device', e.hardware?.model ?? 'Generic / legacy electrode'),
      readout('Current usable length', `${(e.length ?? 150).toFixed(2)} mm`),
      readout(
        'Physical shaft length',
        `${((e.length ?? 150) + (e.hardware?.reservedLength ?? 0)).toFixed(2)} mm`,
      ),
      readout(
        'Draft cross-section',
        e.hardware?.shape === 'blade'
          ? `${e.hardware.width * 1000} × ${e.hardware.thickness * 1000} µm`
          : `Ø ${e.diameter * 1000} µm`,
      ),
      readout(
        'Draft electrodes / sites',
        `${(e.hardware?.rows ?? 1) * (e.hardware?.columns ?? 1)} / ${(e.hardware?.rows ?? 1) * (e.hardware?.columns ?? 1) * e.contactCount}`,
      ),
      readout(
        'Draft site pitch / size',
        e.hardware?.sitePositions
          ? `Explicit site map / ${e.contactLength * 1000} µm`
          : `${e.contactSpacing * 1000} / ${e.contactLength * 1000} µm`,
      ),
      readout(
        'Draft tip to first site',
        `${(e.hardware?.sitePositions ? Math.min(...e.hardware.sitePositions.map((p) => p[2])) : (e.hardware?.tipOffset ?? e.contactLength / 2)) * 1000} µm`,
      ),
      readout('Draft site extent from tip', `${siteSpan(e).toFixed(3)} mm`),
      note(
        "The dimensions above describe the current draft. Changes update the preview. Choose Apply to save them in your project. Any example values that need confirmation are identified in the specifications.",
      ),
      details(ctx.store, 'preset', [
        h('summary', {}, ['Published specifications and template assumptions']),
        note(preset.facts),
        note(preset.assumptions),
        ...preset.sources.map((url, i) =>
          h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, [`Source ${i + 1}`]),
        ),
      ]),
      button(
        'Reset to preset dimensions',
        () =>
          ctx.edit((d) =>
            applyHardwarePreset(
              d.electrodes.find((x) => x.id === e.id)!,
              preset,
            ),
          ),
        'primary',
      ),
      note(
        "Choosing another preset replaces your unsaved dimensions. Check the exact device version and layout before applying it. Undo restores the previously applied device. Reset returns to the selected preset’s starting values. Editable values describe your planned hardware; they do not mean the manufacturer sells every possible combination.",
      ),
    ]),
  ]
  if (!hware) return h('div', {}, pieces)
  if (preset.id.startsWith('custom-'))
    pieces.push(
      section('Measured shaft and site dimensions', [
        followupField(numberField(
          'Common usable shaft length (mm)',
          e.length ?? 150,
          (value) =>
            change((el) => {
              setUniformLength(el, value)
            }),
          { min: 0.5, max: MAX_ELECTRODE_LENGTH_MM },
        ),'length'),
        numberField(
          'Shaft diameter (µm)',
          e.diameter * 1000,
          (value) =>
            change((el) => {
              el.diameter = value / 1000
            }),
          { min: 1, max: 10000 },
        ),
        numberField(
          'Sites per shaft',
          e.contactCount,
          (value) =>
            change((el) => {
              el.contactCount = value
              delete el.hardware!.sitePositions
            }),
          { min: 1, max: 8192, step: 1 },
        ),
        numberField(
          'Site row spacing (µm)',
          e.contactSpacing * 1000,
          (value) =>
            change((el) => {
              el.contactSpacing = value / 1000
              delete el.hardware!.sitePositions
            }),
          { min: 1, max: 10000 },
        ),
        numberField(
          'Site size (µm)',
          e.contactLength * 1000,
          (value) =>
            change((el) => {
              el.contactLength = value / 1000
            }),
          { min: 1, max: 10000 },
        ),
      ]),
    )
  if (preset.id === 'custom-tungsten') {
    for (const label of ['Sites per shaft', 'Site row spacing (µm)']) {
      const input = pieces.at(-1)?.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)
      if (input) {
        input.disabled = true
        input.parentElement!.title =
          'This template has one exposed recording contact. Choose Custom linear probe for a multi-contact device.'
      }
    }
  }
  pieces.push(guideTubePanel(ctx, e), manufacturerOptions(ctx, e))
  const count = hware.rows * hware.columns
  const selection = (i: number): void =>
    change((el) => {
      const hw = el.hardware!,
        oldLength = shankLength(el, hw.selectedShank),
        nextLength = shankLength(el, i)
      el.depth += nextLength - oldLength
      hw.selectedShank = i
    })
  const inspect = (): void => {
    const dialog = h('dialog', { class: 'hardware-preview' })
    dialog.style.width = 'min(900px, 90vw)'
    dialog.style.maxHeight = '90vh'
    dialog.style.overflow = 'auto'
    const draw = (): void => {
      const current = ctx.store.project?.electrodes.find((x) => x.id === e.id) ?? e
      dialog.replaceChildren(
        h('h2', {}, [current.hardware?.model ?? current.name]),
        hardwareSchematic(current, (i) => {
          selection(i)
          draw()
        }),
        note(
          "Click an electrode in the top view to choose which tip should reach the target. The layout uses actual dimensions. Thin shafts are drawn wider in the side view so they are easier to see.",
        ),
        button('Close device view', () => dialog.close()),
      )
    }
    draw()
    dialog.addEventListener('close', () => dialog.remove())
    document.body.append(dialog)
    dialog.showModal()
  }
  const hwNumber = (
    label: string,
    key:
      | 'width'
      | 'thickness'
      | 'pitchX'
      | 'pitchY'
      | 'rotation'
      | 'tipOffset'
      | 'sitePitchX'
      | 'siteColumns'
      | 'recordingChannels',
    min: number,
    max: number,
    multiplier = 1,
  ): HTMLElement =>
    numberField(
      label,
      hware[key] * multiplier,
      (v) =>
        change((el) => {
          const hw = el.hardware!,
            value = v / multiplier
          if (key === 'tipOffset' && hw.sitePositions) {
            const delta = value - hw.tipOffset
            hw.sitePositions = hw.sitePositions.map(([x, y, z]) => [x, y, z + delta])
          }
          if (key === 'siteColumns' || key === 'sitePitchX') delete hw.sitePositions
          hw[key] = value
        }),
      { min, max, ...(key === 'siteColumns' || key === 'recordingChannels' ? { step: 1 } : {}) },
    )
  pieces.push(
    section('Device geometry', [
      readout('Model', hware.model),
      readout('Configuration', hware.modified ? 'Customized' : 'Library template'),
      readout('Physical sites', String(count * e.contactCount)),
      readout('Recording channels', String(hware.recordingChannels)),
      button('Inspect device geometry', inspect),

      details(ctx.store, 'sources', [
        h('summary', {}, ['Saved device specifications and sources']),
        note(hware.notes),
        ...hware.sources.map((url, i) =>
          h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, [
            `Source ${i + 1} · checked ${hware.checkedAt}`,
          ]),
        ),
      ]),
      followupField(numberField(
        'Shaft reserved above grid (mm)',
        hware.reservedLength ?? 0,
        (v) =>
          change((el) => {
            const delta = v - (el.hardware!.reservedLength ?? 0)
            el.length = (el.length ?? 150) - delta
            el.hardware!.shankLengths = el.hardware!.shankLengths.map((length) => length - delta)
            el.hardware!.reservedLength = v
          }),
        { min: 0, max: MAX_ELECTRODE_LENGTH_MM },
      ),'reservedLength'),
      note(
        "Enter how much shaft the holder or grid keeps above the insertion point. This reduces the length available to reach the target without changing the total electrode length.",
      ),
      details(ctx.store, 'configuration', [
        h('summary', {}, ['Customize array and site geometry']),
        selectField(
          'Shank cross-section',
          hware.shape,
          [
            { value: 'round', label: 'Round shaft' },
            { value: 'blade', label: 'Rectangular silicon blade' },
          ],
          (v) =>
            change((el) => {
              el.hardware!.shape = v as 'round' | 'blade'
              delete el.hardware!.sitePositions
            }),
        ),
        ...(hware.shape === 'blade'
          ? [
              hwNumber('Blade width (µm)', 'width', 1, 10000, 1000),
              hwNumber('Blade thickness (µm)', 'thickness', 1, 10000, 1000),
            ]
          : []),
        ...(['rows', 'columns'] as const).map((key) =>
          numberField(
            key === 'rows' ? 'Array rows' : 'Array columns',
            hware[key],
            (v) =>
              change((el) => {
                el.hardware![key] = v
                el.hardware!.selectedShank = 0
                el.hardware!.shankLengths = []
              }),
            { min: 1, max: 16, step: 1 },
          ),
        ),
        ...(hware.columns > 1 ? [hwNumber('Shank pitch X (µm)', 'pitchX', 1, 20000, 1000)] : []),
        ...(hware.rows > 1 ? [hwNumber('Shank pitch Y (µm)', 'pitchY', 1, 20000, 1000)] : []),
        ...(count > 1 ? [hwNumber('Array rotation (degrees)', 'rotation', -360, 360)] : []),
        selectField(
          'Targeting shaft',
          String(hware.selectedShank),
          shankOffsets(e).map((_, i) => ({ value: String(i), label: `Shaft ${i + 1}` })),
          (v) => selection(Number(v)),
        ),
        numberField(
          'Selected shaft usable length (mm)',
          shankLength(e, hware.selectedShank),
          (v) =>
            change((el) => {
              setIndividualLength(el, el.hardware!.selectedShank, v)
            }),
          { min: 0.5, max: MAX_ELECTRODE_LENGTH_MM },
        ),
        button('Use common length for every shaft', () =>
          change((el) => {
            setUniformLength(el, el.length ?? 150)
          }),
        ),
        note(
          "The selected electrode tip is the one aimed at the target. Other electrodes keep their relative lengths, and each inserted shaft is checked against marked areas to avoid. Some recording contacts may remain above the grid during partial insertion. The array is positioned as a single unit; individual shafts are not fitted to separate grid holes. Holders and the array base are not checked unless modeled.",
        ),
        hwNumber('Site columns per shaft', 'siteColumns', 1, 16),
        ...(hware.siteColumns > 1 ? [hwNumber('Site column pitch (µm)', 'sitePitchX', 1, 10000, 1000)] : []),
        hwNumber('Tip to first site centre (µm)', 'tipOffset', 0, 20000, 1000),
        hwNumber('Simultaneous recording channels', 'recordingChannels', 1, 65536),
        note(
          "The recording-system selection is saved for reference. It does not change physical contact locations or targeting. The preview shows all physical contacts; selecting active channel banks and assigning manufacturer channel numbers are not supported here.",
        ),
      ]),
    ]),
  )
  return h('div', {}, pieces)
}
