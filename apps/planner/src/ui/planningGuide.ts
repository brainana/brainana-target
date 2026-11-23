import { targetsForElectrode } from '@brainana/planning-core/electrode-frame.ts'
import { inTargetRegion } from '@brainana/planning-core/target-region.ts'
import {electrodeAssembly,directPlanning} from '@brainana/planning-core/electrode-frame.ts'
import {chamberOnlyTask} from '@brainana/planning-core/model.ts'
import { floatingLayer } from './floatingLayer.ts'
import { minimumTargetInsertion, maximumInsertion } from '@brainana/planning-core/hardware.ts'
import { setupReady } from '../hardware/setup.ts'
import { h } from '@brainana/ui/dom.ts'
import type { Project } from '@brainana/planning-core/model.ts'
import { settings, clearance } from '@brainana/planning-core/optimization.ts'
import { gridHoleClearance, length, sub, trajectory } from '@brainana/planning-core/geometry.ts'
import { button, note } from './controls.ts'

interface GuideContext {
  project: () => Project | null
  navigate: (feature: string) => void
  selectedElectrode?: () => string | null
  hasPlanningSurface?: () => boolean
}
interface GuideStep {
  feature: string
  title: string
  text: string
  ready: (p: Project | null) => boolean
  waiting: string
  anchor?: string
  auto?: boolean
  superseded?: (p: Project | null) => boolean
}
// Tutorial state is independent of project history. Steps observe domain state,
// so canceling an import or rejecting a placement cannot advance the guide.
export function planningGuide(ctx: GuideContext): {
  element: HTMLElement
  start: () => void
  refresh: () => void
  projectChanged: (preserveProgress?:boolean) => void
} {
  let index = 0
  let projectKey: string | null | undefined
  let reviewing = false
  let navigation = 0
  let active = false
  let lastReady: boolean | null = null
  let painted = ''
  let highlighted: HTMLElement | null = null
  let descriptor: string | null = null
  const regionBox = h('div', { class: 'guide-boundary guide-region', hidden: true, ariaHidden: 'true' })
  const actionBox = h('div', { class: 'guide-boundary guide-action', hidden: true, ariaHidden: 'true' })
  document.body.append(regionBox, actionBox)
  const bound = (box: HTMLElement, target: HTMLElement | null, label: string): void => {
    box.hidden = !active || !target || !target.isConnected
    if (box.hidden || !target) return
    const rect = target.getBoundingClientRect()
    const clip = target.closest('.surface-editor-controls, .inspector')?.getBoundingClientRect()
    const left = Math.max(4, rect.left)
    const top = Math.max(4, rect.top, clip?.top ?? 0)
    const right = Math.min(window.innerWidth - 4, rect.right)
    const bottom = Math.min(window.innerHeight - 4, rect.bottom, clip?.bottom ?? window.innerHeight)
    if (right <= left || bottom <= top) {
      box.hidden = true
      return
    }
    Object.assign(box.style, {
      left: `${left - 3}px`,
      top: `${top - 3}px`,
      width: `${right - left + 6}px`,
      height: `${bottom - top + 6}px`,
    })
    const owner = target.closest<HTMLElement>('.image-tool-window')
    box.style.zIndex = owner ? String(Number(owner.style.zIndex || 45) + 1) : ''
    box.textContent = label
    // A button-sized region has no room for an internal guide banner.
    box.classList.toggle('guide-compact-boundary', target.tagName.toLowerCase() === 'button')
  }
  const unhighlight = (): void => {
    highlighted?.classList.remove('guided-target')
    if (highlighted) {
      if (descriptor === null) highlighted.removeAttribute('aria-describedby')
      else highlighted.setAttribute('aria-describedby', descriptor)
    }
    regionBox.hidden = true
    actionBox.hidden = true
    highlighted = null
  }
  const element = h('section', { class: 'planning-guide', hidden: true, ariaLabel: 'Guided planning' })
  const layer = floatingLayer(element)
  const hide = () => { navigation++; active = false; unhighlight(); element.hidden = true }
  const electrode = (p:Project|null) => p?.electrodes.find(e=>e.id===ctx.selectedElectrode?.()) ?? p?.electrodes[0]
  const hardwareReady = (p:Project|null) => { const e=electrode(p);return !!e?.hardware&&setupReady(e) }
  const targetReady = (p: Project | null) => {
    const e = electrode(p)
    if (!p || !e) return false
    const targets = targetsForElectrode(p, e)
    return targets.length === 1 || targets.some(t => t.id === e.targetId)
  }
  const steps: GuideStep[] = [
    {
      feature: 'images',
      title: 'Load anatomy',
      anchor: 'Load reference MRI…',
      auto: true,
      text: 'Load a Brainana dataset, open a saved project, load a reference MRI (preferred) or CT, or try the macaque demo. Existing data can be used for this tutorial. Click a slice to move the crosshair. Hover over 3D and press the arrow keys to pan. Press R to fit the anatomy.',
      ready: (p) => !!p,
      waiting: 'Load data successfully to continue.',
    },
    {
      feature: 'images',
      title: 'Optional: add images and overlays',
      superseded: p=>!!p&&!!ctx.hasPlanningSurface?.(),
      anchor: 'Add aligned data',
      text: "In Load images, you can add an MRI, CT, functional map, atlas or skull surface that already lines up with your reference image. The app does not align files for you. An atlas can include a TSV text file with region names. Use Overlays above Anatomy to show a map or atlas. Functional maps can use a separate sub-brick to set the threshold. Check alignment in all three slices. You can skip this step if you need no extra images.",
      ready: p => !!p,
      waiting: '',
    },
    {
      feature: 'surface', title: 'Define the planning surface', anchor: 'Planning source',
      text: "Choose the skull surface the chamber will sit on. You can import an aligned skull model, build one from CT, or estimate a boundary directly from MRI or with a brain/whole-head mask. For MRI, use MRI only · dark band beneath scalp without a mask, or first load/estimate a brain region and choose a brain-based method. Check that the cyan boundary lies just beneath scalp. For CT, choose CT bone threshold in the editor header. Start with Thresholded bone mesh, adjust Bone threshold, and compare the yellow candidate voxels with the cyan surface outlines. Use Smoothing passes to soften rough bone, with Maximum smoothing movement limiting the change in millimetres. Review the cyan outlines before finalizing. Outer skull projection is an additional CT option. If the bed is included, crop it out or select skull bone with the crosshair. Use the brush to correct unwanted areas. Choose Finalize surface when ready. Openings stay open and cannot support the chamber edge.",
      ready: p => (!!p && (settings(p).mode === 'existing'||p.planningIntent==='headpost'&&!!p.headposts?.length&&p.headposts.every(h=>h.existing))) || !!ctx.hasPlanningSurface?.(), auto: true, waiting: 'Define a planning surface to continue with new chamber placement.',
    },
    {
      feature: 'targets',
      title: 'Choose a target',
      anchor: 'Add target at crosshair',
      auto: true,
      text: 'Click the intended location in a slice, then choose Add target at crosshair. Name it and check its RAS coordinates and atlas label. Use Valid target geometry to accept a sphere or painted voxels. Target color and display falloff only change its appearance.',
      ready: (p) => !!p?.targets.length,
      waiting: 'Add at least one target to continue.',
    },
    {
      feature: 'avoidance',
      title: 'Optional: draw exclusions',
      anchor: 'Draw avoidance regions',
      text: 'Choose a physical brush radius, enable Draw avoidance regions, and drag over slices. Choose 3D volume for tissue exclusions, or Snap stroke to planning surface for surface-only markings. Each stroke creates one named region. Completed strokes appear automatically; processing is shown in the bottom-right status area. Undo removes a stroke. Continue without drawing if no exclusions are needed.',
      ready: p => !!p,
      waiting: '',
    },
    {
      feature: 'chamber',
      title: 'Define your chamber',
      anchor: 'Chamber name', auto: true,
      text: 'Open Define chamber, enter its name, bore diameter, wall thickness and height, and save specifications. The separate preview shows hardware dimensions without placing it in the brain. Then define the electrode; placement is handled later.',
      ready: (p) => !!p?.chambers.length,
      waiting: 'Save chamber specifications to continue.',
    },
    {
      feature: 'electrodes', title: 'Define electrode hardware', anchor: 'Configure electrode hardware', auto: true,
      text: 'Name the electrode, then open Configure electrode hardware. Choose and customize the device, including shaft lengths, recording sites and optional guide tube. Apply at the top of the window saves all hardware specifications together. Insertion and target placement are handled in Position. If hardware is already defined, continue to Position.',
      ready: hardwareReady,
      waiting: 'Configure and apply electrode hardware to continue.',
    },
    {
      feature: 'positioning',
      title: 'Choose hardware and constraints',
      anchor: 'Choose chamber',
      text: "Select the chamber, electrode, target and areas to avoid. Normally, let the app find both the chamber location and the electrode path. Keep the chamber fixed only if it is already implanted and you know its measured position and angles. You do not need to choose a starting location for a new chamber.",
      ready: (p) => !!p?.chambers.length,
      waiting: 'Create a chamber first.',
    },
    {
      feature: 'positioning',
      title: 'Link the electrode to a target',
      anchor: 'Select target',
      auto: true,
      text: 'Select the target for this electrode. Choose the point this electrode should reach. A single eligible target is selected automatically. In Targets you can link each point to a chamber or an electrode. A chamber with explicit links only offers its assigned targets.',
      ready: targetReady,
      waiting: 'Select a planning target to continue.',
    },
    {
      feature: 'positioning',
      title: 'Set trajectory constraints',
      anchor: 'Allowed target miss (mm)',
      text: "Allowed target miss applies to a point target. With a sphere or painted voxels, the tip must be inside the selected region. Avoidance margin adds clearance around marked areas. Smaller search steps test more positions and take longer.",
      ready: (p) => !!p,
      waiting: 'Load a project first.',
    },
    {
      feature: 'positioning',
      title: 'Search and apply a placement',
      auto: true,
      text: 'In Manual, select Choose skull location to fit, then click the desired location. To compare locations across the surface, open Automatic and choose Compute placement candidates. Inspect the angle, insertion depth, target and avoidance clearance. Choose Place chamber here to apply the result.',
      ready: (p) => {
        if (!p) return false
        const e = electrode(p)
        if (!e || !hardwareReady(p) || e.direct?.unplaced || e.depth < minimumTargetInsertion(e) || e.depth > maximumInsertion(e)) return false
        const target = p.targets.find(t => t.id === e.targetId)
        const assembly = electrodeAssembly(p, e)
        if (!target || !assembly || assembly.chamber.placementState === 'unplaced') return false
        const { chamber, grid } = assembly
        const tip = trajectory(chamber, grid, e).tip
        const config = settings(p)
        const hit = target.region ? inTargetRegion(target, tip) : length(sub(tip, target.point)) <= config.maxMiss + 1e-8
        return hit
          && (e.direct || gridHoleClearance(chamber, grid, e, e.hole, e.depth) >= -1e-8)
          && clearance(p, chamber, grid, e) >= config.margin - 1e-8
      },
      waiting: 'Apply a feasible candidate, or fit a valid trajectory, to continue.',
    },
    {
      feature: 'review',
      title: 'Review and save',
      anchor: 'Object setup',
      text: "Check the hardware in Object setup. Choose an object to preview position or angle changes, then apply the changes you want to keep. Stereotaxic setup offers frames and accessories for the project species; Show all animal sizes opens the full catalog. Align the frame and ear tips to the scan, check the base plate and manipulator slides, then Apply frame. The Stereotax tab lets you save named reference points and linked distances, with signed offsets in image, frame, chamber, grid or arm axes. Measurements also appear in Review and exports. If Position finds no usable placement, Why placement failed shows the limiting values and buttons to the relevant hardware, chamber, target, surface or avoidance controls. Length feedback separates total shaft length, the section reserved above the insertion plane and usable insertion. Review and apply any specification corrections, then calculate again; constraints are not relaxed automatically. In Stereotax → Alignment, match image fiducials with measured frame readings, choose positive axis directions, calculate and review fit and independent check mismatches, then Apply alignment. The frame moves into alignment; anatomy stays fixed. Image/frame point coordinates require a current alignment. In Tools, enter each working-tip offset and current slide readings, then Record tool and readings without moving the arm. Setup changes flag affected calibration for checking. These same tools are available in evaluation. Use Overlaps in the 3D viewer to see where modeled objects intersect. Recheck each electrode’s target and clearance from marked areas. Save project keeps the images and editable plan in one file. Review offers coordinate, report and mesh exports. Use Save locally and evaluate to compare a planned shaft with a measured track. The Home screen can resume your most recent planning autosave.",
      ready: () => true,
      waiting: '',
    },
  ]
  const stepAt=(i:number):GuideStep=>{
    const project = ctx.project()
    if (i === 2 && (chamberOnlyTask(project?.planningIntent) || project?.planningIntent === 'headpost')) return {
      ...steps[i], auto: false, ready: p => !!p, waiting: '',
      text: 'Open the surface editor to import a skull mesh or build a boundary from CT or MRI. Check the boundary in the slices, then choose Finalize surface. A planning surface is needed for surface alignment. If you already have the measured position and angles, you can enter them directly in the placement controls.',
    }
    if(i===4&&project?.planningIntent?.startsWith('headpost'))return {...steps[i],feature:'headposts',title:'Define your headpost first',anchor:'Headpost name',auto:true,text:'Choose a design and fill in its missing dimensions, or import an aligned STL. Enter the base position and angles, or pick a location on the planning surface. After saving a dimensioned headpost, use Slide headpost on surface to adjust it in 3D. Mark existing headposts as Already implanted.',ready:p=>!!p?.headposts?.length,waiting:'Save a headpost to continue.'}
    if(i===7&&electrode(ctx.project())?.direct)return {...steps[i],anchor:'Choose electrode',title:'Choose electrode and constraints',text:'Select the direct-entry electrode and target. Review the avoidance priorities and margin. This workflow does not require a chamber or guide grid.',ready:p=>!!electrode(p)}
    if (i === 10 && electrode(project)?.direct) return {...steps[i], anchor: 'Compute electrode entries', title: 'Place the electrode', text: 'In Manual, choose Choose entry on 3D skull and click a location. Open Automatic to search more entries. Review the preview, then choose Place electrode here. For floating arrays, inspect the array base and the separate skull connector.'}
    if (i === 10 && project && settings(project).mode === 'existing') return {...steps[i], text: 'Choose Compute placement candidates to find a trajectory through the measured chamber. Check the proposed grid hole, insertion and clearance, then choose Apply electrode trajectory.'}
    return steps[i]
  }
  const chamberStep=steps[10]
  const originalPlacementReady=chamberStep.ready
  chamberStep.ready=p=>p&&chamberOnlyTask(p.planningIntent)?!!p.chambers.length&&p.chambers.every(c=>c.placementState!=='unplaced'):originalPlacementReady(p)
  const identity = (p:Project|null) => p ? JSON.stringify([p.id,p.frame.id,p.frame.referenceAssetId,p.assets.find(a=>a.id===p.frame.referenceAssetId)?.sha256]) : null
  const synchronizeProject = (force=false):boolean => {
    const p=ctx.project(),key=identity(p)
    if(!force&&key===projectKey)return false
    navigation++;projectKey=key;index=p?1:0;reviewing=false;lastReady=null;painted='';unhighlight()
    return true
  }
  // Definition tools can be used in any order. Placement and review require the
  // selected assembly's prerequisites; removing one routes back to its own tool.
  const requiredStep = (next:number):number => {
    const p=ctx.project()
    if(!p)return 0
    if(next===0)return 1
    const selected=electrode(p)
    const direct=selected?!!selected.direct:directPlanning(p)
    if(direct&&(next===5||next===9))return next===5?6:10
    if(p.planningIntent?.startsWith('headpost')&&next>=3&&!p.headposts?.length)return 4
    if(p.planningIntent==='headpost'&&next>=5)return 11
    if(p.planningIntent==='headpost'&&next===3)return 4
    if(settings(p).mode==='existing'&&next===2)return 3
    if(chamberOnlyTask(p.planningIntent)&&next===3)return 4
    if(chamberOnlyTask(p.planningIntent)&&next>=6){
      if(!stepAt(2).ready(p))return 2
      if(!direct&&!steps[5].ready(p))return 5
      return next>10?11:10
    }
    if(next>=7){
      if(settings(p).mode!=='existing'&&!steps[2].ready(p))return 2
      if(!steps[3].ready(p))return 3
      if(!direct&&!steps[5].ready(p))return 5
      if(!hardwareReady(p))return 6
      if(next>8&&!targetReady(p))return 8
      if(next>10&&!steps[10].ready(p))return 10
    }else if(next===6&&!direct&&!steps[5].ready(p))return 5
    return next
  }
  const nextIncomplete = (next:number):number => {
    const required=requiredStep(next)
    if(required!==next)return required
    while(next<steps.length-1&&(stepAt(next).auto||stepAt(next).superseded?.(ctx.project()))&&stepAt(next).ready(ctx.project()))next++
    return requiredStep(next)
  }
  const go = (next: number, review=false): void => {
    navigation++
    index = requiredStep(next)
    reviewing=review&&index===next&&steps[index].ready(ctx.project())
    lastReady = null
    painted = ''
    unhighlight()
    ctx.navigate(stepAt(index).feature)
    refresh()
  }
  const advance = () => go(nextIncomplete(Math.min(index+1,steps.length-1)))
  function refresh(): void {
    const changed=synchronizeProject()
    if (!active) return
    if(changed){go(index);return}
    const required=requiredStep(index)
    if(required!==index){go(required);return}
    const step = chamberOnlyTask(ctx.project()?.planningIntent)&&index===5?{...steps[index],text:'Name the chamber, enter its bore diameter, wall thickness and height, and save specifications. Define an optional guide grid here. Then use Position to place the chamber on your planning surface.'}:chamberOnlyTask(ctx.project()?.planningIntent)&&index===10?{...steps[index],title:'Place your chamber',anchor:'Placement',text:'Enter the measured position and angles, then choose Use these measurements for placement. With a planning surface, you can preview surface alignment and check the chamber edge against the skull. Save the project to reuse this chamber in electrode planning.',waiting:'Apply a chamber placement to continue.'}:stepAt(index)
    if(!reviewing&&step.superseded?.(ctx.project())){advance();return}
    const ready = step.ready(ctx.project())
    if(!ready)reviewing=false
    if (step.auto && !reviewing && lastReady === false && ready && index < steps.length - 1) {
      advance()
      return
    }
    lastReady = ready
    const project=ctx.project()
    const mode = project ? settings(project).mode : 'new'
    const anchorName =
      step.anchor ??
      (step.title === 'Choose hardware and constraints'
        ? mode === 'new'
          ? 'Prefer access near crosshair (optional)'
          : 'R (mm)'
        : mode === 'new'
          ? 'Compute placement candidates'
          : 'Compute placement candidates')
    const anchor = Array.from(
      document.querySelectorAll<HTMLElement>(
        '.welcome:not([hidden]) button, .feature-panel button, .feature-panel input, .feature-panel select, .feature-panel h3, .top-actions button, .view-pane select, .surface-editor-window select, .surface-editor-window button',
      ),
    ).find(
      (el) =>
        el.offsetWidth > 0 &&
        (el.getAttribute('aria-label') === anchorName ||
          el.textContent?.trim() === anchorName ||
          el.closest('label')?.querySelector('span')?.textContent === anchorName),
    )
    const placementAction = index === 10 && !chamberOnlyTask(project?.planningIntent)
      ? Array.from(document.querySelectorAll<HTMLElement>('.placement-preview:not([hidden]) .primary, .feature-panel [data-guide-placement-action]'))
        .find(element => element.offsetWidth > 0)
      : undefined
    const liveAnchor =
      placementAction ?? anchor ??
      (step.feature === 'surface' ? document.querySelector<HTMLElement>('.surface-source-controls') ?? Array.from(document.querySelectorAll<HTMLElement>('.feature-panel button')).find(el => el.textContent === 'Open surface editor…') ?? null : null) ??
      (step.title === 'Inspect the device layout'
        ? Array.from(document.querySelectorAll<HTMLElement>('.feature-panel h3')).find(
            (el) => el.textContent === 'Shaft specifications',
          )
        : null) ??
      (step.title === 'Optional: draw exclusions'
        ? Array.from(document.querySelectorAll<HTMLElement>('.feature-panel button')).find(
            (b) => b.textContent === 'Finish drawing regions',
          )
        : null) ??
      (step.title === 'Load anatomy' ? document.querySelector<HTMLElement>('.start-project') : document.querySelector<HTMLElement>('.feature-panel .control-section'))
    if (highlighted !== liveAnchor) {
      unhighlight()
      highlighted = liveAnchor ?? null
      descriptor = highlighted?.getAttribute('aria-describedby') ?? null
      highlighted?.setAttribute('aria-describedby', 'planning-guide-instruction')
      if (step.anchor !== 'Add aligned data' && step.title !== 'Load anatomy') highlighted?.classList.add('guided-target')
      highlighted?.scrollIntoView({ block: 'center', inline: 'nearest' })
    }
    const region =
      step.feature === 'surface' ? document.querySelector<HTMLElement>('.surface-source-controls') ?? Array.from(document.querySelectorAll<HTMLElement>('.feature-panel button')).find(el => el.textContent === 'Open surface editor…') ?? null : step.title === 'Load anatomy' && !ctx.project()
        ? document.querySelector<HTMLElement>('.start-project')
        : (highlighted?.closest<HTMLElement>('.control-section') ??
          highlighted?.closest<HTMLElement>('.placement-preview') ??
          highlighted?.closest<HTMLElement>('.top-actions') ??
          highlighted?.closest<HTMLElement>('.view-pane header') ??
          null)
    bound(regionBox, region, `${index + 1}. ${step.title}`)
    bound(
      actionBox,
      step.anchor === 'Add aligned data' || step.title === 'Load anatomy' || (step.feature === 'surface' && highlighted === region) ? null : highlighted?.closest<HTMLElement>('label') ?? highlighted,
      step.auto ? 'Complete to continue' : 'Review / adjust here',
    )
    const key = `${index}:${ready}:${mode}:${step.title}:${step.text}`
    if (painted === key) return
    painted = key
    const next = button(
      index === steps.length - 1 ? 'Finish tutorial' : 'Next step',
      () => {
        if (index === steps.length - 1) {
          hide()
          index = ctx.project()?1:0
          reviewing=false
        } else advance()
      },
      'primary',
    )
    next.disabled = !ready
    next.title = step.auto
      ? 'Continues automatically after the required action succeeds; use Next for existing data.'
      : 'Confirm this section when you have finished reviewing all fields.'
    const back = button('Back', () => go(index - 1,true))
    back.disabled = index <= (ctx.project()?1:0)
    const close = button('×', hide)
    close.className = 'guide-close'
    close.setAttribute('aria-label', 'Close guided planning')
    element.replaceChildren(
      close,
      h('span', { class: 'eyebrow' }, [`GUIDED PLANNING · ${index + 1} / ${steps.length}`]),
      h('h2', { tabIndex: 0, title: 'Drag to move the guide, or use arrow keys' }, [step.title]),
      h('div', {class:'guide-instructions'}, [h('p', { class: 'note', id: 'planning-guide-instruction', ariaLive: 'polite' }, [step.text]),
      ...(!ready ? [note(step.waiting)] : []),
      note(
        step.auto
          ? 'Completing this action continues automatically. For existing data, choose Next step.'
          : 'Choose Next step when ready.',
      ),
      ]),
      h('div', {class:'guide-footer'}, [h('div', { class: 'button-row' }, [back, next]),
      h('div', { class: 'button-row' }, [
        button('Show controls', () => {
          ctx.navigate(step.feature)
          highlighted?.scrollIntoView({ block: 'center' })
          refresh()
        }),
        button('Restart tutorial', () => go(ctx.project()?1:0)),
        button('Hide tutorial', hide),
      ])]),
    )
  }
  // The guide can be moved away from the anatomy being inspected.
  let drag: { id: number; x: number; y: number; left: number; top: number } | null = null
  const position = (left: number, top: number): void => {
    const bounds = element.getBoundingClientRect()
    element.style.right = 'auto'
    element.style.bottom = 'auto'
    element.style.left = `${Math.max(8, Math.min(left, window.innerWidth - bounds.width - 8))}px`
    element.style.top = `${Math.max(8, Math.min(top, window.innerHeight - bounds.height - 8))}px`
  }
  element.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !(event.target as HTMLElement).matches('h2, .eyebrow')) return
    const bounds = element.getBoundingClientRect()
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: bounds.left, top: bounds.top }
    element.setPointerCapture(event.pointerId)
    event.preventDefault()
  })
  element.addEventListener('pointermove', (event) => {
    if (drag?.id === event.pointerId)
      position(drag.left + event.clientX - drag.x, drag.top + event.clientY - drag.y)
  })
  element.addEventListener('pointerup', () => {
    drag = null
  })
  element.addEventListener('pointercancel', () => {
    drag = null
  })
  element.addEventListener('keydown', (event) => {
    if (!(event.target as HTMLElement).matches('h2') || !event.key.startsWith('Arrow')) return
    const bounds = element.getBoundingClientRect()
    position(
      bounds.left + (event.key === 'ArrowRight' ? 20 : event.key === 'ArrowLeft' ? -20 : 0),
      bounds.top + (event.key === 'ArrowDown' ? 20 : event.key === 'ArrowUp' ? -20 : 0),
    )
    event.preventDefault()
  })
  window.addEventListener('resize', () => {
    if (active) {
      const r = element.getBoundingClientRect()
      position(r.left, r.top)
    }
  })
  // Follow sidebar navigation after its click handler. Completion is driven solely
  // by committed project state, never by clicking an input or opening a dialog.
  const committed = (event: Event): void => {
    if (!active) return
    const target = event.target as HTMLElement
    const feature = target.closest<HTMLElement>('button[data-feature]')?.dataset.feature
    if (feature && feature !== stepAt(index).feature) {
      const matching = steps.findIndex((_,i) => stepAt(i).feature === feature)
      if (matching >= 0) {
        const session=projectKey,request=++navigation
        setTimeout(()=>{if(active&&session===projectKey&&request===navigation)go(matching,true)},0)
      }
      return
    }
  }

  document.addEventListener('click', committed, true)
  window.setInterval(refresh, 250)
  document.addEventListener('scroll', refresh, true)
  document.addEventListener('planning-window-move', refresh)
  document.addEventListener('keydown', (event) => {
    if (active && event.key === 'Escape') {
      hide()
    }
  })
  return {
    element,
    start: () => {
      synchronizeProject()
      if(active){layer.activate();refresh();return}
      const resume=reviewing?requiredStep(index):nextIncomplete(index)
      active = true
      element.hidden = false
      go(resume,reviewing)
      layer.activate()
    },
    refresh,
    projectChanged:(preserveProgress=false)=>{if(preserveProgress){refresh();return}synchronizeProject(true);if(active)go(index)},
  }
}
