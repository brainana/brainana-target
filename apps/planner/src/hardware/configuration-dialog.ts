import {installConfiguredElectrode} from './configuration.ts'
import { h } from '@brainana/ui/dom.ts'
import type { Electrode } from '@brainana/planning-core/model.ts'
import { shankLength } from '@brainana/planning-core/hardware.ts'
import { validateProject } from '@brainana/planning-core/validation.ts'
import { ProjectStore } from '../state/store.ts'
import type { FeatureContext } from '../features/contracts.ts'
import { hardwareCatalog, applyHardwarePreset } from './catalog.ts'
import { setupOptions, setupReady, setupValues, confirmSetup } from './setup.ts'
import { hardwareSchematic } from './schematic.ts'
import { optionValues, availableChoices, normalizeLegacyPreset } from './configuration.ts'
import { details } from './disclosure.ts'
import { revealField } from '../ui/revealField.ts'
import { selectField, numberField, section, button, note, readout, textField } from '../ui/controls.ts'

/** Isolated, validated hardware draft. Applying commits one project transaction. */
export function openHardwareConfiguration(
  ctx: FeatureContext,
  e: Electrode,
  presetId: string | undefined,
  renderFields: (context: FeatureContext, electrode: Electrode) => HTMLElement,
  focusField?:string,
): void {
  const store = new ProjectStore()
  store.replace(ctx.store.project!)
  if (!store.project!.electrodes.find((x) => x.id === e.id)!.hardware) presetId ??= hardwareCatalog[0].id
  if (presetId?.startsWith('plexon-u')) presetId = 'plexon-u'
  const legacy = store.project!.electrodes.find((x) => x.id === e.id)!
  if (legacy.hardware?.presetId === 'plexon-u16' || legacy.hardware?.presetId === 'plexon-u32')
    store.edit((p) => normalizeLegacyPreset(p.electrodes.find((x) => x.id === e.id)!))
  if (presetId)
    store.edit((p) => {
      const el = p.electrodes.find((x) => x.id === e.id)!
      const target = el.targetId
      applyHardwarePreset(
        el,
        hardwareCatalog.find((x) => x.id === presetId)!,
      )
      el.targetId = target
    })
  const dialog = h('dialog', {
    class: 'electrode-configurator',
    ariaLabel: 'Configure electrode hardware',
  })
  const error = h('p', { role: 'alert' })
  error.style.color = '#ffb6a8'
  const content = h('div')
  const setup = h('div', { class: 'hardware-setup' })
  const apply = button(
    'Apply electrode configuration',
    () => {
      const configured = store.project!.electrodes.find((x) => x.id === e.id)!
      if (!setupReady(configured) || error.textContent) return
      const applied=ctx.edit(p=>installConfiguredElectrode(p,e,configured))
      if(applied===false)return
      dialog.close()
      ctx.refresh()
    },
    'primary',
  )
  const draw = (): void => {
    const current = store.project!.electrodes.find((x) => x.id === e.id)!
    const ready = setupReady(current)
    dialog.classList.toggle('configuring-prerequisites', !ready)
    apply.disabled = !ready
    setup.replaceChildren()
    if (!ready) {
      const defaults = setupValues(current)
      const pending: Record<string, string | number> = {}
      const inputs: Array<HTMLInputElement | HTMLSelectElement> = []
      const confirm = button(
        'Use these device specifications',
        () => {
          if (!inputs.every((input) => input.reportValidity())) return
          draftContext.edit((p) =>
            confirmSetup(
              p.electrodes.find((x) => x.id === e.id)!,
              pending,
            ),
          )
        },
        'primary',
      )
      const update = (): void => {
        const options = setupOptions(current)
        let blocked = false
        options.forEach((o, i) => {
          if (o.choices) {
            const candidate = structuredClone(current)
            candidate.hardware!.configuration = { ...optionValues(current), ...pending }
            const allowed = availableChoices(candidate, o)
            if (pending[o.key] !== undefined && !allowed.includes(pending[o.key])) pending[o.key] = ''
            const select = inputs[i] as HTMLSelectElement
            select.replaceChildren(
              h('option', { value: '' }, [`Choose ${o.label.toLowerCase()}…`]),
              ...allowed.map((value) => h('option', { value: String(value) }, [String(value)])),
            )
            select.value = String(pending[o.key] ?? '')
          }
          inputs[i].disabled = blocked
          if (o.choices && (pending[o.key] === undefined || pending[o.key] === '')) blocked = true
        })
        confirm.disabled = blocked
        if (!blocked) {
          try {
            const preview = structuredClone(current)
            confirmSetup(preview, pending)
            validateProject({
              ...store.project!,
              electrodes: store.project!.electrodes.map((el) => (el.id === preview.id ? preview : el)),
            })
            content.replaceChildren(
              h('div', { class: 'electrode-live-preview' }, [
                h('h3', {}, ['Live specification preview']),
                hardwareSchematic(preview, () => {}),
                note(
                  'Preview reflects the values above. Use these device specifications to open detailed customization; Apply saves the configuration.',
                ),
              ]),
            )
          } catch (err) {
            content.replaceChildren(note(err instanceof Error ? err.message : String(err)))
            confirm.disabled = true
          }
        } else
          content.replaceChildren(
            note('Choose the required configuration above to display the device preview.'),
          )
        const length = setup.querySelector('[data-setup-key="length"] span')
        if (length && options.some((o) => o.key === 'lengthProfile')) {
          const member = current.hardware!.shape === 'blade' ? 'shank' : 'electrode'
          length.textContent =
            pending.lengthProfile === 'Uniform'
              ? `Uniform ${member} length (mm)`
              : pending.lengthProfile === 'Individual lengths'
                ? `Starting ${member} length (mm)`
                : `Longest ${member} length (mm)`
        }
      }
      const controls = setupOptions(current).map((o) => {
        const label =
          o.key === 'shafts' && current.hardware!.presetId === 'micro-fma'
            ? 'Confirm FMA electrode variant'
            : o.label
        let field: HTMLElement
        if (o.choices) {
          field = selectField(
            label,
            '',
            [
              { value: '', label: `Choose ${label.toLowerCase()}…` },
              ...o.choices.map((value) => ({ value: String(value), label: String(value) })),
            ],
            (value) => {
              pending[o.key] = o.choices!.find((x) => String(x) === value) ?? ''
              update()
            },
          )
        } else {
          pending[o.key] = defaults[o.key]
          field = numberField(
            label,
            Number(defaults[o.key]),
            (value) => {
              pending[o.key] = value
              update()
            },
            {
              min: o.min,
              max: o.max,
              step: ['rows', 'columns', 'shafts', 'sites'].includes(o.key) ? 1 : undefined,
            },
          )
        }
        field.dataset.setupKey = o.key
        inputs.push(field.querySelector('input, select')!)
        return field
      })
      update()
      setup.append(
        section('Define your device first', [
          note(
            'Choose the configuration of your actual device. Numeric starting values are examples to review. The preview updates as soon as the required choices define a valid device. Use these specifications to open detailed customization.',
          ),
          ...controls,
          confirm,
        ]),
      )
    } else if (setupOptions(current).length) {
      setup.append(
        button('Change device configuration', () =>
          draftContext.edit((p) => {
            delete p.electrodes.find((x) => x.id === e.id)!.hardware!.configuration!.setupConfirmed
          }),
        ),
      )
    }
    const draftContext: FeatureContext = {
      ...ctx,
      store,
      project: store.project,
      refresh: () => draw(),
      edit: (fn) => {
        try {
          store.edit(fn)
          error.textContent = ''
          draw()
        } catch (err) {
          error.textContent = err instanceof Error ? err.message : String(err)
        }
      },
    }
    if (!ready) return
    const scroll = content.scrollTop
    const fields = renderFields(draftContext, current)
    const library = fields.firstElementChild!
    library.querySelector('select')?.closest('label')?.remove()
    const specifications = details(store, 'draft-summary', [
      h('summary', {}, ['Draft dimensions and source specifications']),
    ])
    while (library.children.length > 2) specifications.append(library.children[2])
    library.append(specifications)
    const preview = h('div', { class: 'electrode-live-preview' }, [
      h('h3', {}, ['Live device preview']),
      hardwareSchematic(current, (i) => {
        draftContext.edit((p) => {
          const el = p.electrodes.find((x) => x.id === e.id)!
          const hw = el.hardware!
          el.depth += shankLength(el, i) - shankLength(el, hw.selectedShank)
          hw.selectedShank = i
        })
        revealField(content, `individual-length-${i}`)
      }),
      note(
        'Click an electrode or shank in the footprint to select its tip for targeting. Selecting one reveals and highlights its numbered length field on the left. Widths in the side view are exaggerated.',
      ),
      readout(
        'Selected electrode / shank usable reach from grid',
        `${shankLength(current, current.hardware?.selectedShank ?? 0).toFixed(2)} mm`,
      ),
      note(
        'Acquisition-system choice does not change targeting. Connector metadata alone does not add geometry; define and place its body in the Skull connector / pedestal section of Electrode. Choosing a different manufactured electrode or site count can change device geometry. Cable length is not electrode reach.',
      ),
    ])
    content.replaceChildren(fields, preview)
    content.scrollTop = scroll
  }
  const family = selectField(
    'Hardware preset',
    store.project!.electrodes.find((x) => x.id === e.id)!.hardware!.presetId,
    hardwareCatalog.map((p) => ({ value: p.id, label: p.label })),
    (id) => {
      try {
        store.edit((p) => {
          const el = p.electrodes.find((x) => x.id === e.id)!
          const target = el.targetId
          applyHardwarePreset(
            el,
            hardwareCatalog.find((x) => x.id === id)!,
          )
          el.targetId = target
        })
        error.textContent = ''
        draw()
      } catch (err) {
        error.textContent = err instanceof Error ? err.message : String(err)
      }
    },
  )
  dialog.append(
    h('header', { class: 'modal-head' }, [
      h('h2', {}, ['Configure electrode hardware']),
      h('div', { class: 'configuration-actions' }, [button('Cancel configuration', () => dialog.close()), apply]),
      Object.assign(
        button('×', () => dialog.close()),
        { ariaLabel: 'Close electrode configuration' },
      ),
    ]),
    note('Changes are a draft until you apply them. Check the actual ordered device dimensions and layout.'),
    error,
    textField('Electrode name', e.name, value => store.edit(p => { p.electrodes.find(x => x.id === e.id)!.name = value })),
    family,
    h('div', { class: 'configuration-body' }, [setup, content]),

  )
  content.className = 'electrode-configurator-content'
  draw()
  dialog.addEventListener('close', () => {
    dialog.remove()
    ctx.refresh()
  })
  document.body.append(dialog)
  dialog.showModal()
  if(focusField)revealField(dialog,focusField)
}
