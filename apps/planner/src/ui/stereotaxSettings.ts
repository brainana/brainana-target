import { armStageControls, basePlateControls, earBlockControls, stereotaxAdjustment } from './stereotaxControls.ts'
import { createStereotax, frameChoices, defaultPlateForFrame, speciesEarBars, standardArm, adaptorTravel, speciesAdaptors, armModelChoices, includedManipulators } from '@brainana/planning-core/stereotaxSetup.ts'
import { speciesLabels } from '@brainana/planning-core/model.ts'
import { localToWorld, worldToLocal } from '@brainana/planning-core/geometry.ts'
import { h } from '@brainana/ui/dom.ts'
import type { Stereotax, StereotaxArm, Vec3, Species } from '@brainana/planning-core/model.ts'
import { biteBarFields, compatibleBiteAdaptors, compatibleEarBars, customFrameFields, defaultEarBar, earBarSource, frameDimensions, frameOffsetOptions, editableFrame, measuredFrameSpecs, manipulatorPresets, singleRail, singleRailFields, stereotaxPresets, type BiteBar, type FrameDimensions, type ManipulatorPreset } from '@brainana/planning-core/stereotax.ts'
import { button, errorDialog, note, section } from './controls.ts'
import { floatingWindow } from './floatingWindow.ts'

interface Options {
  current: () => { key: string; stereotax?: Stereotax; species?: Species } | null
  crosshair: () => Vec3
  center: () => Vec3
  viewer: HTMLElement
  preview?: (rig?: Stereotax) => void
  locate?: (point: Vec3) => void
  scopeNote?: string
  save: (rig: Stereotax | undefined) => boolean
  fit: () => void
  overlaps?: { current: () => boolean; set: (enabled: boolean) => void }
}

