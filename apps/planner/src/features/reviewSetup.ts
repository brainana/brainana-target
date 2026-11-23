import { sub } from '@brainana/planning-core/geometry.ts'
import { maximumSeatedTilt, refitChamberTrajectories } from '@brainana/planning-core/placement-adjustment.ts'
import { settings } from '@brainana/planning-core/optimization.ts'
import { beginPlacementTask, cancelPlacementTask } from '../state/placementTasks.ts'
import { placementInputs } from '../state/placementPreview.ts'
import { computeChamberMove } from './placementCompute.ts'
import { h } from '@brainana/ui/dom.ts'
import { gridHoles } from '@brainana/planning-core/geometry.ts'
import { gridCompatibility, maximumInsertion, minimumInsertion } from '@brainana/planning-core/hardware.ts'
import type { Chamber, Pose, Project } from '@brainana/planning-core/model.ts'
import { objectPoseEditor } from '../ui/objectPoseEditor.ts'
import { button, note, section } from '../ui/controls.ts'
import type { FeatureContext } from './contracts.ts'

interface ReviewPose {
  prefix: string
  label: string
  pose: Pose
  assignPose: (project: Project, pose: Pose) => void
  detail?: string
  translationOnly?: boolean
}
interface ReviewParameter {
  label: string
  value: number
  min: number
  max: number
  step: number
}
interface ReviewControls {
  prefix: string
  label: string
  detail: string
  fields: ReviewParameter[]
  chamberId: string
  fixedElectrodeId?: string
  hole?: { options: [number, number][]; value: [number, number] }
  assignFields: (project: Project, values: number[], hole?: [number, number]) => void
}
interface ReviewChamber {
  prefix: string
  label: string
  chamber: Chamber
}
type ReviewObject = ReviewPose | ReviewControls | ReviewChamber
const selections = new WeakMap<FeatureContext['store'], string>()

