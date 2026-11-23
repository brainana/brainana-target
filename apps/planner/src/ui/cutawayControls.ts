import { h } from '@brainana/ui/dom.ts'
import type { Project, Vec3 } from '@brainana/planning-core/model.ts'
import { trajectory } from '@brainana/planning-core/geometry.ts'
import type { Cutaway } from '../render/cutaway.ts'
import { button, note, selectField } from './controls.ts'
import { hoverHelp } from './hoverHelp.ts'

export function cutawayControls(
  cut: Cutaway,
  change: (patch: Partial<Cutaway>) => void,
  bounds: () => { min: Vec3; max: Vec3 } | null,
  crosshair: () => Vec3,
  project: () => Project | null,
  selectedElectrode: () => string | null,
  embedded = false,
): { element: HTMLElement; details: HTMLElement; update: () => void } {
  const popup = h('div', {
    class: 'scene-layers cutaway-settings',
    hidden: !embedded,
    role: 'group',
    ariaLabel: '3D cutaway settings',
  })
  const toggle = button('Cutaway', () => {
    popup.hidden = !popup.hidden
    toggle.setAttribute('aria-expanded', String(!popup.hidden))
  })
  toggle.setAttribute('aria-label', '3D cutaway controls')
  toggle.setAttribute('aria-expanded', 'false')
  const plane = selectField(
    'Cut plane',
    '',
    [
      { value: '', label: 'Off · full 3D scene' },
      { value: '0', label: 'Sagittal · left / right' },
      { value: '1', label: 'Coronal · anterior / posterior' },
      { value: '2', label: 'Axial · superior / inferior' },
    ],
    (value) => {
      const axis = value === '' ? null : (Number(value) as 0 | 1 | 2)
      change({ axis, ...(axis !== null ? { position: crosshair()[axis] } : {}) })
      update()
    },
  )
  const side = selectField('Keep side of cut', 'lower', [], (value) => {
    change({ keepHigher: value === 'higher' })
    update()
  })
  const position = h('input', { type: 'range', step: '0.1', ariaLabel: '3D cut position (mm RAS)' })
  const numeric = h('input', { type: 'number', step: 'any', ariaLabel: '3D cut coordinate (mm RAS)' })
  const readout = h('output')
  const setPosition = (value: number): void => {
    if (!Number.isFinite(value)) return
    change({ position: value })
    update()
  }
  // Coalesce pointer input to one section update per animation frame.
  let pendingFrame = 0
  position.addEventListener('input', () => {
    cancelAnimationFrame(pendingFrame)
    const value = position.valueAsNumber
    pendingFrame = requestAnimationFrame(() => {
      pendingFrame = 0
      setPosition(value)
    })
  })
  numeric.addEventListener('change', () => {
    if (numeric.reportValidity()) setPosition(numeric.valueAsNumber)
  })
  const atCrosshair = button('Cut at crosshair', () => {
    if (cut.axis !== null) setPosition(crosshair()[cut.axis])
  })
  let targetId = '',
    targetKey = ''
  const target = selectField('Cross-section target', '', [], (value) => {
    targetId = value
    update()
  })
  const atTarget = button('Cut at target', () => {
    const point = project()?.targets.find((t) => t.id === targetId)?.point
    if (point && cut.axis !== null) setPosition(point[cut.axis])
  })
  const atTip = button('Cut at electrode tip', () => {
    const p = project(),
      e = p?.electrodes.find((e) => e.id === selectedElectrode()),
      g = p?.grids.find((g) => g.id === e?.gridId),
      c = p?.chambers.find((c) => c.id === g?.chamberId)
    if (c && g && e && cut.axis !== null) setPosition(trajectory(c, g, e).tip[cut.axis])
  })
  for (const shortcut of [atTarget, atTip, atCrosshair]) hoverHelp(shortcut, () => shortcut.title)
  const hardware = h('input', { type: 'checkbox', ariaLabel: 'Also cut implant hardware' })
  hardware.addEventListener('change', () => change({ clipHardware: hardware.checked }))
  const section = h('input', { type: 'checkbox', ariaLabel: 'Show MRI section in 3D' })
  section.addEventListener('change', () => {
    change({ showSection: section.checked })
    update()
  })
  const sectionOpacity = h('input', {
    type: 'range',
    min: '0',
    max: '1',
    step: '0.01',
    ariaLabel: 'MRI section opacity in 3D',
  })
  sectionOpacity.addEventListener('input', () => change({ sectionOpacity: sectionOpacity.valueAsNumber }))
  popup.append(
    h('h3', {}, ['Explore a cross-section']),
    plane,
    side,
    h('label', { class: 'field' }, [
      h('span', {}, ['Cut position · RAS millimetres']),
      position,
      numeric,
      readout,
    ]),
    atCrosshair,
    target,
    h('div', { class: 'button-row' }, [atTarget, atTip]),
    h('label', {}, [section, 'Show MRI at the cut plane']),
    h('label', { class: 'field' }, [h('span', {}, ['MRI section opacity']), sectionOpacity]),
    h('label', {}, [hardware, 'Also cut implant hardware']),
    note(
      "Cutaway hides part of the anatomy so you can see inside. Electrodes and targets stay visible. Adjust the image-slice opacity separately from the outer surface. You can also cut hardware, while target and avoidance markers stay visible. These controls change only the display, not your plan or avoidance settings.",
    ),
  )
  const root = h('div', { class: 'scene-layer-menu' }, [toggle, popup])
  document.addEventListener('pointerdown', (event) => {
    if (!embedded && !root.contains(event.target as Node)) {
      popup.hidden = true
      toggle.setAttribute('aria-expanded', 'false')
    }
  })
  root.addEventListener('keydown', (event) => {
    if (!embedded && event.key === 'Escape') {
      popup.hidden = true
      toggle.setAttribute('aria-expanded', 'false')
      toggle.focus()
    }
  })
  const update = (): void => {
    const b = bounds(),
      active = cut.axis !== null && !!b
    toggle.disabled = !b
    plane.querySelector('select')!.value = cut.axis === null ? '' : String(cut.axis)
    const directions = [
      ['Left', 'Right'],
      ['Posterior', 'Anterior'],
      ['Inferior', 'Superior'],
    ][cut.axis ?? 0]
    const sideInput = side.querySelector('select')!
    sideInput.replaceChildren(
      h('option', { value: 'lower' }, [`Keep ${directions[0]}`]),
      h('option', { value: 'higher' }, [`Keep ${directions[1]}`]),
    )
    sideInput.value = cut.keepHigher ? 'higher' : 'lower'
    for (const input of [sideInput, position, numeric, hardware, section]) input.disabled = !active
    for (const input of [position, numeric]) {
      input.min = String(b?.min[cut.axis ?? 0] ?? 0)
      input.max = String(b?.max[cut.axis ?? 0] ?? 1)
      input.value = String(cut.position)
    }
    readout.textContent = active
      ? `${['R', 'A', 'S'][cut.axis!]} ${cut.position.toFixed(2)} mm`
      : 'Choose a plane to enable cross-sections.'
    sectionOpacity.value = String(cut.sectionOpacity)
    sectionOpacity.disabled = !active || !cut.showSection
    hardware.checked = cut.clipHardware
    section.checked = cut.showSection
    const p = project(),
      targets = p?.targets ?? [],
      key = JSON.stringify(targets.map((t) => [t.id, t.name]))
    if (key !== targetKey) {
      targetKey = key
      if (!targets.some((t) => t.id === targetId))
        targetId = p?.electrodes.find((e) => e.id === selectedElectrode())?.targetId ?? targets[0]?.id ?? ''
      if (!targets.some((t) => t.id === targetId)) targetId = targets[0]?.id ?? ''
      target
        .querySelector('select')!
        .replaceChildren(...targets.map((t) => h('option', { value: t.id }, [t.name])))
    }
    target.querySelector('select')!.value = targetId
    target.querySelector('select')!.disabled = !active || !targets.length
    const electrode = p?.electrodes.find((e) => e.id === selectedElectrode()),
      grid = p?.grids.find((g) => g.id === electrode?.gridId),
      chamber = p?.chambers.find((c) => c.id === grid?.chamberId)
    for (const [shortcut, point] of [
      [atCrosshair, crosshair()],
      [atTarget, targets.find((t) => t.id === targetId)?.point],
      [atTip, chamber && grid && electrode ? trajectory(chamber, grid, electrode).tip : undefined],
    ] as const) {
      const inside =
        !!point &&
        !!b &&
        cut.axis !== null &&
        point[cut.axis] >= b.min[cut.axis] &&
        point[cut.axis] <= b.max[cut.axis]
      shortcut.disabled = !active || !inside
      shortcut.title = !active
        ? 'Choose a cut plane first.'
        : !point
          ? 'Select the corresponding target or electrode first.'
          : !inside
            ? 'This point lies beyond the anatomical image along the selected cut axis. Choose another plane or a position inside the image.'
            : ''
    }
    toggle.classList.toggle('cutaway-active', active)
    toggle.title = active
      ? `Active ${['sagittal', 'coronal', 'axial'][cut.axis!]} cut at ${cut.position.toFixed(2)} mm`
      : 'Show cardinal-plane cross-sections'
  }
  update()
  return { element: root, details: popup, update }
}