export function stereotaxSettings(options: Options): () => void {
  let editor: ReturnType<typeof floatingWindow> | null = null
  let editorKey: string | undefined
  return () => {
    const project = options.current()
    if (!project) return
    if (editor && editorKey === project.key) {
      editor.activate()
      return
    }
    editor?.close()
    editorKey = project.key
    let lastApplied = JSON.stringify(project.stereotax)
    const draft: Stereotax = project.stereotax ? structuredClone(project.stereotax) : createStereotax(project.species, options.center())
    let showAll = !project.species || project.species === 'other'
    const form = h('form', { id: 'stereotax-settings-form', class: 'stereotax-editor' })
    const apply = h('button', { class: 'primary', type: 'submit' }, ['Apply frame'])
    apply.setAttribute('form', form.id)
    const fit = button('Fit frame', options.fit)
    fit.disabled = !project.stereotax
    let pendingPreview = 0, fitOnNextPreview = false
    const applied = note('')
    applied.setAttribute('role', 'status')

    const isCurrent = () => {
      const active = options.current()
      if (active?.key === project.key && JSON.stringify(active.stereotax) === lastApplied) return true
      editor?.close()
      errorDialog('The reference or stereotaxic setup changed. Reopen Stereotaxic setup to edit the current values.')
      return false
    }

    const preset = h('select')
    const filterNote = note('')
    const allModels = h('input',{type:'checkbox',checked:showAll,ariaLabel:'Show all animal sizes'})
    const populatePresets = () => {
      const ids = showAll ? Object.keys(stereotaxPresets) : frameChoices(project.species)
      const savedOutside = draft.preset !== 'custom' && !ids.includes(draft.preset)
      preset.replaceChildren(...ids.map(id=>h('option',{value:id},[stereotaxPresets[id as keyof typeof stereotaxPresets].name])),
        ...(savedOutside?[h('option',{value:draft.preset},[stereotaxPresets[draft.preset as keyof typeof stereotaxPresets].name+' · saved setup'])]:[]),h('option',{value:'custom'},['Custom dimensions']))
      preset.value=draft.preset
      filterNote.textContent = showAll || !project.species || project.species === 'other' ? 'Showing every animal-size family.' : `Models for ${speciesLabels[project.species]}. ${project.species==='tree-shrew'?'Small-animal frames are suggested by size; confirm the adaptor and ear-tip fit. ':''}${savedOutside?'Your saved frame is retained even though it is outside this list.':''}`
    }
    allModels.addEventListener('change',()=>{showAll=allModels.checked;populatePresets();syncAccessories()})
    populatePresets()
    const frameSource = h('a', { target: '_blank', rel: 'noopener noreferrer' }, ['Manufacturer frame specifications'])
    const details = note('')
    const field = (label: string, input: HTMLElement) => {
      input.setAttribute('aria-label', label)
      return h('label', { class: 'field' }, [h('span', {}, [label]), input])
    }
    const dimension = (label: string, value: number, min: number, max: number, update: (value: number) => void) => {
      const input = h('input', { type: 'number', value: String(value), min: String(min), max: String(max), step: 'any', required: true })
      input.addEventListener('input', () => { update(input.valueAsNumber); schedulePreview() })
      return { element: field(label, input), input }
    }
    const originalDimensions = frameDimensions(draft)
    const customValues = Object.fromEntries(customFrameFields.map(([, key]) => [key, originalDimensions[key]])) as FrameDimensions
    const armPositions: HTMLInputElement[] = []
    const customFields = customFrameFields.map(([label, key, min, max]) =>
      dimension(label, customValues[key], min, max, value => {
        customValues[key] = value
        syncLimits()
      }),
    )
    const custom = h('div', {}, customFields.map(field => field.element))
    const syncLimits = () => {
      const dimensions = frameDimensions(draft)
      earSpacing.input.max = String(Math.max(0, singleRail(draft.preset)
        ? (draft.earSupportSpanMm ?? dimensions.spacingMm) - .1 : dimensions.spacingMm - dimensions.widthMm))
      for (const input of armPositions) {
        input.min = String(-dimensions.posteriorMm)
        input.max = String(dimensions.lengthMm - dimensions.posteriorMm)
      }
    }
    const syncPreset = () => {
      const dimensions = frameDimensions(draft)
      const namedPreset = draft.preset === 'custom' ? undefined : stereotaxPresets[draft.preset]
      custom.hidden = !editableFrame(draft.preset)
      custom.querySelectorAll('input').forEach(input => { input.disabled = custom.hidden })
      frameSource.hidden = !namedPreset
      if (namedPreset) frameSource.href = namedPreset.source
      const published = measuredFrameSpecs[draft.preset as keyof typeof measuredFrameSpecs]
      details.textContent = published
        ? published + ' Measure your rail spacing, length and position to refine the preview.'
        : namedPreset
        ? singleRail(draft.preset)
          ? `${dimensions.lengthMm} mm single rail · ${dimensions.widthMm} mm square. Enter the support span and rail position measured on your setup.`
          : `${dimensions.lengthMm} mm rails · ${dimensions.spacingMm} mm between rail centers`
        : 'Enter the dimensions of your frame. Rail spacing is measured between rail centers.'
      if(singleRail(draft.preset))draft.earSupportSpanMm??=dimensions.spacingMm
      for(const [key,input] of singleInputs)input.value=String(draft[key]??(key==='earSupportSpanMm'?dimensions.spacingMm:0))
      baseControls.refresh();earOffsets.refresh()
      singleRailGroup.hidden = !singleRail(draft.preset)
      singleRailGroup.querySelectorAll('input').forEach(input => { input.disabled = singleRailGroup.hidden })
      syncLimits()
      syncAccessories()
      renderArms()
    }
    preset.addEventListener('change', () => {
      const wasSingle = singleRail(draft.preset)
      draft.preset = preset.value as Stereotax['preset']
      if (singleRail(draft.preset) && !wasSingle && draft.railDropMm === 0) {
        draft.railDropMm = 35
        railDrop.input.value = '35'
      }
      if (editableFrame(draft.preset)) {
        if (draft.preset !== 'custom') {
          const defaults = stereotaxPresets[draft.preset]
          customFrameFields.forEach(([, key], i) => { customFields[i].input.value = String(customValues[key] = defaults[key]) })
        }
        draft.dimensions = customValues
      } else delete draft.dimensions
      if (draft.preset !== 'custom') {draft.basePlate=defaultPlateForFrame(draft.preset);draft.arms=includedManipulators(draft.preset)}
      if (!availableBars().some(bar => bar.id === draft.earBarId))
        draft.earBarId = availableBars().find(bar=>bar.id===(project.species==='mouse'?'922':draft.preset==='custom'?'':defaultEarBar[draft.preset]))?.id??availableBars()[0]?.id
      if (draft.biteBar && !compatibleBiteAdaptors(draft.preset).some(adaptor => adaptor.id === draft.biteBar?.adaptorId))
        delete draft.biteBar
      syncPreset()
      schedulePreview()
    })
    if (editableFrame(draft.preset)) draft.dimensions = customValues

    const origin = ['R', 'A', 'S'].map((axis, i) => dimension(`${axis} (mm)`, draft.pose.origin[i], -10000, 10000, v => { draft.pose.origin[i] = v }))
    const angles = ['X', 'Y', 'Z'].map((axis, i) => dimension(`Rotate ${axis} (°)`, draft.pose.angles[i], -360, 360, v => { draft.pose.angles[i] = v }))
    const group = (fields: typeof origin) => h('div', { class: 'triple' }, fields.map(f => f.element))
    const bars = h('input', { type: 'checkbox', checked: draft.showEarBars ?? draft.earTipSpacingMm > 0, ariaLabel: 'Show ear bars' })
    draft.showEarBars = bars.checked
    let visibilityChosen = project.stereotax?.showEarBars !== undefined
    bars.addEventListener('change', () => {
      visibilityChosen = true
      draft.showEarBars = bars.checked
      schedulePreview()
    })
    const earSpacing = dimension('Ear-tip spacing (mm)', draft.earTipSpacingMm, 0, 0, value => {
      draft.earTipSpacingMm = value
      earOffsets.refresh()
      if (value > 0 && !visibilityChosen) draft.showEarBars = bars.checked = true
    })
    const railDrop = dimension('Rail center below origin (mm)', draft.railDropMm, -200, 200, value => { draft.railDropMm = value })
    const singleInputs=new Map<typeof singleRailFields[number][1],HTMLInputElement>()
    const singleRailGroup = h('div', {}, singleRailFields.map(([label, key, min, max]) => {
      const control=dimension(label,draft[key]??(key==='earSupportSpanMm'?frameDimensions(draft).spacingMm:0),min,max,value=>{draft[key]=value;syncLimits();earOffsets.refresh()})
      singleInputs.set(key,control.input);return control.element
    }))
    const baseControls=basePlateControls(draft,schedulePreview)
    const earOffsets=earBlockControls(draft,options.crosshair,schedulePreview,()=>{earSpacing.input.value=String(draft.earTipSpacingMm)})
    const availableBars=()=>{const filtered=showAll?compatibleEarBars(draft.preset):speciesEarBars(draft.preset,project.species);return filtered.length?filtered:compatibleEarBars(draft.preset)}
    const availableAdaptors=()=>showAll?compatibleBiteAdaptors(draft.preset):speciesAdaptors(draft.preset,project.species)
    const earModel = h('select')
    const earDetails = note('')
    const earLink = h('a', { href: earBarSource, target: '_blank', rel: 'noopener noreferrer' }, ['Manufacturer ear-bar specifications'])
    const rise = h('select')
    const riseLink = h('a', { target: '_blank', rel: 'noopener noreferrer', hidden: true }, ['Kopf riser specifications'])
    const biteModel = h('select')
    const biteFields = h('div')
    const biteStatus = note('')
    const biteInputs = new Map<typeof biteBarFields[number][1], HTMLInputElement>()
    const biteDetails = note('')
    const biteLink = h('a', { target: '_blank', rel: 'noopener noreferrer', hidden: true }, ['Manufacturer adaptor specifications'])
    const updateEarDetails = () => {
      const profile = compatibleEarBars(draft.preset).find(bar => bar.id === draft.earBarId)
      earLink.href = profile?.source ?? earBarSource
      earDetails.textContent = profile?.length ? `Published length ${profile.length} mm. Shaft width and unpublished tip dimensions are editable approximations.` : profile ? `${profile.width} mm square shaft · ${profile.scale} mm calibration scale${profile.taper?` · ${profile.taper}° tip`:''}${profile.radius?` · ${profile.radius} mm tip radius`:''}${profile.aperture?` · ${profile.aperture} mm auditory bore`:''}` : 'Square bars use the width specified for the frame.'
    }
    const updateBiteFields = () => {
      const bite = draft.biteBar
      const adaptor = compatibleBiteAdaptors(draft.preset).find(item => item.id === bite?.adaptorId)
      biteLink.hidden = !adaptor?.source
      if (adaptor?.source) biteLink.href = adaptor.source
      biteDetails.hidden = !adaptor
      biteDetails.textContent = adaptor?.travel ? 'Published adjustment travel. ' + adaptor.travel + '.' : ''
      biteInputs.clear()
      if (!bite) { biteFields.replaceChildren(); biteStatus.textContent = ''; return }
      const motion=adaptorTravel(bite.adaptorId)
      const fields = biteBarFields.map(([label, key, min, max]) => {
        const field = key==='heightMm'&&motion?.dv ? (()=>{
          const element=stereotaxAdjustment(label,bite[key],Math.min(motion.dv[0],bite[key]),Math.max(motion.dv[1],bite[key]),.1,value=>{bite[key]=value;schedulePreview()})
          return {element,input:element.querySelector<HTMLInputElement>('input[type="number"]')!}
        })() : dimension(label, bite[key], min, max, value => { bite[key] = value })
        biteInputs.set(key, field.input)
        if (key === 'lengthMm' || key === 'widthMm' || key === 'thicknessMm')
          field.input.placeholder = `Preview ${bitePreviewSize[key]} mm`
        return field
      })
      const locateBite = button('Use crosshair for bite contact', () => {
        const [x, y, z] = worldToLocal(draft.pose, options.crosshair())
        bite.lateralMm = x
        bite.apMm = y - (bite.apOffsetMm ?? 0)
        bite.heightMm = z
        fields.slice(0, 3).forEach(({element}, i) => { for (const input of element.querySelectorAll('input')) input.value = String([x, bite.apMm, z][i]) })
        schedulePreview()
      })
      biteFields.replaceChildren(locateBite, ...fields.map(item => item.element),
        ...(motion?[stereotaxAdjustment('Adaptor A/P travel offset (mm)',bite.apOffsetMm??0,-motion.ap/2,motion.ap/2,.1,value=>{bite.apOffsetMm=value;schedulePreview()}),note(`Published A/P travel ${motion.ap} mm. The offset is relative to the contact position entered above.${motion.dv?` Published tooth-bar height range ${motion.dv[0]} to ${motion.dv[1]} mm relative to ear zero.`:''}`)]:[]),
        note('Contact coordinates are relative to the frame origin. The A/P travel offset is added to the front/back contact coordinate.'), biteStatus)
    }
    function syncAccessories(): void {
      const option = (value: string, label: string) => h('option', { value }, [label])
      earModel.replaceChildren(option('', 'Straight square bars'), ...[...availableBars(),...compatibleEarBars(draft.preset).filter(bar=>bar.id===draft.earBarId&&!availableBars().includes(bar))].map(bar => option(bar.id, bar.name)))
      earModel.value = draft.earBarId ?? ''
      const offsets = frameOffsetOptions.filter(item => item.frames.includes(draft.preset))
      rise.replaceChildren(option('', 'Set rail height manually'), ...offsets.map(item => option(item.id, item.name)))
      rise.hidden = !offsets.length
      rise.parentElement?.toggleAttribute('hidden', !offsets.length)
      riseLink.hidden = true
      biteModel.replaceChildren(option('', 'None'), ...[...availableAdaptors(),...compatibleBiteAdaptors(draft.preset).filter(item=>item.id===draft.biteBar?.adaptorId&&!availableAdaptors().includes(item))].map(adaptor => option(adaptor.id, adaptor.name)))
      biteModel.value = draft.biteBar?.adaptorId ?? ''
      updateEarDetails()
      updateBiteFields()
    }
    earModel.addEventListener('change', () => {
      if (earModel.value) draft.earBarId = earModel.value
      else delete draft.earBarId
      updateEarDetails()
      schedulePreview()
    })
    rise.addEventListener('change', () => {
      const offset = frameOffsetOptions.find(item => item.id === rise.value)
      riseLink.hidden = !offset
      if (!offset) return
      riseLink.href = offset.source
      draft.railDropMm = offset.rise
      railDrop.input.value = String(offset.rise)
      if (offset.id === '866') {
        draft.biteBar = { ...(draft.biteBar ?? newBite()), adaptorId: '866' }
        biteModel.value = '866'
        updateBiteFields()
        fitOnNextPreview = true
      }
      schedulePreview()
    })
    const bitePreviewSize = { lengthMm: 20, widthMm: 8, thicknessMm: 3 }
    const newBite = (): BiteBar => ({
      adaptorId: 'custom', lateralMm: 0, apMm: singleRail(draft.preset) ? 15 : 35,
      heightMm: singleRail(draft.preset) ? -8 : -18, lengthMm: NaN, widthMm: NaN, thicknessMm: NaN,
    })
    biteModel.addEventListener('change', () => {
      if (biteModel.value) {
        fitOnNextPreview = !draft.biteBar
        draft.biteBar = { ...(draft.biteBar ?? newBite()), adaptorId: biteModel.value }
      } else delete draft.biteBar
      updateBiteFields()
      schedulePreview()
    })
    function validCustom(): boolean {
      return !editableFrame(draft.preset) || customValues.posteriorMm <= customValues.lengthMm && customValues.widthMm < customValues.spacingMm
    }
    function schedulePreview(): void {
      if (!options.preview) return
      cancelAnimationFrame(pendingPreview)
      pendingPreview = requestAnimationFrame(() => {
        pendingPreview = 0
        const active = options.current()
        if (active?.key !== project!.key || JSON.stringify(active.stereotax) !== lastApplied) return
        const invalid = [...form.querySelectorAll('input:invalid')]
        const biteDraft = draft.biteBar
        const needsBiteMeasurements = !!biteDraft && Object.keys(bitePreviewSize).some(key =>
          !Number.isFinite(biteDraft[key as keyof typeof bitePreviewSize]))
        biteStatus.textContent = needsBiteMeasurements ? 'The bite bar is shown with illustrative dimensions. Enter its measured length, width and thickness to apply it.' : ''
        if (!validCustom() || invalid.some(input => !biteFields.contains(input))) {
          applied.textContent = 'Check the frame and arm measurements to update the preview.'
          return
        }
        const preview = structuredClone(draft)
        if (preview.biteBar) {
          for (const [key, input] of biteInputs) {
            if (input.checkValidity()) continue
            if (key === 'lengthMm' || key === 'widthMm' || key === 'thicknessMm') preview.biteBar[key] = bitePreviewSize[key]
            else { delete preview.biteBar; break }
          }
        }
        options.preview?.(preview)
        fit.disabled = false
        if (fitOnNextPreview) { fitOnNextPreview = false; options.fit() }
        applied.textContent = 'Frame preview. Apply frame to keep these settings.'
      })
    }
    const arms = h('div', { class: 'stereotax-arms' })
    const addArm = button('Add arm', () => {
      fitOnNextPreview = draft.arms.length === 0
      draft.arms.push(standardArm(draft.preset,draft.arms.length%2?'right':'left'))
      renderArms()
      schedulePreview()
    })
    function renderArm(arm: StereotaxArm, index: number): HTMLElement {
      const side = h('select', {}, [h('option', { value: 'left' }, [singleRail(draft.preset) ? 'Reach right' : 'Left rail']), h('option', { value: 'right' }, [singleRail(draft.preset) ? 'Reach left' : 'Right rail'])])
      side.value = arm.side
      side.addEventListener('change', () => { arm.side = side.value === 'left' ? 'left' : 'right'; schedulePreview() })
      const ap = dimension('A/P (mm)', arm.apMm, 0, 0, v => { arm.apMm = v })
      armPositions.push(ap.input)
      const models = h('select', {}, [
        h('option', { value: '' }, ['Custom arm']),
        ...[...armModelChoices(draft.preset),...(arm.model&&!armModelChoices(draft.preset).includes(arm.model)?[arm.model]:[])].map(value=>h('option',{value},[manipulatorPresets[value].name])),
      ])
      models.value = arm.model ?? ''
      models.addEventListener('change', () => {
        arm.model = (models.value || undefined) as ManipulatorPreset | undefined
        arm.stageXmm=arm.stageYmm=arm.stageZmm=0
        renderArms()
        schedulePreview()
      })
      const spec = arm.model ? manipulatorPresets[arm.model] : undefined
      return h('fieldset', {}, [
        h('legend', {}, [`Arm ${index + 1}`]),
        field('Manipulator model', models),
        ...(spec ? [note(spec.travel + ('size' in spec && Array.isArray(spec.size) ? ` · overall W × D × H ${spec.size.join(' × ')} mm` : '')),
          h('a', { href: spec.source, target: '_blank', rel: 'noopener noreferrer' }, ['Manipulator specifications'])] : []),
        field(singleRail(draft.preset) ? 'Arm direction' : 'Mounting rail', side),
        armStageControls(draft,arm,schedulePreview,options.locate),
        group([
          ap,
          dimension('Rise (mm)', arm.heightMm, 1, 200, v => { arm.heightMm = v }),
          dimension(singleRail(draft.preset) ? 'Lateral reach (mm)' : 'Inward (mm)', arm.reachMm, 0, 200, v => { arm.reachMm = v }),
        ]),
        h('details', {}, [h('summary', {}, ['Link dimensions and angles']),
          group([
            dimension('Post width (mm)', arm.postWidthMm ?? 10, 1, 200, v => { arm.postWidthMm = v }),
            dimension('Link width (mm)', arm.linkWidthMm ?? 8, 1, 200, v => { arm.linkWidthMm = v }),
          ]),
          group([
            dimension('Swivel from inward (°)', arm.azimuthDeg ?? 0, -180, 180, v => { arm.azimuthDeg = v }),
            dimension('Elevation from horizontal (°)', arm.elevationDeg ?? 0, -90, 90, v => { arm.elevationDeg = v }),
          ]),
        ]),
        button('Remove arm', () => { draft.arms.splice(index, 1); renderArms(); schedulePreview() }),
      ])
    }
    function renderArms(): void {
      armPositions.length = 0
      arms.replaceChildren(...draft.arms.map(renderArm))
      syncLimits()
      addArm.disabled = draft.arms.length >= 4
    }
    renderArms()
    syncPreset()
    const remove = button('Remove frame', () => {
      if (isCurrent() && options.save(undefined)) editor?.close()
    }, 'danger')
    remove.hidden = !project.stereotax
    form.append(
      applied,
      ...(options.scopeNote ? [note(options.scopeNote)] : []),
      section('Frame', [filterNote,h('label',{},[allModels,'Show all animal sizes']),field('Model', preset), details, frameSource, custom, singleRailGroup]),
      section('Base plate', [baseControls.element]),
      section('Align to anatomy', [
        note('New frames start at the anatomy center. To align your setup, set the origin to the measured midpoint between the ear-bar tips and enter the frame rotation.'),
        button('Center on anatomy', () => {
          draft.pose.origin = options.center()
          origin.forEach((field, i) => { field.input.value = String(draft.pose.origin[i]) })
          schedulePreview()
        }),
        button('Use crosshair as origin', () => {
          draft.pose.origin = options.crosshair()
          origin.forEach((field, i) => { field.input.value = String(draft.pose.origin[i]) })
          schedulePreview()
        }),
        group(origin), group(angles),
        railDrop.element,
        field('Kopf ear-bar riser', rise), riseLink,
      ]),
      section('Ear bars', [
        field('Ear-bar model', earModel), earDetails, earLink,
        h('label', {}, [bars, 'Show ear bars']),
        earSpacing.element,earOffsets.element,
        ...(options.locate ? [button('Locate ear-tip midpoint in slices', () => options.locate?.(localToWorld(draft.pose, [draft.earTipCenterMm ?? 0, ((draft.earBlockOffsets?.left.apMm ?? 0) + (draft.earBlockOffsets?.right.apMm ?? 0)) / 2, ((draft.earBlockOffsets?.left.heightMm ?? 0) + (draft.earBlockOffsets?.right.heightMm ?? 0)) / 2])))] : []),
        note('Ear bars are teal in 3D and in the slices. At zero spacing the tips meet when the bars are shown.'),

      ]),
      section('Bite bar', [field('Bite-bar adaptor', biteModel), biteDetails, biteLink, biteFields]),
      section('Manipulator arms', [
        note('Each arm shows its rail clamp, universal joint, XYZ slides, controls and holder. Assembly location positions the whole arm; stage offsets move its slides. Positive A/P is anterior to the ear-bar plane.'),
        arms, addArm,
      ]),
      h('label',{},[h('input',{type:'checkbox',checked:draft.showDetails!==false,ariaLabel:'Show controls and graduation marks',onchange:(event:Event)=>{draft.showDetails=(event.target as HTMLInputElement).checked;schedulePreview()}}),'Show controls and graduation marks']),
      note('Published dimensions set the footprint and travel. Unpublished casing, support and knob shapes are schematic. The drawings show approximate occupied space. Enter measured rail, link and accessory dimensions to match your setup.'),
      remove,
    )
    form.addEventListener('submit', event => {
      event.preventDefault()
      if (!validCustom()) {
        applied.textContent = 'Rail length behind the ear bars must fit within the total length, and rail spacing must exceed rail width.'
        return
      }
      cancelAnimationFrame(pendingPreview)
      pendingPreview = 0
      if (isCurrent() && options.save(structuredClone(draft))) {
        lastApplied = JSON.stringify(draft)
        options.preview?.(undefined)
        applied.textContent = 'Frame applied.'
        remove.hidden = false
        fit.disabled = false
      }
    })
    editor = floatingWindow('Stereotaxic setup', 'Stereotaxic setup', () => {
      cancelAnimationFrame(pendingPreview)
      editor = null
      options.preview?.(undefined)
    })
    if (options.overlaps) {
      if (!project.stereotax) options.overlaps.set(true)
      const overlaps = button('Show overlaps', () => {
        options.overlaps!.set(!options.overlaps!.current())
        overlaps.setAttribute('aria-pressed', String(options.overlaps!.current()))
      })
      overlaps.setAttribute('aria-pressed', String(options.overlaps.current()))
      overlaps.title = 'Show intersections with modeled anatomy and hardware as red regions.'
      editor.actions.append(overlaps)
    }
    editor.actions.append(fit, apply)
    editor.content.append(form)
    syncAccessories()
    schedulePreview()
    editor.placeBeside(options.viewer)
  }
}