function placedObjects(project: Project): ReviewObject[] {
  const initialOffset = project.display.setupOffsetMm ?? [0, 0, 0]
  const objects: ReviewObject[] = [{
    prefix: 'anatomy:', label: 'Anatomy and attached equipment', translationOnly: true,
    pose: { origin: initialOffset, angles: [0, 0, 0] },
    detail: 'Move the anatomy and its attached equipment together in 3D. The stereotax stays fixed on screen as you drag. Image-space coordinates and the slice alignment are preserved.',
    assignPose: (p, pose) => {
      p.display = { ...p.display, setupOffsetMm: [...pose.origin] }
      if (p.stereotax) p.stereotax = { ...p.stereotax, pose: {
        ...p.stereotax.pose, origin: sub(p.stereotax.pose.origin, sub(pose.origin, initialOffset)),
      } }
    },
  }]
  if (project.stereotax) objects.push({
    prefix: 'stereotax:', label: 'Stereotaxic frame', pose: project.stereotax.pose,
    assignPose: (p, pose) => { p.stereotax = { ...p.stereotax!, pose } },
  })
  for (const post of project.headposts ?? []) objects.push({
    prefix: `headpost:${post.id}:`, label: `Headpost · ${post.name}`, pose: post.pose,
    assignPose: (p, pose) => { p.headposts = p.headposts!.map(item => item.id === post.id ? { ...item, pose } : item) },
  })
  for (const chamber of project.chambers.filter(item => item.placementState !== 'unplaced')) objects.push({
    prefix: `chamber:${chamber.id}:`, label: `Chamber · ${chamber.name}`, chamber,
  })
  for (const grid of project.grids) {
    const chamber = project.chambers.find(item => item.id === grid.chamberId && item.placementState !== 'unplaced')
    const guided = project.electrodes.filter(item => item.gridId === grid.id && !item.direct)
    if (!chamber || grid.enabled === false || !guided.some(item => gridCompatibility(item).available)) continue
    objects.push({
      prefix: `grid:${grid.id}:`, label: `Guide grid · ${grid.name}`,
      detail: 'An angle is usable if the grid fits inside the chamber and every linked electrode still has a clear path to its target. The app can select another hole and insertion depth to keep a target reachable.',
      chamberId: chamber.id,
      fields: [
        { label: 'Grid rotation (°)', value: grid.rotation, min: -360, max: 360, step: 1 },
        { label: 'Grid tilt (°)', value: grid.tiltAngle ?? 0, min: 0, max: maximumSeatedTilt(chamber, { ...grid, minimumThickness: grid.minimumThickness || 2 }), step: .1 },
        { label: 'Tilt direction (°)', value: grid.tiltAzimuth ?? 0, min: -360, max: 360, step: 1 },
      ],
      assignFields: (p, [rotation, tiltAngle, tiltAzimuth]) => {
        p.grids = p.grids.map(item => item.id === grid.id ? {
          ...item, rotation, tiltAngle, tiltAzimuth,
          minimumThickness: tiltAngle > 0 ? item.minimumThickness || 2 : item.minimumThickness,
        } : item)
      },
    })
    for (const electrode of guided) objects.push({
      prefix: `guided:${electrode.id}:`, label: `Electrode · ${electrode.name}`,
      detail: 'Choose a hole and insertion depth. Apply is available when the path reaches the linked target and clears the wall and marked areas.',
      chamberId: chamber.id, fixedElectrodeId: electrode.id,
      fields: [{ label: 'Insertion depth (mm)', value: electrode.depth, min: minimumInsertion(electrode), max: maximumInsertion(electrode), step: .1 }],
      hole: { options: gridHoles(chamber, grid), value: electrode.hole },
      assignFields: (p, [depth], hole) => {
        p.electrodes = p.electrodes.map(item => item.id === electrode.id ? { ...item, depth, hole: hole ?? item.hole } : item)
      },
    })
  }
  for (const electrode of project.electrodes) {
    if (electrode.direct && !electrode.direct.unplaced) objects.push({
      prefix: `direct:${electrode.id}:`, label: `Electrode · ${electrode.name}`, pose: electrode.direct.pose,
      detail: 'Moving the electrode changes its skull entry and trajectory. Recheck the target and clearance.',
      assignPose: (p, pose) => { p.electrodes = p.electrodes.map(item => item.id === electrode.id ? { ...item, direct: { ...item.direct!, pose } } : item) },
    })
    if (electrode.connector && !electrode.connector.unplaced) objects.push({
      prefix: `connector:${electrode.id}:`, label: `Connector · ${electrode.name}`, pose: electrode.connector.pose,
      assignPose: (p, pose) => { p.electrodes = p.electrodes.map(item => item.id === electrode.id ? { ...item, connector: { ...item.connector!, pose } } : item) },
    })
  }
  return objects
}

