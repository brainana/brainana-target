import {assetDerivation} from './assetDerivation.ts'
import { functionalRange, functionalSurfaceData, functionalVolumeData } from '../render/functionalMap.ts'
import {bytesView} from '../data/buffers.ts'
import { ctDefaults } from '../render/ctDefaults.ts'
import { VolumeSampler } from '../render/volume.ts'
import { imageBounds } from '../render/ctSkull.ts'
import { validateProject } from '@brainana/planning-core/validation.ts'
import { h } from '@brainana/ui/dom.ts'
import type { Asset, Project } from '@brainana/planning-core/model.ts'
import { NVImage } from '@niivue/niivue'
import { createAsset, type AssetBytes } from '../data/assets.ts'
import { button, chooseFile, errorDialog, note, selectField } from './controls.ts'
import { hoverHelp } from './hoverHelp.ts'
import { floatingWindow } from './floatingWindow.ts'
export function imageFiles(options: {
  project: () => Project | null
  bytes: AssetBytes | (() => AssetBytes)
  edit: (change: (p: Project) => void, group?: string) => void
  atlas: (id?: string) => void
  loadAtlas: () => void
  surfaceVertexCount: (id: string) => number
  image: (id: string) => NVImage | undefined
  openPlanningSurface?: () => void
  defaults: (id: string) => NonNullable<Asset['imageDisplay']> | undefined
}) {
  const data = () => (typeof options.bytes === 'function' ? options.bytes() : options.bytes)
  const selector = h('select', { ariaLabel: 'Anatomical image' })
  const hint = h('span', { class: 'anatomy-picker-hint' })
  const picker = h('div', { class: 'anatomy-picker' }, [h('label', {}, ['View image', selector]), hint])
  selector.addEventListener('change', () =>
    options.edit((p) => {
      const previous = p.display.anatomyAssetId ?? p.frame.referenceAssetId
      if (p.display.anatomyOverlayIds?.includes(selector.value)) {
        p.display.anatomyOverlayIds = [...new Set([...p.display.anatomyOverlayIds.filter(id => id !== selector.value), previous])]
      }
      p.display.anatomyAssetId = selector.value
    }),
  )
  const blend = h('input', { type: 'checkbox', ariaLabel: 'Blend other MRI and CT images' })
  blend.addEventListener('change', () => options.edit(p => {
    const selected = p.display.anatomyAssetId ?? p.frame.referenceAssetId
    p.display.anatomyOverlayIds = blend.checked ? p.assets.filter(anatomical).filter(a => a.id !== selected).map(a => a.id) : []
  }))
  const blendField = h('label', { title: "Show other aligned MRI or CT images over the selected image. Adjust their transparency in Overlays." }, [blend, 'Blend images'])
  picker.append(blendField)
  const quick = h('div',{class:'image-quick-controls'})
  let quickGroup='image-quick',quickTimer:ReturnType<typeof setTimeout>|undefined
  const quickInputs=new Map<string,HTMLInputElement>()
  for(const label of ['Brightness','Contrast']){
    const input=h('input',{type:'range',min:'0',max:'100',step:'1',value:'50',ariaLabel:`Anatomy ${label.toLowerCase()}`})
    input.addEventListener('pointerdown',()=>{quickGroup='image-quick-'+Date.now()})
    input.addEventListener('input',()=>{
      clearTimeout(quickTimer)
      const p=options.project(),id=p?.display.anatomyAssetId??p?.frame.referenceAssetId
      quickTimer=setTimeout(()=>{
        const p=options.project();if(!p||!id||(p.display.anatomyAssetId??p.frame.referenceAssetId)!==id)return
        const image=options.image(id);if(!image)return
        const lo=image.global_min??0,hi=image.global_max??1,span=Math.max(hi-lo,.001)
        const width=span*Math.max(.005,1-Number(quickInputs.get('Contrast')!.value)/100),center=lo+(1-Number(quickInputs.get('Brightness')!.value)/100)*span
        options.edit(p=>{const a=p.assets.find(a=>a.id===id)!;a.imageDisplay??={...options.defaults(id)!,min:lo,max:hi,opacity:.5,colormap:'gray',visible:true};a.imageDisplay.min=center-width/2;a.imageDisplay.max=center+width/2},quickGroup)
      },45)
    })
    quickInputs.set(label,input)
    const caption = h('span', {}, [label])
    caption.dataset.short = label === 'Brightness' ? 'Bright.' : 'Contrast'
    const field = h('label', { class: 'header-slider' }, [caption, input])
    hoverHelp(field, `${label} of the viewed image. Display provides exact intensity limits.`)
    quick.append(field)
  }
  const anatomical = (a: Asset) => a.role === 'anatomy' || a.role === 'ct' || a.modality === 'mri'
  const modality = (a: Asset) =>
    a.modality ?? (a.role === 'ct' ? 'ct' : a.role === 'overlay' ? 'functional' : 'mri')
  const windows = new Map<string, ReturnType<typeof floatingWindow>>()
  const imageButton = (control: HTMLButtonElement, id: string) => { control.dataset.imageAdjust = id; return control }
  const refreshWindows = new Map<string, () => void>()
  let manager: ReturnType<typeof floatingWindow> | null = null,
    managerSignature = ''
  const range = (
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    change: (v: number) => void,
  ) => {
    const slider = h('input', {
      type: 'range',
      ariaLabel: label,
      min: String(min),
      max: String(max),
      step: String(step),
      value: String(value),
    })
    const exact = h('input', {
      type: 'number',
      ariaLabel: `${label} value`,
      step: String(step),
      value: String(value),
    })
    const field = h('label', { class: 'image-slider' }, [h('span', {}, [label]), slider, exact])
    slider.addEventListener('input', () => {
      exact.value = slider.value
      change(slider.valueAsNumber)
    })
    exact.addEventListener('change', () => {
      if (!Number.isFinite(exact.valueAsNumber)) return
      const v = Math.max(min, Math.min(max, exact.valueAsNumber))
      exact.value = String(v)
      slider.value = String(v)
      change(v)
    })
    return {
      field,
      slider,
      exact,
      set: (v: number) => {
        slider.value = String(v)
        exact.value = String(Number(v.toFixed(4)))
      },
    }
  }
  const configure = async (asset: Asset) => {
    if (windows.get(asset.id)?.root.isConnected) { windows.get(asset.id)!.activate();return }
    const projectId = options.project()?.id
    const image = asset.functionalSurfaceId ? undefined :
      options.image(asset.id) ??
      (await NVImage.loadFromFile({
        file: new File([bytesView(data().get(asset.id)!)], asset.name),
        name: asset.name,
      }))
    if (options.project()?.id !== projectId || !options.project()?.assets.some(a => a.id === asset.id)) return
    const defaultDisplay = options.defaults(asset.id) ?? {
      min: modality(asset) === 'ct' ? ctDefaults(image!).min : image?.cal_min ?? 0,
      max: modality(asset) === 'ct' ? ctDefaults(image!).max : Math.max(image?.cal_max ?? 1, (image?.cal_min ?? 0) + 0.001),
      opacity: modality(asset) === 'ct' ? 0.85 : 0.5,
      colormap: anatomical(asset) ? 'gray' : 'hot',
      visible: true,
    }
    const draft: NonNullable<Asset['imageDisplay']> = structuredClone(
      options.project()!.assets.find((a) => a.id === asset.id)!.imageDisplay ?? defaultDisplay,
    )
    const functionalData = draft.functional
      ? asset.functionalSurfaceId
        ? await functionalSurfaceData(data().get(asset.id)!, options.surfaceVertexCount(asset.functionalSurfaceId))
        : functionalVolumeData(image!)
      : undefined
    if (options.project()?.id !== projectId) return
    const boundaryImage = options.project()!.assets.some(a => a.mriSurface?.boundaryAssetId === asset.id)
    if(windows.get(asset.id)?.root.isConnected){windows.get(asset.id)!.activate();return}
    let timer: ReturnType<typeof setTimeout> | undefined
    const tool = floatingWindow(asset.name, `Adjust ${asset.name}`,()=>{
      clearTimeout(timer)
      if(windows.get(asset.id)===tool){windows.delete(asset.id);refreshWindows.delete(asset.id)}
    })
    tool.root.dataset.imageDisplay = asset.id
    queueMicrotask(()=>tool.placeBeside(document.querySelector?.('[aria-label="Cardinal anatomy slices"]')?.closest('.view-pane')??null))
    windows.set(asset.id, tool)
    const message = h('p', { role: 'status' })
    let lastSeen = JSON.stringify(options.project()?.assets.find(a => a.id === asset.id)?.imageDisplay)
    let group = `image-${asset.id}-${Date.now()}`
    const commit = () => {
      clearTimeout(timer)
      timer = undefined
      try {
        const p = options.project()
        if (!p || !p.assets.some((a) => a.id === asset.id)) {
          tool.close()
          return
        }
        if (JSON.stringify(p.assets.find((a) => a.id === asset.id)!.imageDisplay) === JSON.stringify(draft))
          return
        draft.visible = p.assets.find((a) => a.id === asset.id)!.imageDisplay?.visible ?? draft.visible
        const test = structuredClone(p)
        test.assets.find((a) => a.id === asset.id)!.imageDisplay = structuredClone(draft)
        validateProject(test)
        lastSeen = JSON.stringify(draft)
        options.edit((p) => {
          p.assets.find((a) => a.id === asset.id)!.imageDisplay = structuredClone(draft)
        }, group)
        message.textContent = 'Display updated live. Changes are saved with the project.'
      } catch (e) {
        message.textContent = String(e)
      }
    }
    const live = () => {
      clearTimeout(timer)
      timer = setTimeout(commit, 60)
    }
    tool.root.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).matches('input')) group = `image-${asset.id}-${Date.now()}`
    })
    tool.root.addEventListener('change', commit)
    const functionalBounds = functionalData && Array.from({ length: functionalData.frames }, (_, i) => functionalRange(functionalData, i))
    const lo = Math.min(functionalBounds ? Math.min(...functionalBounds.map(b => b[0])) : image?.global_min ?? draft.min, draft.min),
      hi = Math.max(functionalBounds ? Math.max(...functionalBounds.map(b => b[1])) : image?.global_max ?? draft.max, draft.max),
      span = Math.max(hi - lo, 1),
      step = span / 1000
    const minControl = range('Display minimum', draft.min, lo, hi, step, (v) => {
      draft.min = Math.min(v, draft.max - step)
      reflect()
      live()
    })
    const maxControl = range('Display maximum', draft.max, lo, hi, step, (v) => {
      draft.max = Math.max(v, draft.min + step)
      reflect()
      live()
    })
    const center = range('Window center', (draft.min + draft.max) / 2, lo, hi, step, (v) => {
      const width = draft.max - draft.min
      draft.min = v - width / 2
      draft.max = v + width / 2
      reflect()
      live()
    })
    const width = range('Window width', draft.max - draft.min, step, span * 2, step, (v) => {
      const c = (draft.min + draft.max) / 2
      draft.min = c - v / 2
      draft.max = c + v / 2
      reflect()
      live()
    })
    const opacity = range('Overlay opacity', draft.opacity, 0, 1, 0.01, (v) => {
      draft.opacity = v
      live()
    })
    const opacityState = () => {
      const p = options.project()
      const underlay = asset.id === (p?.display.anatomyAssetId ?? p?.frame.referenceAssetId)
      opacity.slider.disabled = underlay
      opacity.exact.disabled = underlay
      opacity.field.title = underlay
        ? "The main image is fully opaque. To blend this image over another one, enable it as an overlay in Image layers and adjust its opacity there."
        : 'Opacity controls how strongly this image appears over the main image.'
    }
    opacityState()
    function reflect() {
      minControl.set(draft.min)
      maxControl.set(draft.max)
      center.set((draft.min + draft.max) / 2)
      width.set(draft.max - draft.min)
      const map = tool.root.querySelector<HTMLSelectElement>('select[data-colormap]')
      if (map) map.value = draft.colormap
    }
    const colormap = selectField('Colormap', draft.colormap, [
      ['gray', 'Gray'], ['bone', 'Bone'], ['hot', 'Hot'], ['winter', 'Winter'], ['cool', 'Cool'],
      ['viridis', 'Viridis'], ['blue2red', 'Blue to red'], ['brainana_polar_angle', 'Polar angle'],
      ['brainana_eccentricity', 'Eccentricity'], ['brainana_somatotopy', 'Body map'],
    ].map(([value, label]) => ({ value, label })), v => { draft.colormap = v; live() })
    colormap.querySelector('select')?.setAttribute('data-colormap', '')
    const frames = h('div', { class: 'control-section' })
    const reflectFrames = () => {
      if (!draft.functional || !functionalBounds) return
      const spec = draft.functional
      const frameOptions = functionalBounds.map((_, i) => ({ value: String(i), label: `Sub-brick ${i + 1}` }))
      frames.replaceChildren(
        selectField('Values to color', String(spec.valueFrame), frameOptions, value => {
          spec.valueFrame = Number(value)
          ;[draft.min, draft.max] = functionalBounds[spec.valueFrame]
          reflect()
          live()
        }),
        selectField('Threshold using', spec.thresholdFrame === undefined ? '' : String(spec.thresholdFrame),
          [{ value: '', label: 'No threshold' }, ...frameOptions], value => {
            if (value === '') { delete spec.thresholdFrame; delete spec.cutoff }
            else { spec.thresholdFrame = Number(value); spec.cutoff = Math.max(0, functionalBounds[spec.thresholdFrame][0]) }
            reflectFrames()
            live()
          }),
      )
      if (spec.thresholdFrame !== undefined) {
        const [min, max] = functionalBounds[spec.thresholdFrame]
        const cutoff = spec.cutoff ?? 0
        frames.append(range('Minimum threshold', cutoff, Math.min(min, cutoff), Math.max(max, cutoff),
          Math.max((max - min) / 1000, 0.0001), value => { spec.cutoff = value; live() }).field)
      }
      const zero = h('input', { type: 'checkbox', checked: spec.includeZero === true })
      zero.addEventListener('change', () => { spec.includeZero = zero.checked; live() })
      frames.append(h('label', {}, [zero, ' Include zero values']))
    }
    reflectFrames()
    tool.content.append(
      note(
        draft.functional ? 'Choose which sub-brick supplies the colors and which supplies the threshold. Values at or above the threshold are shown. Display minimum and maximum set the color scale.' : boundaryImage ? 'Estimated MRI boundary voxels: cyan = detected; amber = reconstructed. This is a thin surface layer, not a bone-thickness measurement. Adjust transparency here or turn this overlay on/off in Image layers. To change its shape, use the planning surface editor.' : "Move this window aside to see changes in the viewer as you adjust the sliders. Brightness and contrast are also above Anatomy. Display minimum/maximum and centre/width describe the same brightness range in different ways. To blend another MRI or CT on top, enable it in Image layers and adjust its Overlay opacity. These settings do not change the original images or their alignment.",
      ),
      ...(boundaryImage ? [opacity.field, button('Edit planning boundary…', () => { tool.close(); setupPlanningSurface() })] : [minControl.field, maxControl.field,
      ...(draft.functional ? [frames] : [h('details',{},[h('summary',{},['Window center / width']),center.field,width.field])]),
      opacity.field, colormap]),
    )
    refreshWindows.set(asset.id, () => {
      const saved = options.project()?.assets.find((a) => a.id === asset.id)?.imageDisplay
      const signature = JSON.stringify(saved)
      if (signature === lastSeen) return
      // Undo, header adjustments and other tools supersede stale local controls.
      clearTimeout(timer)
      timer = undefined
      lastSeen = signature
      const current = saved ?? defaultDisplay
      Object.assign(draft, structuredClone(current))
      if (!current.skull) delete draft.skull
      if (!current.functional) delete draft.functional
      reflectFrames()
      reflect()
      opacityState()
      opacity.set(draft.opacity)
      const map = tool.root.querySelector<HTMLSelectElement>('select[data-colormap]')
      if (map) map.value = draft.colormap
    })
    tool.content.append(
      message,
      h('div', { class: 'button-row' }, [
        button('Reset display', () => {
          Object.assign(draft, defaultDisplay)
          reflect()
          opacity.set(draft.opacity)
          commit()
        }),
        button('Close', () => {
          if (timer) commit()
          tool.close()
        }),
      ]),
    )
  }
  const load = (type: 'mri' | 'ct' | 'functional') =>
    chooseFile(
      '.nii,.nii.gz,.mgz',
      async (file) => {
        const done=(await import('./activity.ts')).beginActivity(`Loading aligned ${type.toUpperCase()}…`)
        try{
        const p = options.project()
        if (!p) return
        const bytes = new Uint8Array(await file.arrayBuffer()),
          image = await NVImage.loadFromFile({ file, name: file.name })
        const functional = type === 'functional' ? functionalVolumeData(image) : undefined
        const incoming = imageBounds(new VolumeSampler(image, !!functional)),
          ref = p.assets.find((a) => a.id === p.frame.referenceAssetId)!,
          reference =
            options.image(ref.id) ??
            (await NVImage.loadFromFile({
              file: new File([bytesView(data().get(ref.id)!)], ref.name),
              name: ref.name,
            }))
        const target = imageBounds(new VolumeSampler(reference))
        if ([0, 1, 2].some((i) => incoming[1][i] < target[0][i] || incoming[0][i] > target[1][i]))
          throw new Error('This image has no physical overlap with the reference. Align it before loading.')
        const asset = await createAsset(file.name, type === 'ct' ? 'ct' : 'overlay', p.frame.id, bytes)
        asset.modality = type
        asset.imageDisplay = {
          min: type === 'ct' ? ctDefaults(image!).min : image?.cal_min ?? 0,
          max: type === 'ct' ? ctDefaults(image!).max : Math.max(image?.cal_max ?? 1, (image?.cal_min ?? 0) + 0.001),
          opacity: type === 'ct' ? 0.85 : 0.5,
          colormap: type === 'functional' ? 'hot' : type === 'ct' ? 'cool' : 'gray',
          visible: type === 'functional',
        }
        if (functional) {
          [asset.imageDisplay.min, asset.imageDisplay.max] = functionalRange(functional, 0)
          asset.imageDisplay.functional = { valueFrame: 0 }
        }
        if (options.project()?.id !== p.id) return
        data().set(asset.id, bytes)
        options.edit((p) => {
          p.assets.push(asset)
          if (type === 'ct' || type === 'mri') p.display.anatomyOverlayIds = [...(p.display.anatomyOverlayIds ?? []), asset.id]
        })
        await configure(asset)
        }finally{done()}
      },
      errorDialog,
    )
  const loadSurfaceMap = () => {
    const project = options.project()
    const surfaces = project?.assets.filter(a => a.role === 'surface' && a.surfaceKind !== 'skull'
      && options.surfaceVertexCount(a.id) > 0) ?? []
    if (!project || !surfaces.length) return errorDialog(new Error('Load the matching cortical surface before adding a surface map.'))
    const tool = floatingWindow('Add surface functional map', 'Add surface functional map')
    let surface = surfaces[0].id
    tool.content.append(note('Select the surface with the same vertex order as the GIfTI data.'), selectField(
      'Matching surface', surface, surfaces.map(a => ({ value: a.id, label: a.name })), value => { surface = value },
    ), button('Choose GIfTI values…', () => {
      const id = surface
      chooseFile('.gii', async file => {
        const bytes = new Uint8Array(await file.arrayBuffer())
        const functional = await functionalSurfaceData(bytes, options.surfaceVertexCount(id))
        const [min, max] = functionalRange(functional, 0)
        const asset = await createAsset(file.name, 'overlay', project.frame.id, bytes)
        asset.modality = 'functional'
        asset.functionalSurfaceId = id
        asset.imageDisplay = { min, max, opacity: 0.7, colormap: 'hot', visible: true, functional: { valueFrame: 0 } }
        if (options.project()?.id !== project.id || !options.project()?.assets.some(a => a.id === id)) return
        data().set(asset.id, bytes)
        options.edit(p => { p.assets.push(asset) })
        tool.close()
        await configure(asset)
      }, errorDialog)
    }))
  }
  const update = () => {
    const p = options.project()
    if (!p) { manager?.close(); clearTimeout(quickTimer) }
    const assets = (p?.assets ?? []).filter(anatomical)
    const selected = p?.display.anatomyAssetId ?? p?.frame.referenceAssetId
    const image=selected?options.image(selected):undefined
    for(const input of quickInputs.values())input.disabled=!image
    if(image && !quick.contains(document.activeElement)){
      const lo=image.global_min??0,hi=image.global_max??1,span=Math.max(hi-lo,.001)
      quickInputs.get('Brightness')!.value=String(Math.max(0,Math.min(100,100*(1-((image.cal_min??lo)+(image.cal_max??hi)-2*lo)/2/span))))
      quickInputs.get('Contrast')!.value=String(Math.max(0,Math.min(100,100*(1-((image.cal_max??hi)-(image.cal_min??lo))/span))))
    }
    if (
      selector.querySelectorAll('option').length !== assets.length ||
      assets.some((a, i) => selector.options[i]?.value !== a.id)
    )
      selector.replaceChildren(
        ...assets.map((a) => h('option', { value: a.id }, [`${modality(a).toUpperCase()} · ${a.name}`])),
      )
    blend.disabled = blendField.hidden = assets.length < 2
    blend.checked = assets.some(a => a.id !== selected && p?.display.anatomyOverlayIds?.includes(a.id))
    if (selected) selector.value = selected
    selector.disabled = assets.length < 2
    selector.title =
      assets.length < 2
        ? 'Only one anatomical image is loaded. Add an aligned MRI or CT to this project.'
        : 'Switch the viewed image; planning coordinates remain unchanged.'
    hint.textContent =
      assets.length < 2
        ? 'One anatomical image loaded · add images in Images'
        : `${assets.length} anatomical images loaded`
    for (const [id, window] of windows)
      if (!window.root.isConnected || !p?.assets.some((a) => a.id === id)) {
        window.close()
        windows.delete(id)
        refreshWindows.delete(id)
      } else refreshWindows.get(id)?.()
    if (manager?.root.isConnected) {
      const signature = JSON.stringify([
        p?.id,
        p?.display,
        p?.assets.map((a) => [a.id, a.imageDisplay?.visible]),
      ])
      if (signature === managerSignature) return
      managerSignature = signature
      manager.content.replaceChildren(
        button('Atlas explorer',()=>options.atlas()),
        note(
          "Choose the main image above Anatomy. Turn on other images here to blend them on top. Functional maps and atlases can be shown separately. Edit ROI opens the atlas controls for choosing which regions to display.",
        ),
      )
      for (const a of p?.assets.filter((a) => (['anatomy', 'ct', 'overlay', 'atlas'].includes(a.role) || a.surfaceLayer === 'white')) ?? []) {
        const primaryAtlas =
          a.id === (p?.display.atlasAssetId ?? p?.assets.find((x) => x.role === 'atlas')?.id)
        const visible = h('input', { type: 'checkbox', ariaLabel: `Show ${a.name}` })
        visible.checked =
          a.id === selected || (a.role === 'atlas' && primaryAtlas)
            ? !!(a.id === selected || p?.display.atlasVisible)
            : anatomical(a)
              ? !!p?.display.anatomyOverlayIds?.includes(a.id)
              : (a.imageDisplay?.visible ?? a.modality === 'functional')
        visible.disabled = a.id === selected
        visible.addEventListener('change', () =>
          options.edit((p) => {
            if (anatomical(a)) {
              p.display.anatomyOverlayIds = (p.display.anatomyOverlayIds ?? []).filter((id) => id !== a.id)
              if (visible.checked) p.display.anatomyOverlayIds.push(a.id)
            } else if (a.role === 'atlas' && primaryAtlas) p.display.atlasVisible = visible.checked
            else {
              const target = p.assets.find((x) => x.id === a.id)!
              target.imageDisplay ??= {
                min: 0,
                max: 1,
                opacity: 0.3,
                colormap: a.role === 'atlas' ? 'random' : 'gray',
                visible: false,
              }
              target.imageDisplay.visible = visible.checked
            }
          }),
        )
        manager.content.append(
          h('div', { class: 'image-layer-row' }, [
            h('label', {}, [visible, `${a.name}${a.id === selected ? ' · main image' : ''}`]),
            a.surfaceLayer === 'white' ? '' : imageButton(button(a.role === 'atlas' ? 'Edit ROI' : 'Adjust', () => {
              if (a.role === 'atlas') options.atlas(a.id)
              else void configure(a).catch(errorDialog)
            }), a.id),
          ]),
        )
      }
    }
  }
  const layers = () => {
    if (!manager?.root.isConnected) {
      manager = floatingWindow('Image layers', 'Image layers')
      queueMicrotask(()=>manager?.placeBeside(document.querySelector?.('[aria-label="Cardinal anatomy slices"]')?.closest('.view-pane')??null))
      managerSignature = ''
    }
    update()
  }
  const setupPlanningSurface = () => { if (options.project()) options.openPlanningSurface?.() }
  return {
    setupPlanningSurface,
    selector,
    picker,
    quick,
    adjustCTForPlacement: setupPlanningSurface,
    adjustCurrent:()=>{const p=options.project(),asset=p?.assets.find(a=>a.id===(p.display.anatomyAssetId??p.frame.referenceAssetId));if(asset)void configure(asset).catch(errorDialog)},
    load,
    update,
    layers,
    adjustImage: async (id: string) => { const asset = options.project()?.assets.find(a => a.id === id); if (asset) await configure(asset) },
    closeTools: () => { for (const window of [...windows.values()]) window.close(); manager?.close(); manager = null },
    panel: () =>
      h('div', {}, [
        h('section', { class: 'control-section aligned-data-actions' }, [h('h3',{},['Add aligned data']),
        note(
          "You can load MRI and CT together if they are already aligned. The first reference image sets the coordinate system for the project. Switching the viewed image above Anatomy does not move targets or hardware.",
        ),
        button('Add aligned MRI…', () => load('mri')),
        button('Add aligned CT…', () => load('ct')),
        button('Add aligned functional volume…', () => load('functional')),
        button('Add surface functional map…', loadSurfaceMap),
        button('Add aligned atlas…', options.loadAtlas),
        ]),


        ...(options.project()?.provenance.subject === 'NMT2Sym' ? [h('section', { class: 'control-section' }, [
          h('h3', {}, ['NMT2Sym demo']),
          note('Template MRI, the warped MEBRAINS CT estimate, cortical surfaces, atlas labels and group functional maps are aligned in NMT2Sym space. The CT is blended into the slices by default. Select it in View image to make CT the main image; turn off Blend images to inspect CT alone. Overlays controls visibility and opacity.'),
          h('a', { href: 'https://brainana.readthedocs.io/en/stable/template_atlas_zoo.html', target: '_blank', rel: 'noopener noreferrer' }, ['Template and atlas references']),
        ])] : []),
        ...(options.project()?.assets ?? [])
          .filter((a) => ['anatomy', 'ct', 'overlay', 'atlas','surface'].includes(a.role))
          .map((a) =>
            h('section', { class: 'control-section' }, [
              h('h3', {}, [a.name]),
              note(
                options.project()?.assets.some(surface => surface.mriSurface?.boundaryAssetId === a.id) ? 'Estimated MRI boundary voxels · cyan detected / amber reconstructed' : a.role === 'anatomy'
                  ? `Reference ${modality(a).toUpperCase()}`
                  : a.role === 'surface' ? `${a.surfaceKind??'brain'} surface` : a.role === 'atlas'
                    ? 'Atlas'
                    : a.functionalSurfaceId ? 'Surface functional map' : modality(a).toUpperCase(),
              ),
              ...assetDerivation(a),
              imageButton(button(a.role === 'surface'?'Planning surface…':a.role === 'atlas' ? 'Explore atlas' : 'Adjust image…', () => {
                if(a.role==='surface')setupPlanningSurface()
                else if (a.role === 'atlas') options.atlas(a.id)
                else void configure(a).catch(errorDialog)
              }), a.id),
              ...(a.role === 'ct' || a.role === 'overlay'
                ? [
                    button('Remove image', () =>
                      options.edit((p) => {
                        const derived=p.assets.filter(x=>x.mriSurface?.sourceAssetId===a.id).flatMap(x=>[x.id,...(x.mriSurface?.boundaryAssetId?[x.mriSurface.boundaryAssetId]:[])])
                        const removed=new Set([a.id,...derived])
                        p.assets = p.assets.filter(x=>!removed.has(x.id))
                        for (const surface of p.assets) if (surface.mriSurface?.boundaryAssetId && removed.has(surface.mriSurface.boundaryAssetId)) delete surface.mriSurface.boundaryAssetId
                        p.assets=p.assets.filter(x=>x.role!=='mask'||x.sourcePath?.startsWith('nmt2sym/')||p.assets.some(surface=>surface.mriSurface?.maskAssetId===x.id))
                        for(const c of p.chambers)if(c.baseFit?.assetIds.some(id=>removed.has(id)))delete c.baseFit
                        if(p.surfaceOpenings)p.surfaceOpenings=p.surfaceOpenings.filter(o=>o.assetId!==a.id)
                        if (p.planningSurfaceIds) p.planningSurfaceIds = p.planningSurfaceIds.filter(id => !removed.has(id))
                        if (p.display.anatomyAssetId === a.id) delete p.display.anatomyAssetId
                        p.display.anatomyOverlayIds = p.display.anatomyOverlayIds?.filter((id) => id !== a.id)
                      }),
                    ),
                  ]
                : []),
            ]),
          ),
      ]),
  }
}