function parameterEditor(ctx: FeatureContext, project: Project, selected: ReviewControls): HTMLElement {
  const feedback = note('')
  feedback.setAttribute('role', 'status')
  const apply = h('button', { type: 'submit', class: 'primary', disabled: true }, ['Apply adjustment'])
  const form = h('form', { class: 'object-pose-editor' })
  const original = placementInputs(project)
  const holes = selected.hole
  const options = holes ? Array.from(new Map([...holes.options, holes.value].map(hole => [hole.join(','), hole])).values()) : []
  const hole = holes ? h('select', { ariaLabel: 'Guide hole' }, options.map(pair => h('option', { value: pair.join(',') }, [pair.join(', ')]))) : null
  if (hole) hole.value = holes!.value.join(',')
  const fields = selected.fields.map(field => {
    const settings = { min: String(field.min), max: String(field.max), value: String(field.value), disabled: field.max === field.min }
    const exact = h('input', { ...settings, type: 'number', step: 'any', required: true, ariaLabel: field.label })
    const range = h('input', { ...settings, type: 'range', step: String(field.step), ariaLabel: field.label + ' slider' })
    exact.addEventListener('change', () => {
      if (exact.checkValidity()) range.value = exact.value
      preview()
    })
    range.addEventListener('input', () => { exact.value = range.value; preview() })
    return { exact, range, element: h('label', { class: 'object-pose-field' }, [h('span', {}, [field.label]), exact, range]) }
  })
  function edit(project: Project): void {
    selected.assignFields(project, fields.map(field => field.exact.valueAsNumber), options.find(item => item.join(',') === hole?.value))
  }
  let proposed: Project | undefined
  let frame = 0
  function preview(): void {
    cancelAnimationFrame(frame)
    apply.disabled = true
    proposed = undefined
    frame = requestAnimationFrame(() => {
      if (!form.isConnected) return
      if (fields.some(field => !field.exact.checkValidity())) {
        ctx.previewReview?.(null)
        feedback.textContent = 'Enter a value within the available range.'
        return
      }
      const next = { ...project, electrodes: structuredClone(project.electrodes) }
      edit(next)
      try {
        const count = refitChamberTrajectories(next, selected.chamberId, selected.fixedElectrodeId)
        proposed = next
        ctx.previewReview?.(next)
        apply.disabled = false
        feedback.textContent = count
          ? `Preview · ${count} validated ${count === 1 ? 'trajectory' : 'trajectories'}. Apply to keep the adjustment.`
          : 'Preview. Apply to keep the adjustment.'
      } catch (error) {
        ctx.previewReview?.(null)
        feedback.textContent = error instanceof Error ? error.message : String(error)
      }
    })
  }
  hole?.addEventListener('change', preview)
  const reset = button('Revert preview', () => {
    fields.forEach(({ exact, range }, i) => { exact.value = range.value = String(selected.fields[i].value) })
    if (hole) hole.value = holes!.value.join(',')
    cancelAnimationFrame(frame)
    proposed = undefined
    apply.disabled = true
    ctx.previewReview?.(null)
    feedback.textContent = ''
  })
  form.append(
    ...(hole ? [h('label', { class: 'field' }, ['Guide hole', hole])] : []),
    ...fields.map(field => field.element),
    h('div', { class: 'button-row' }, [apply, reset]), feedback,
  )
  form.addEventListener('submit', event => {
    event.preventDefault()
    const next = proposed
    const live = ctx.store.project
    if (!next || apply.disabled || !live) return
    if (placementInputs(live) !== original) {
      ctx.previewReview?.(null)
      ctx.refresh()
      return
    }
    if (ctx.edit(draft => { draft.grids = next.grids; draft.electrodes = next.electrodes }) !== false) ctx.previewReview?.(null)
  })
  return form
}

function chamberEditor(ctx: FeatureContext, project: Project, chamber: Chamber): HTMLElement {
  if (settings(project).mode === 'existing') return note('The measured pose of the implanted chamber stays fixed. Adjust its guide grid or electrode to change the trajectory.')
  const feedback = note('')
  feedback.setAttribute('role', 'status')
  const surface = ctx.scene.mountingSurface
  let proposed: Project | undefined
  const original = placementInputs(project)
  const choose = button('Choose new mounting point', () => {
    ctx.previewReview?.(null)
    proposed = undefined
    apply.disabled = true
    choose.disabled = true
    revert.disabled = false
    feedback.textContent = 'Click the new center of the chamber on the 3D planning surface.'
    ctx.scene.setSurfaceFitHandler?.((point, normal) => {
      ctx.scene.setSurfaceFitHandler?.(null)
      const live = ctx.store.project
      if (!live || placementInputs(live) !== original) return
      const task = beginPlacementTask(ctx.store, live)
      feedback.textContent = 'Checking the rim, chamber angle and linked trajectories…'
      void computeChamberMove({ project: live, chamberId: chamber.id, point, normal, surface }, task.signal)
        .then(next => {
          if (!feedback.isConnected || !task.current(ctx.store.project)) return
          proposed = next
          ctx.previewReview?.(next)
          apply.disabled = false
          feedback.textContent = 'Preview · The chamber angle and base were refitted. Linked electrodes were checked and refitted at this position.'
        }).catch(error => {
          if (feedback.isConnected && task.current(ctx.store.project))
            feedback.textContent = `${error instanceof Error ? error.message : String(error)} The saved placement is unchanged.`
        }).finally(() => {
          task.finish()
          if (feedback.isConnected) choose.disabled = false
        })
    }, () => { feedback.textContent = 'No planning surface at that point. Click the visible skull surface.' })
  })
  const apply = button('Apply mounting point', () => {
    const next = proposed, live = ctx.store.project
    if (!next || !live || placementInputs(live) !== original) return
    if (ctx.edit(draft => {
      draft.chambers = next.chambers
      draft.electrodes = next.electrodes
    }) !== false) ctx.previewReview?.(null)
  }, 'primary')
  const revert = button('Cancel move', () => {
    cancelPlacementTask(ctx.store)
    ctx.scene.setSurfaceFitHandler?.(null)
    ctx.previewReview?.(null)
    proposed = undefined
    feedback.textContent = ''
    apply.disabled = revert.disabled = true
    choose.disabled = false
  })
  choose.disabled = !surface.surfaces.length || !ctx.scene.setSurfaceFitHandler
  apply.disabled = revert.disabled = true
  return h('div', {}, [
    note('Choose a new mounting point to refit the chamber angle, rim and linked electrode trajectories. The guide grid keeps its current design.'),
    ...(choose.disabled ? [note('Finalize a planning surface before moving the chamber.'), button('Open Planning surface', ctx.actions.preparePlanningSurface ?? ctx.actions.manageImages)] : []),
    h('div', { class: 'button-row' }, [choose, apply, revert]), feedback,
  ])
}

export function reviewSetup(ctx: FeatureContext, project: Project): HTMLElement {
  const objects = placedObjects(project)
  const editor = h('div')
  const select = h('select', { ariaLabel: 'Object to adjust' }, objects.map(item => h('option', { value: item.prefix }, [item.label])))
  select.value = objects.find(item => item.prefix === selections.get(ctx.store))?.prefix ?? objects[0]?.prefix ?? ''
  const setup = button(project.stereotax ? 'Configure stereotax…' : 'Add stereotax…', () => ctx.actions.openStereotax?.())
  setup.hidden = !ctx.actions.openStereotax
  const selectObject = () => {
    const selected = objects.find(item => item.prefix === select.value)
    if (!selected) return
    selections.set(ctx.store, selected.prefix)
    if ('chamber' in selected) {
      editor.replaceChildren(chamberEditor(ctx, project, selected.chamber))
      return
    }
    if ('fields' in selected) {
      editor.replaceChildren(note(selected.detail), parameterEditor(ctx, project, selected))
      return
    }
    const preview = (pose: Pose | null) => {
      if (!pose) { ctx.previewReview?.(null); return }
      const next = { ...project }
      selected.assignPose(next, pose)
      ctx.previewReview?.(next)
    }
    editor.replaceChildren(
      ...(selected.detail ? [note(selected.detail)] : []),
      objectPoseEditor({
        initial: selected.pose, translationOnly: selected.translationOnly,
        dragLabel: selected.translationOnly ? 'Drag anatomy in 3D' : undefined,
        preview,
        apply: pose => ctx.edit(p => selected.assignPose(p, pose)) !== false,
        setDrag: drag => ctx.scene.setObjectDrag?.(drag ? selected.prefix : null, drag ?? undefined),
        locate: selected.translationOnly ? undefined : pose => ctx.scene.moveCrosshair(pose.origin),
      }),
    )
  }
  select.addEventListener('change', () => {
    cancelPlacementTask(ctx.store)
    ctx.scene.setSurfaceFitHandler?.(null)
    ctx.scene.setObjectDrag?.(null)
    ctx.previewReview?.(null)
    selectObject()
  })
  if (!ctx.hasPlacementPreview) selectObject()
  return section('Object setup', [
    setup,
    ...(ctx.hasPlacementPreview ? [note('Apply or cancel the placement candidate before adjusting saved objects.')]
      : objects.length ? [h('label', { class: 'field' }, ['Object to adjust', select]), editor]
        : [note('Placed headposts, chambers, electrodes and connectors appear here.')]),
  ])
}
