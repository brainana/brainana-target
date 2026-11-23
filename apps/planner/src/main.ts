import { refitChamberTrajectories } from '@brainana/planning-core/placement-adjustment.ts'
import { fitChamberBase } from '@brainana/planning-core/surface-fit.ts'
import {intersectionReadout} from './ui/intersectionReadout.ts'
import {stereotaxSettings} from './ui/stereotaxSettings.ts'
import {updateMeasurementPanels} from './ui/measurements.ts'
import {MeasurementOverlay} from './render/measurementOverlay.ts'
import { workspaceHomeLink } from './ui/workspaceNav.ts'
import {addDirectElectrode,directPlanning} from '@brainana/planning-core/electrode-frame.ts'
import { projectExports } from './features/projectExports.ts'
import { readProject } from './data/ioTasks.ts'
import { cancelPlacementTask, invalidatePlacementTask } from './state/placementTasks.ts'
import {headpostPanelIdentity} from './features/headposts.ts'
import {anchoredSliceZoom,zoomRender} from './render/camera.ts'
import {chamberOnlyTask} from '@brainana/planning-core/model.ts'
import { settings as planningSettings } from '@brainana/planning-core/optimization.ts'
import {PlacementPreviewState} from './state/placementPreview.ts'
import {paintSurface,resetSurfacePainter} from './render/paintSurface.ts'
import { corticalEnvelopeAsset, mriBoundaryAssets } from './data/mriBoundaryAssets.ts'
import {surfacePatch} from '@brainana/planning-core/surface-patch.ts'
import {bindViewerKeys} from './ui/keyboardPan.ts'
import { fillOutline } from './render/filledOutline.ts'
import {sceneColorLabels,type SceneColors} from './render/colors.ts'
import { activity, beginActivity, withActivity } from './ui/activity.ts'
import { anatomyModes } from './ui/anatomyModes.ts'
import { planningSurfaceWorkspace } from './ui/planningSurface.ts'
import { invalidateChangedSurfaceFits } from './state/editEffects.ts'
import { floatingWindow } from './ui/floatingWindow.ts'
import { imageFiles } from './ui/imageFiles.ts'
import { readPreferences, applyAppearance, settingsWindow } from './ui/settings.ts'
import { h } from '@brainana/ui/dom.ts'
import { RuntimeClient } from '@brainana/core-client/runtimeClient.ts'
import { SourceManager } from '@brainana/core-client/sourceManager.ts'
import { parseAtlasTsv } from '@brainana/brainana-data/atlas.ts'
import { pendingProjectName, clearPendingProjectName, setPendingProjectName, pendingPlanningIntent, setPendingPlanningIntent, planningIntents, speciesOptions, pendingSpecies, setPendingSpecies } from './features/data.ts'
import { createProject, newId, type Headpost, type Project } from '@brainana/planning-core/model.ts'
import { gridCompatibility } from '@brainana/planning-core/hardware.ts'
import { hoverHelp,installControlHelp } from './ui/hoverHelp.ts'
import { add } from '@brainana/planning-core/geometry.ts'
import { ProjectStore } from './state/store.ts'
import { createAsset, type AssetBytes } from './data/assets.ts'
import type { ProjectBundle } from './data/archive.ts'
import { IndexedDbPersistence, SaveQueue } from './data/persistence.ts'
import { importBrainana, importNmtDemo, fetchAsset, type BrainanaManifest, type AtlasOption } from './data/brainana.ts'
import { viewerCoordinates } from './data/bookmarks.ts'
import { AvoidanceOverlay } from './render/avoidanceOverlay.ts'
import { atlasImport } from './ui/atlasImport.ts'
import { planningGuide } from './ui/planningGuide.ts'
import { demoTutorialLauncher } from './ui/demoTutorial.ts'
import type { DemoTutorial } from './tutorial/workspace.ts'
import { attachAvoidanceBrush } from './ui/avoidanceBrush.ts'
import { NiiVuePlanningScene } from './render/scene.ts'
import { TrajectoryReslices } from './render/reslices.ts'
import { features } from './features/index.ts'
import type { FeatureContext } from './features/contracts.ts'
import { button, note, chooseFile, download, errorDialog, selectField } from './ui/controls.ts'
import { cutawayControls } from './ui/cutawayControls.ts'
import { atlasWindow } from './ui/atlasWindow.ts'
import { sceneControls } from './ui/sceneControls.ts'
import { resizablePanels } from './ui/resizablePanels.ts'
import { datasetDialog } from './ui/datasetDialog.ts'

let preferences = readPreferences()
const tutorialSession = new URLSearchParams(location.search).get('workspace') === 'tutorial'
let tutorial: DemoTutorial | undefined
let imageSync: Promise<void> = Promise.resolve()
applyAppearance(preferences)
const client = new RuntimeClient(),
  store = new ProjectStore(),
  sources = new SourceManager(client)
let currentProject: Project|null=null
let bytes: AssetBytes = new Map(),
  selectedElectrode: string | null = null,
  activeFeature = 'images',
  atlasOptions: AtlasOption[] = [],
  busy = false,
  saveTimer: ReturnType<typeof setTimeout> | undefined
let avoidanceOverlay: AvoidanceOverlay | null = null
let measurementOverlays:MeasurementOverlay[]=[]
let draft: Project | null = null
const previewState=new PlacementPreviewState()
let placementPreview: Project | null = null
const previewBanner = h('div', { class: 'placement-preview', hidden: true, role: 'status' })
let pendingSave = false
const app = document.querySelector<HTMLDivElement>('#app')!
if (tutorialSession) app.inert = true
const openDemoTutorial = demoTutorialLauncher()
installControlHelp()
const slices = h('canvas', { class: 'volume-canvas', ariaLabel: 'Cardinal anatomy slices' }),
  render = h('canvas', { class: 'volume-canvas', ariaLabel: 'Three-dimensional anatomy and chamber', tabIndex: 0, ariaDescription: 'Arrow keys pan the view. R fits the anatomy.' })
const along = h('canvas', {
    width: 256,
    height: 256,
    class: 'reslice-canvas',
    ariaLabel: 'Image along electrode trajectory',
  }),
  across = h('canvas', {
    width: 256,
    height: 256,
    class: 'reslice-canvas',
    ariaLabel: 'Cross-section perpendicular to the selected electrode',
  })
const scene = new NiiVuePlanningScene(slices, render),
  reslices = new TrajectoryReslices(along, across)
const anatomyView = anatomyModes(slices, along, across, reslices, () => { if (!slices.hidden && scene.attached) scene.slices.resizeListener(); refreshScene(false) },mode=>scene.setSliceLayout(mode))
const projectTitle = h('span', { class: 'project-title' }, ['No project loaded']),
  status = h('span', { class: 'save-status', role: 'status' }, ['Ready'])
const panel = h('div', { class: 'feature-panel' }),
  nav = h('nav', { class: 'workflow', ariaLabel: 'Planning sections' }),
  description = h('p', { class: 'panel-description' })
const coordinate = h('span', { class: 'coordinate' }, ['R —  A —  S —']),
  atlasReadout = h('span', { class: 'atlas-readout' })
const atlasSelect = h('select', { ariaLabel: 'Atlas overlay' }),
  welcome = h('main', { class: 'welcome planner-home', ariaLabel: 'BrainanaTarget home' }),
  homeStatus=h('p',{class:'home-status',role:'status'})
const guide = planningGuide({
  hasPlanningSurface: () => !!scene.placementSurface,
  selectedElectrode: () => selectedElectrode,
  project: () => currentProject,
  navigate: (feature) => {
    activeFeature = feature
    refreshPanel(true)
    refreshScene()
  },
})
const placementLegend=h('div',{class:'placement-legend',ariaLabel:'Placement color legend'})
let legendKey=''
function updateLegend(p:Project|null=currentProject):void {
  const entries: Array<[keyof SceneColors,string]>=[]
  if(scene.hasPlacementCandidates&&['positioning','grid'].includes(activeFeature))
    entries.push(['placement','Feasible'],['placementOpening','Opening nearby'],['placementSoft','Soft conflict'],['selectedPlacement','Selected'])
  if(p?.grids.some(g=>g.enabled!==false&&p.chambers.some(c=>c.id===g.chamberId&&c.placementState!=='unplaced')&&p.electrodes.some(e=>e.gridId===g.id&&gridCompatibility(e).available)))
    entries.push(['gridSafe','Wall-clear hole'],['gridTarget','Target reached'],['gridBlocked','Blocked hole'])
  if(p?.avoidRegions?.some(r=>r.constraint===undefined||r.constraint==='hard'))entries.push(['avoidance','Hard avoid'])
  if(p?.avoidRegions?.some(r=>r.constraint==='soft'))entries.push(['softAvoidance','Soft avoid'])
  const key=JSON.stringify(entries.map(([id])=>[id,preferences.colors[id]]))
  if(key===legendKey)return
  legendKey=key
  placementLegend.hidden=!entries.length
  placementLegend.replaceChildren(...entries.map(([id,label])=>{
    const swatch=h('i');swatch.style.background=preferences.colors[id]
    return h('span',{title:sceneColorLabels[id]},[swatch,label])
  }))
}
const applySettings = (): void => {
  scene.setColors(preferences.colors)
  reslices.avoidanceColor=preferences.colors.avoidance
  updateLegend()
  if(avoidanceOverlay)avoidanceOverlay.color=preferences.colors.avoidance
  applyAppearance(preferences)
  const color = [1, 3, 5].map((i) => parseInt(preferences.crosshairColor.slice(i, i + 2), 16) / 255)
  scene.slices.opts.crosshairColor = [...color, 1] as [number, number, number, number]
  scene.slices.opts.crosshairWidth = preferences.crosshairWidth
  scene.slices.drawScene()
}
const settings = settingsWindow({
  get: () => preferences,
  change: (next) => {
    preferences = next
    applySettings()
    refreshScene(false)
    clearTimeout(saveTimer)
    if (currentProject) autosave(currentProject)
  },
  resetLayout: () => resetView(),
})
const undo = button('Undo', () => store.undo()),
  redo = button('Redo', () => store.redo())
undo.title = 'Undo (⌘/Ctrl Z)'
redo.title = 'Redo (⌘/Ctrl Shift Z)'
function run(task: () => Promise<void>): void {
  void task().catch(error=>{if(error?.name!=='AbortError')errorDialog(error)})
}
let finishBusy:(()=>void)|undefined
function setBusy(value: boolean, text = ''): void {
  finishBusy?.();finishBusy=value?beginActivity(text||'Processing…'):undefined
  busy = value
  app.classList.toggle('busy', value)
  status.textContent = text || 'Ready'
  homeStatus.textContent=value?(text||'Processing…'):''
  for (const b of app.querySelectorAll<HTMLButtonElement>('.project-action')) b.disabled = value
}
const loadReference = (modality: 'mri' | 'ct'): void => {
  if (store.project) {
    images.load(modality)
    return
  }
  chooseFile(
    '.nii,.nii.gz,.mgz',
    async (file) => {
      setBusy(true, `Loading reference ${modality.toUpperCase()}…`)
      try {
        const data = new Uint8Array(await file.arrayBuffer()),
          asset = await createAsset(file.name, 'anatomy', newId(), data)
        asset.modality = modality
        const project = createProject(asset, file.name.replace(/\.nii(\.gz)?$|\.mgz$/i, ''), {
          kind: 'standalone',
          subject: null,
          scan: null,
          sourceRoot: null,
        })
        await activate({ project, bytes: new Map([[asset.id, data]]) }, true)
        atlasOptions = []
        renderAtlasOptions()
      } finally {
        setBusy(false)
      }
    },
    errorDialog,
  )
}
const loadAnatomy = (): void => loadReference('mri')
const loadCT = (): void => loadReference('ct')
async function loadManifest(m: BrainanaManifest, root: string | null): Promise<void> {
  setBusy(true, 'Loading Brainana anatomy…')
  try {
    const bundle = await importBrainana(client, m, root)
    await activate(bundle, true)
    atlasOptions = m.atlases
      .filter((a) => !['CortHierarchy', 'retinotopy', 'somatotopy'].includes(a.name))
      .map((a) => ({ name: a.name, volume: a.volume, labels: a.labels }))
    renderAtlasOptions()
    status.textContent = m.warnings.length
      ? `${m.warnings.length} dataset warning(s)`
      : 'Brainana scan loaded'
  } finally {
    setBusy(false)
  }
}
const loadBrainana = (): void => {
  if (!busy) datasetDialog(client, loadManifest)
}
const loadDemo = (): void =>
  run(async () => {
    setBusy(true, 'Opening bundled macaque…')
    try {
      const runtime = await client.runtime()
      const demoRoot = runtime.runtimeMetadata?.demoDatasetRoot
      if (typeof demoRoot !== 'string') throw new Error('Demo dataset location is unavailable')
      const source = await sources.addLocal(demoRoot)
      const bundle = await importNmtDemo(client, source.id)
      await activate(bundle, true)
      atlasOptions = []
      renderAtlasOptions()
      status.textContent = 'NMT2Sym macaque demo loaded · MRI + MEBRAINS CT estimate'
    } finally {
      setBusy(false)
    }
  })
const open = (): void =>
  chooseFile(
    '.brainana-plan,.zip',
    async (file) => {
      setBusy(true, 'Opening project…')
      try {
        const archive=new Uint8Array(await file.arrayBuffer())
        const bundle = await withActivity('Opening saved project…',progress=>readProject(archive,{progress}))
        if(!store.project&&pendingPlanningIntent==='electrode'){bundle.project.planningIntent='electrode';bundle.project.planning={...planningSettings(bundle.project),mode:'existing'} as Project['planning']}
        await activate(bundle)
        atlasOptions = []
        renderAtlasOptions()
      } finally {
        setBusy(false)
      }
    },
    errorDialog,
  )
const save = (): void =>
  run(async () => {
    if (tutorialSession) return
    const project = store.project
    if (!project) return
    if (reviewPreview) throw new Error('Apply or revert the position preview before saving.')
    setBusy(true, 'Packing portable project…')
    try {
      await exports.save()
    } finally {
      finishBusy?.();finishBusy=undefined
      busy = false
      app.classList.remove('busy')
      for (const b of app.querySelectorAll<HTMLButtonElement>('.project-action')) b.disabled = false
    }
  })
const bookmarkImport = (): void =>
  chooseFile(
    '.html,.json',
    async (file) => {
      const project = store.project
      if (!project) return
      const text = await file.text(),
        raw = /\.html?$/i.test(file.name)
          ? new DOMParser().parseFromString(text, 'text/html').querySelector('#brainana-report-data')
              ?.textContent
          : text
      if (!raw) throw new Error('No Brainana viewer report data found')
      const imported = viewerCoordinates(JSON.parse(raw) as unknown, project)
      const dialog = h('dialog', { ariaLabel: 'Import Viewer coordinates' })
      const rows = imported.targets.map(point => {
        const role = h('select', { ariaLabel: `Import ${point.name} as` }, [
          h('option', { value: '' }, ['Skip']), h('option', { value: 'target' }, ['Target']),
          h('option', { value: 'landmark' }, ['Landmark']),
        ])
        const inside = scene.voxelAt(point.point)
        role.value = ''
        return { point, role, element: h('div', { class: 'reach-row' }, [
          h('strong', {}, [point.name]), note(`${point.point.map(v => v.toFixed(2)).join(' / ')} mm RAS${inside ? '' : ' · outside reference image'}`),
          h('div', { class: 'button-row' }, [role, button('Locate', () => scene.moveCrosshair(point.point))]),
        ]) }
      })
      const aligned = h('input', { type: 'checkbox', ariaLabel: 'Coordinates are aligned to this reference' })
      const apply = button('Import selected points', () => {
        if (store.project?.frame.id !== project.frame.id) { dialog.close(); return }
        const targets = rows.filter(row => row.role.value === 'target').map(row => row.point)
        const landmarks = rows.filter(row => row.role.value === 'landmark').map(({point: {id, name, point, frameId}}) => ({id, name, point, frameId}))
        if (!edit(d => { d.targets.push(...targets); if (landmarks.length) (d.landmarks ??= []).push(...landmarks) })) return
        status.textContent = `Imported ${targets.length} target(s) and ${landmarks.length} landmark(s)`
        dialog.close()
      }, 'primary')
      const update = () => { apply.disabled = !rows.some(row => row.role.value) || !imported.matches && !aligned.checked }
      rows.forEach(row => row.role.addEventListener('change', update))
      aligned.addEventListener('change', update)
      update()
      dialog.append(h('h2', {}, ['Import Viewer coordinates']),
        note(imported.matches ? 'The report matches this reference. Choose how to use each point.' : `${imported.frameProblem}. Confirm the points are already in this image’s RAS space before importing.`),
        ...(!imported.matches ? [h('label', {}, [aligned, ' Coordinates are aligned to this reference'])] : []),
        h('div', { class: 'dataset-list' }, rows.map(row => row.element)),
        h('div', { class: 'button-row' }, [apply, button('Cancel', () => dialog.close())]))
      dialog.addEventListener('close', () => dialog.remove())
      document.body.append(dialog)
      dialog.showModal()
    },
    errorDialog,
  )
const exports = projectExports({
  project: () => store.project, bytes: () => bytes, surfaces: () => scene.mountingSurface.surfaces,
  preview: () => !!placementPreview || !!reviewPreview,
  screenshot: () => { scene.render.drawScene(); return render.toDataURL('image/png') },
  download, status: message => { status.textContent = message },
})
const exportCoordinates = (): void => run(exports.coordinates)
const exportReport = (): void => run(exports.report)
function edit(change: (draft: Project) => void, group?: string): boolean {
  try {
    if (tutorialSession) {
      const before = store.project
      if (!before || !tutorial) return false
      const candidate = structuredClone(before)
      change(candidate)
      if (!tutorial.allowsEdit(before, candidate)) return false
      change = d => Object.assign(d, candidate)
    }
    store.edit((d) => {
      const before = new Map(d.chambers.map(c => [c.id, {
        pose: JSON.stringify(c.pose),
        shape: JSON.stringify([c.innerRadius, c.wallThickness, c.height, c.minimumWallHeight, c.mounting]),
        fit: JSON.stringify(c.baseFit),
        placed: c.placementState !== 'unplaced',
      }]))
      const gridGeometry = ({ name: _name, angleSearch: _angleSearch, ...geometry }: Project['grids'][number]) => JSON.stringify(geometry)
      const beforeGrids = new Map(d.grids.map(g => [g.id, gridGeometry(g)]))
      const previousAssets = structuredClone(d.assets)
      change(d)
      invalidateChangedSurfaceFits(d, previousAssets)
      for (const c of d.chambers) {
        const old = before.get(c.id)
        if (!old) continue
        const poseChanged = JSON.stringify(c.pose) !== old.pose
        const shapeChanged = JSON.stringify([c.innerRadius, c.wallThickness, c.height, c.minimumWallHeight, c.mounting]) !== old.shape
        let fitChanged = JSON.stringify(c.baseFit) !== old.fit
        const grids = d.grids.filter(g => g.chamberId === c.id)
        const linkedTarget = d.electrodes.some(e => e.targetId && !e.direct && grids.some(g => g.id === e.gridId))
        if (old.placed && poseChanged && linkedTarget && planningSettings(d).mode === 'new' && (!fitChanged || !c.baseFit))
          throw new Error('Choose a new mounting point in Review to refit the chamber and its linked trajectories.')
        if (shapeChanged && !poseChanged && old.fit && !c.baseFit && linkedTarget && planningSettings(d).mode === 'new') {
          const surface = scene.mountingSurface
          if (!surface.surfaces.length) throw new Error('Finalize a planning surface to refit the changed chamber dimensions.')
          c.baseFit = fitChamberBase(c, surface.surfaces, surface.source, surface.assetIds)
          fitChanged = true
        }
        if ((shapeChanged || poseChanged) && !fitChanged) delete c.baseFit
        if (old.placed && (poseChanged && linkedTarget || shapeChanged && linkedTarget || fitChanged && linkedTarget ||
          grids.some(grid => beforeGrids.get(grid.id) !== gridGeometry(grid)))) refitChamberTrajectories(d, c.id)
      }
    }, group)
    tutorial?.edited()
    return true
  } catch (error) {
    errorDialog(error)
    refreshPanel(true)
    return false
  }
}
function selectElectrode(id: string): void {
  if(selectedElectrode!==(id||null)){
    cancelPlacementTask(store)
    scene.setSurfaceFitHandler(null)
    scene.setPlacementMap([],2)
    previewState.clear()
    placementPreview=null
    previewBanner.hidden=true
  }
  selectedElectrode = id || null
  refreshPanel(true)
  refreshScene()
}
function selectLoadedAtlas(project: Project, id: string): void {
  const previousId = project.display.atlasAssetId ?? project.assets.find((a) => a.role === 'atlas')?.id
  const previous = project.assets.find((a) => a.id === previousId)
  if (previous && previous.id !== id) {
    previous.imageDisplay ??= {
      min: 0,
      max: 1,
      opacity: scene.atlasOpacity,
      colormap: 'random',
      visible: false,
    }
    previous.imageDisplay.visible = project.display.atlasVisible
  }
  project.display.atlasAssetId = id
  project.display.atlasVisible = true
}
const images = imageFiles({
  project: () => currentProject,
  bytes: () => bytes,
  edit,
  image: (id) => scene.imageForAsset(id),
  surfaceVertexCount: (id) => scene.surfaceVertexCount(id),
  defaults: (id) => scene.defaultsForImage(id),
  atlas: (id) => {
    if (id && store.project?.assets.some((a) => a.id === id && a.role === 'atlas')) {
      edit((p) => {
        selectLoadedAtlas(p, id)
      })
      renderAtlasOptions()
    }
    atlasExplorer.open()
  },
  loadAtlas: () => loadAtlas(),
  openPlanningSurface: () => openPlanningSurface(),
})
function openPlanningSurface(): void { activeFeature = 'surface'; refreshPanel(true) }
const surfaces = planningSurfaceWorkspace({bytes:id=>bytes.get(id),saveMRI:async value=>{
  const baseline=currentProject,p=store.project
  if(!p||!p.assets.some(a=>a.id===value.settings.sourceAssetId))throw Error('The source MRI changed. Reopen the surface editor.')
  const bundle = await mriBoundaryAssets(p, bytes, value)
  if(currentProject!==baseline)throw Error('The project changed during surface finalization. Review and finalize again.')
  setBusy(true,'Loading finalized MRI surface…')
  try{await activate(bundle,false,true)}finally{setBusy(false)}
}, saveEnvelope: async value => {
  const baseline = currentProject, project = store.project
  if (!project || !value.sourceAssetIds.every(id => project.assets.some(a => a.id === id && a.role === 'surface')))
    throw Error('The source brain meshes changed. Reopen the surface editor.')
  const bundle = await corticalEnvelopeAsset(project, bytes, value)
  if (currentProject !== baseline) throw Error('The project changed during surface finalization. Review and finalize again.')
  setBusy(true, 'Loading the cortical envelope…')
  try { await activate(bundle, false, true) } finally { setBusy(false) }
}, onFinalized:message=>{status.textContent=message;refreshPanel()}, project: () => currentProject, scene, edit, crosshair: () => [...scene.crosshair], moveCrosshair: point => scene.moveCrosshair(point),
  importSkull: () => loadSkullSurface(), importBrain: () => loadPlanningSurface('brain'), addCT: () => images.load('ct') })
function previewHeadpost(post: Headpost | null): void {
  const project=draft??placementPreview??currentProject
  if (scene.setHeadpostPreview(post) && project) scene.update(project,selectedElectrode,false)
  const measured=withFramePreview(project&&post?{...project,headposts:[...(project.headposts??[]).filter(item=>item.id!==post.id),post]}:project)
  measurementOverlays.forEach(overlay=>overlay.update(measured))
  updateMeasurementPanels(panel,measured)
}
let reviewPreview: Project | null = null
let reviewPanelProject: Project | null = null
function previewReview(project: Project | null): void {
  reviewPreview = project
  const visible = reviewPreview ?? draft ?? placementPreview ?? currentProject
  if (visible) scene.update(visible, selectedElectrode, false)
    measurementOverlays.forEach(overlay=>overlay.update(withFramePreview(visible)))
    updateMeasurementPanels(panel,withFramePreview(visible))
}
function context(): FeatureContext {
  return {
    store,
    scene,
    project: activeFeature==='grid'&&placementPreview?placementPreview:currentProject,
    hasPlacementPreview: !!placementPreview || !!draft,
    previewReview,
    previewHeadpost,
    selectedElectrode,
    selectElectrode,
    edit,
    previewPlacement: (project, label = '', apply) => {
      if (project) draft = null
      placementPreview = previewState.begin(currentProject,project)
      previewBanner.hidden = !project
      previewBanner.replaceChildren(
        h('strong', {}, [`Preview: ${label} · not applied`]),
        ...(apply ? [button(project?.electrodes.find(e=>e.id===selectedElectrode)?.direct?'Place electrode here':project?.planning?.mode==='existing'?'Apply electrode trajectory':'Place chamber here', apply, 'primary')] : []),
        button('Cancel preview', () => {
          scene.setPlacementSelection(null)
          previewState.clear()
          placementPreview = null
          previewBanner.hidden = true
          refreshScene()
        }),
      )
      refreshScene()
    },
    crosshair: () => [...scene.crosshair],
    refresh: () => {
      for (const c of [slices, along, across])
        c.classList.toggle('drawing-mode', scene.drawingEnabled && activeFeature === 'avoidance')
      refreshPanel(true)
      refreshScene()
    },
    actions: {
      imagePanel: () => images.panel(),
      surfacePanel: () => surfaces.panel(),
      addMRI: () => images.load('mri'),
      addCT: () => images.load('ct'),
      manageImages: () => {
        activeFeature = 'images'
        refreshPanel(true)
      },
      loadAnatomy,
      loadCT,
      loadBrainana,
      loadDemo,
      loadAtlas,
      openAtlas: () => atlasExplorer.open(),
      loadSkullSurface,
      prepareCTSurface: () => openPlanningSurface(),
      preparePlanningSurface: () => openPlanningSurface(),
      open,
      save,
      importBookmarks: bookmarkImport,
      exportGeometry:()=>run(exports.geometry),
      exportCoordinates,
      exportReport,
      openStereotax: () => openStereotax(),
      openReview: () => nav.querySelector<HTMLButtonElement>('[data-feature="review"]')?.click(),
      evaluatePlan: () => run(evaluatePlan),
    },
  }
}
function refreshPanel(force = false): void {
  if(activeFeature!=='headposts'&&scene.headpostSlideId)scene.setHeadpostSlide(null)
  if(activeFeature!=='targets')scene.setTargetPaintHandler(null)
  if (activeFeature !== 'surface') surfaces.cancel()
  if (activeFeature !== 'avoidance') scene.drawingEnabled = false
  if(store.project?.planningIntent==='headpost'&&['chamber','electrodes','grid','positioning','targets'].includes(activeFeature))activeFeature='headposts'
  if(chamberOnlyTask(store.project?.planningIntent)&&['electrodes','grid'].includes(activeFeature))activeFeature='chamber'
  for (const c of [slices, along, across]) c.classList.toggle('drawing-mode', scene.drawingEnabled)
  nav.querySelectorAll('button').forEach((b) => {
    b.classList.toggle('active', b.dataset.feature === activeFeature)
    b.hidden = (chamberOnlyTask(store.project?.planningIntent) && ['electrodes','grid'].includes(b.dataset.feature??'')) || (store.project?.planningIntent==='headpost'&&['chamber','electrodes','grid','positioning','targets'].includes(b.dataset.feature??''))
    const p = store.project
    const unavailable =
      b.dataset.feature === 'grid' &&
      !gridCompatibility(p?.electrodes.find((e) => e.id === selectedElectrode) ?? p?.electrodes[0]).available
    b.classList.toggle('unavailable', unavailable)
    b.setAttribute('aria-disabled', String(unavailable))
  })
  const feature = features.find((f) => f.id === activeFeature)!
  description.textContent = feature.description
  // Chamber fields are a local draft: unrelated refreshes must not discard them.
  if (!force && activeFeature === 'chamber') {
    const editor = panel.querySelector<HTMLElement>('.chamber-inline-editor'), p = store.project, c = p?.chambers.find(item => item.id === editor?.dataset.chamberId)
    const identity = JSON.stringify([c && [c.id, c.name, c.innerRadius, c.wallThickness, c.height,c.mounting], p?.grids.find(g => g.chamberId === c?.id)])
    if (editor && p && editor.dataset.projectId === p.id && editor.dataset.chamberIdentity === identity) return
  }
  if(!force&&activeFeature==='headposts'&&store.project){
    const editor=panel.querySelector<HTMLElement>('.headpost-editor')
    if(editor?.dataset.headpostIdentity===headpostPanelIdentity(store.project))return
  }
  if(!force&&activeFeature==='stereotax'&&currentProject&&panel.querySelector<HTMLElement>('.measurement-panel')?.dataset.projectId===currentProject.id){
    updateMeasurementPanels(panel,withFramePreview(currentProject));return
  }
  // Preserve active range/text controls during live edits instead of destroying pointer capture.
  if (
    !force &&
    panel.contains(document.activeElement) &&
    (document.activeElement instanceof HTMLInputElement ||
      document.activeElement instanceof HTMLSelectElement)
  )
    return
  if (!force && activeFeature === 'review' && reviewPanelProject === currentProject && reviewPanelProject) return
  if (reviewPanelProject) {
    scene.setObjectDrag(null)
    if (reviewPreview) previewReview(null)
  }
  reviewPanelProject = activeFeature === 'review' ? currentProject : null
  if(panel.querySelector('.headpost-editor')){
    scene.setSurfaceFitHandler(null)
    previewHeadpost(null)
  }
  panel.replaceChildren(feature.render(context()))
}
let resliceTimer: ReturnType<typeof setTimeout> | undefined
function scheduleInspectionDraw(p: Project | null): void {
  clearTimeout(resliceTimer)
  resliceTimer = setTimeout(() => {
    reslices.draw(p, selectedElectrode, scene.viewedAnatomy)
    avoidanceOverlay?.draw(p?.avoidRegions ?? [], !!p?.avoidRegions?.length, p?.targets ?? [])
  }, 50)
}
function refreshScene(updateAvoidance = true): void {
  const p = reviewPreview ?? placementPreview ?? draft ?? currentProject
  if (p) {
    if (!p.electrodes.some((e) => e.id === selectedElectrode)) selectedElectrode = p.electrodes[0]?.id ?? null
    scene.update(p, selectedElectrode, updateAvoidance)
    imageSync = scene
      .syncImages({ project: p, bytes })
      .then(() => {
        images.update()
        atlasExplorer.update()
        cutControls.update()
        scheduleInspectionDraw(draft ?? placementPreview ?? currentProject)
      })
      .catch((error) => {
        status.textContent = `Image display: ${String(error)}`
      })
  }
  images.update()
  anatomyView.update(p, selectedElectrode)
  for(const button of app.querySelectorAll<HTMLButtonElement>('.viewer-panel-header button'))button.disabled=!p
  displayControls.update(withFramePreview(p))
  updateLegend(p)
  cutControls.update()
  atlasExplorer.update()
  scheduleInspectionDraw(p)
  measurementOverlays.forEach(overlay=>overlay.update(withFramePreview(p)))
  updateMeasurementPanels(panel,withFramePreview(p))
}
const loadSkullSurface = (): void => loadPlanningSurface('skull')
const loadPlanningSurface = (kind: 'skull' | 'brain'): void => {
  if (!store.project) return
  chooseFile(
    '.stl,.obj,.ply,.gii',
    async (file) => {
      setBusy(true, `Loading aligned ${kind} surface…`)
      try {
        const project = store.project!
        const data = new Uint8Array(await file.arrayBuffer())
        const asset = await createAsset(file.name, 'surface', project.frame.id, data)
        asset.surfaceKind = kind

        project.assets.push(asset)
        for (const chamber of project.chambers) delete chamber.baseFit
        const updatedBytes = new Map(bytes)
        updatedBytes.set(asset.id, data)
        await activate({ project, bytes: updatedBytes },false,true)
      } finally {
        setBusy(false)
      }
    },
    errorDialog,
  )
}
const loadAtlas = (): void => {
  if (!store.project) return
  atlasImport(async (file, name, tsv) => {
    const project = store.project!
    setBusy(true, 'Loading aligned atlas…')
    try {
      const data = new Uint8Array(await file.arrayBuffer())
      const asset = await createAsset(file.name, 'atlas', project.frame.id, data)
      asset.atlasInfo = { name, tsv }
      if(store.project?.id!==project.id)return
      if(!await scene.setAtlas(data, file.name, tsv ? parseAtlasTsv(tsv) : [], name,()=>store.project?.id===project.id))return
      const updated=store.project
      if(!updated||updated.id!==project.id)return
      bytes.set(asset.id, data)
      updated.assets.push(asset)
      selectLoadedAtlas(updated, asset.id)
      store.replace(updated)
      renderAtlasOptions()
      // Update the anatomical label at the current crosshair immediately.
      scene.onCrosshair(scene.crosshair)
    } finally {
      setBusy(false)
    }
  })
}
function renderAtlasOptions(): void {
  atlasSelect.replaceChildren(
    h('option', { value: '' }, ['No atlas']),
    ...atlasOptions.map((a, i) => h('option', { value: String(i) }, [a.name])),
  )
  const p = store.project
  for (const atlas of p?.assets.filter((a) => a.role === 'atlas') ?? [])
    atlasSelect.append(h('option', { value: 'asset:' + atlas.id }, [atlas.atlasInfo?.name ?? atlas.name]))
  const active = p?.display.atlasAssetId ?? p?.assets.find((a) => a.role === 'atlas')?.id
  if (active) atlasSelect.value = p?.display.atlasVisible ? 'asset:' + active : ''
  atlasExplorer.update()
}
atlasSelect.addEventListener('change', () =>
  run(async () => {
    const project = store.project
    if (!project) return
    if (atlasSelect.value === 'import') {
      renderAtlasOptions()
      loadAtlas()
      return
    }
    if (atlasSelect.value.startsWith('asset:')) {
      const id = atlasSelect.value.slice(6)
      edit((p) => {
        selectLoadedAtlas(p, id)
      })
      return
    }
    if (atlasSelect.value === 'cached') {
      edit((d) => {
        d.display.atlasVisible = true
      })
      return
    }
    if (atlasSelect.value === '') {
      edit((d) => {
        d.display.atlasVisible = false
      })
      return
    }
    const option = atlasOptions[Number(atlasSelect.value)]
    setBusy(true, 'Loading atlas…')
    try {
      const item = await fetchAsset(client, option.volume, 'atlas', project.frame.id),
        tsv = option.labels ? await (await client.apiFetch(option.labels)).text() : null
      item.asset.atlasInfo = { name: option.name, tsv }
      if(store.project?.id!==project.id)return
      if(!await scene.setAtlas(item.bytes, item.asset.name, tsv ? parseAtlasTsv(tsv) : [], option.name,()=>store.project?.id===project.id))return
      bytes.set(item.asset.id, item.bytes)
      // Import establishes a new asset baseline; geometry undo must not detach an image.
      const updated = store.project!
      updated.assets.push(item.asset)
      selectLoadedAtlas(updated, item.asset.id)
      store.replace(updated)
    } finally {
      setBusy(false)
    }
  }),
)
async function activate(bundle: ProjectBundle, _initial = false, preserveGuide = false): Promise<void> {
  exports.cancel()
  cancelPlacementTask(store)
  scene.setTargetPaintHandler(null)
  resetSurfacePainter()
  scene.drawingEnabled = false
  if (_initial && pendingProjectName.trim()) bundle.project.name = pendingProjectName.trim()
  if (_initial) {
    if (pendingSpecies) bundle.project.species = pendingSpecies
    bundle.project.planningIntent = pendingPlanningIntent
    if(directPlanning(bundle.project)&&!bundle.project.electrodes.length)addDirectElectrode(bundle.project)
    bundle.project.planning = {...planningSettings(bundle.project), mode:pendingPlanningIntent==='electrode'?'existing':'new'} as Project['planning']
  }
  await scene.load(bundle)
  if(scene.mountingSurface.surfaces.length)for(const r of bundle.project.avoidRegions??[])if(r.drawingMode==='surface'&&!r.surfacePatch)r.surfacePatch=surfacePatch(scene.mountingSurface.surfaces,r.stamps??r.points??[r.center],r.radius)
  clearPendingProjectName()
  setPendingSpecies('')
  homeSpecies.querySelector('select')!.value = ''
  bytes = new Map(bundle.project.assets.map(asset=>[asset.id,bundle.bytes.get(asset.id)!]))
  draft = null
  selectedElectrode = bundle.project.electrodes[0]?.id ?? null
  store.replace(bundle.project)
  if (bundle.project.stereotax && !preserveGuide) {
    scene.set3DDisplay({ showIntersections: true })
    displayControls.update(currentProject)
  }
  guide.projectChanged(preserveGuide)
  welcome.hidden = true
  projectName.value=''
  refreshPanel(true)
  refreshScene()
  if (scene.anatomy?.image.hdr && (scene.anatomy.image.hdr.xyzt_units & 7) === 0)
    status.textContent = 'Image units unspecified; imported as millimetres'
}
let persistence: IndexedDbPersistence | null = null,
  queue: SaveQueue | null = null
async function evaluatePlan(): Promise<void> {
  if (reviewPreview) throw new Error('Apply or revert the position preview before opening Evaluation.')
  const project = currentProject
  if (!project || !queue) throw new Error('Save a portable project and open it in Evaluate placement. Local storage is unavailable.')
  setBusy(true, 'Saving plan for evaluation…')
  try {
    await queue.save({ project, bytes: new Map(project.assets.map(asset => [asset.id, bytes.get(asset.id)!])) })
    if(currentProject!==project)throw new Error('The plan changed while saving. Open it in evaluation again to use the latest edits.')
    clearTimeout(saveTimer)
    pendingSave = false
  } finally {
    setBusy(false)
  }
  window.location.assign('?workspace=evaluate&source=autosave')
}
async function newProject(): Promise<void> {
  exports.cancel()
  cancelPlacementTask(store)
  resetSurfacePainter()
  setBusy(true, 'Starting a new project…')
  clearTimeout(saveTimer)
  try {
    await queue?.clear()
    resumeProject.hidden = true
    pendingSave = false
    clearPendingProjectName()
    projectName.value=''
    store.clear()
    bytes = new Map()
    draft = null
    selectedElectrode = null
    activeFeature = 'images'
    atlasOptions = []
    scene.clear()
    images.update()
    anatomyView.reset()
    reslices.clear()
    avoidanceOverlay?.draw([], false)
    coordinate.textContent = 'R —  A —  S —'
    atlasReadout.textContent = ''
    renderAtlasOptions()
    refreshPanel(true)
    welcome.hidden = false
  } finally {
    setBusy(false)
  }
}
function autosave(project: Project): void {
  if (tutorialSession) { pendingSave = false; status.textContent = 'Macaque demo tutorial'; return }
  if (!preferences.autosave) {
    pendingSave = true
    status.textContent = 'Autosave off · save project to keep changes'
    clearTimeout(saveTimer)
    return
  }
  pendingSave = true
  status.textContent = 'Unsaved changes…'
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    if (!queue) return
    status.textContent = 'Saving…'
    void queue
      .save({ project, bytes: new Map(project.assets.map((a) => [a.id, bytes.get(a.id)!])) })
      .then(() => {
        if (currentProject === project) {
          status.textContent = 'Autosaved locally'
          pendingSave = false
        }
      })
      .catch((error: unknown) => {
        if(currentProject===project)status.textContent = `Autosave unavailable: ${error instanceof Error ? error.message : String(error)}`
      })
  }, preferences.saveDelay * 1000)
}
store.subscribe((project) => {
  invalidatePlacementTask(store,project)
  if(scene.targetPaintId&&!project?.targets.some(t=>scene.targetPaintId?.startsWith(t.id+':')&&t.region?.kind==='voxels'))scene.setTargetPaintHandler(null)
  currentProject=project
  if (reviewPreview) reviewPreview = null
  if(scene.headpostSlideId)scene.setHeadpostSlide(null)
  if(activeFeature!=='headposts')scene.setSurfaceFitHandler(null)
  placementPreview=previewState.synchronize(project)
  if(!placementPreview)scene.setPlacementMap([],2)
  previewBanner.hidden = !placementPreview
  projectTitle.textContent = project?.name ?? 'No project loaded'
  projectTitle.title = project?.name ?? ''
  undo.disabled = !store.canUndo
  redo.disabled = !store.canRedo
  if (project) {
    refreshScene()
    refreshPanel()
    autosave(project)
  }
  guide.refresh()
})
scene.onCrosshair = (p) => {
  atlasExplorer.updateLocation()
  cutControls.update()
  coordinate.textContent = `R ${p[0].toFixed(2)}  A ${p[1].toFixed(2)}  S ${p[2].toFixed(2)} mm`
  const atlas = scene.atlasReadout(p)
  atlasReadout.textContent = atlas ? `${atlas.name} · ${atlas.label}` : ''
  avoidanceOverlay?.schedule(currentProject?.avoidRegions ?? [], !!currentProject?.avoidRegions?.length, currentProject?.targets ?? [])
}
scene.onDrag = (delta, commit) => {
  if (commit) {
    const final = draft
    draft = null
    if (final)
      edit((d) => {
        d.chambers = final.chambers
      })
    return
  }
  previewState.clear()
  placementPreview = null
  previewBanner.hidden = true
  draft ??= store.project
  const chamber = draft?.chambers.find(item => item.id === scene.dragChamberId)
  if (!chamber) return
  chamber.pose.origin = add(chamber.pose.origin, delta)
  refreshScene()
}
reslices.onPick = (p) => scene.moveCrosshair(p)
for (const feature of features) {
  const b = button('', () => {
    const p = store.project
    if (
      feature.id === 'grid' &&
      !gridCompatibility(p?.electrodes.find((e) => e.id === selectedElectrode) ?? p?.electrodes[0]).available
    )
      return
    scene.setSurfaceFitHandler(null)
    if(activeFeature!==feature.id){cancelPlacementTask(store);scene.dragEnabled=false}
    activeFeature = feature.id
    refreshPanel(true)
    refreshScene()
  })
  b.dataset.feature = feature.id
  b.append(h('span', { class: 'step-number' }, [feature.glyph]), h('span', {}, [feature.label]))
  hoverHelp(b, () => {
    const p = store.project
    return feature.id === 'grid'
      ? gridCompatibility(p?.electrodes.find((e) => e.id === selectedElectrode) ?? p?.electrodes[0]).reason
      : feature.description
  })
  nav.append(b)
}
const pane = (
  title: string,
  subtitle: string,
  canvas: HTMLElement,
  controls: Node[] = [],
  quick: Node[] = [],
): HTMLElement =>
  h('section', { class: 'view-pane' }, [
    h('header', {class:'viewer-panel-header'}, [h('div',{class:'panel-heading'},[h('h2',{title:subtitle},[title]),h('div',{class:'panel-actions'},controls)]),...(quick.length?[h('div',{class:'panel-quick-controls'},quick)]:[])]),
    h('div', { class: 'canvas-wrap' }, [canvas]),
  ])
function zoomButtons(name: string, apply: (factor: number | null) => void): HTMLElement {
  return h(
    'div',
    { class: 'zoom-buttons' },
    [
      ['−', 1 / 1.25, 'Zoom out'],
      ['+', 1.25, 'Zoom in'],
      ['Fit', null, 'Reset zoom'],
    ].map(([label, factor, action]) => {
      const b = button(String(label), () => apply(factor as number | null))
      b.setAttribute('aria-label', `${action} ${name}`)
      b.title = `${action} ${name}`
      return b
    }),
  )
}
function resetView(): void {
  resetPanelLayout()
  anatomyZoom(null); renderZoom(null)
  scene.render.setRenderAzimuthElevation(0, 90)
  scene.setCutaway({ axis: null })
  anatomyView.reset()
  reslices.zoom(0, null); reslices.zoom(1, null)
  reslices.draw(store.project, selectedElectrode, scene.viewedAnatomy)
  status.textContent = 'View reset: layout, zoom, camera and cutaway restored. Images and planning geometry kept.'
}
async function resetWorkspace(): Promise<void> {
  if (busy || !window.confirm('Reset workspace and start over?\n\nThis unloads images, targets, hardware, placements, undo history, recovery and open tools. Unsaved work will be lost. Your settings, original files and saved projects are kept. Cancel and Save project first if needed.')) return
  await newProject()
  resetPanelLayout()
  window.location.reload()
}
function anatomyZoom(factor: number | null): void {
  const pan = scene.slices.scene.pan2Dxyzmm
  scene.slices.setPan2Dxyzmm(
    anchoredSliceZoom(pan,scene.slices.frac2mm(scene.slices.scene.crosshairPos),factor),
  )
  avoidanceOverlay?.schedule(currentProject?.avoidRegions ?? [], !!currentProject?.avoidRegions?.length, currentProject?.targets ?? [])
}
function renderZoom(factor: number | null): void {
  if(factor===null){scene.focus3D(true);return}
  zoomRender(scene.render,factor)
}
const atlasExplorer = atlasWindow(
  scene,
  atlasSelect,
  () => {app.querySelector<HTMLButtonElement>('button[data-feature="images"]')?.click()},
  () => {
    if (!store.project || !scene.atlas) return
    chooseFile(
      '.tsv',
      async (file) => {
        const text = await file.text(),
          labels = parseAtlasTsv(text)
        if (!labels.length) throw new Error('The TSV has no valid atlas labels. Include ID and name columns.')
        scene.setAtlasLabels(labels)
        const project = store.project!,
          asset = project.assets.find((a) => a.role === 'atlas')!
        asset.atlasInfo = { name: asset.atlasInfo?.name ?? asset.name, tsv: text }
        store.replace(project)
      },
      errorDialog,
    )
  },
  () => !!store.project?.display.atlasVisible,
  (visible) => {
    edit((p) => {
      p.display.atlasVisible = visible
    })
    renderAtlasOptions()
  },
  (region) =>
    edit((p) => {
      scene.moveCrosshair(region.point)
      p.targets.push({
        id: newId(),
        name: region.label.name.replace(/_/g, ' '),
        point: [...region.point],
        frameId: p.frame.id,
        color: '#f4c877',
        atlas: { name: scene.atlasName, label: region.label.name.replace(/_/g, ' ') },
      })
    }),
)
function withFramePreview(project: Project | null): Project | null {
  return project && scene.stereotaxPreview ? { ...project, stereotax: scene.stereotaxPreview } : project
}
const displayControls = sceneControls(scene.display, (patch) => {
  scene.set3DDisplay(patch)
  displayControls.update(withFramePreview(reviewPreview ?? placementPreview ?? draft ?? currentProject))
  if (patch.enhanceElectrodes !== undefined) refreshScene(false)
})
const intersectionStatus = intersectionReadout(scene.intersections, point => scene.moveCrosshair(point))
const cutControls = cutawayControls(
  scene.cutaway,
  (patch) => scene.setCutaway(patch),
  () => scene.cutawayBounds,
  () => scene.crosshair,
  () => draft ?? placementPreview ?? store.project,
  () => selectedElectrode,
  true,
)
const openStereotax = stereotaxSettings({
  current: () => currentProject ? {
    key: JSON.stringify([currentProject.id, currentProject.frame.id,currentProject.species]), stereotax: currentProject.stereotax,species:currentProject.species,
  } : null,
  crosshair: () => [...scene.crosshair],
  center: () => scene.stereotaxCenter,
  viewer: render,
  fit: () => scene.focus3D(true),
  overlaps: {
    current: () => scene.display.showIntersections,
    set: showIntersections => { scene.set3DDisplay({ showIntersections }); displayControls.update(withFramePreview(currentProject)) },
  },
  locate: point => scene.moveCrosshair(point),
  preview: rig => {
    if (!rig && !scene.stereotaxPreview) return
    scene.stereotaxPreview = rig
    const project = reviewPreview ?? placementPreview ?? draft ?? currentProject
    if (project) scene.update(project, selectedElectrode, false)
    measurementOverlays.forEach(overlay=>overlay.update(withFramePreview(project)))
    updateMeasurementPanels(panel,withFramePreview(project))
    displayControls.update(withFramePreview(project))
  },
  save: rig => {
    const saved = edit(project => {
      if (rig) project.stereotax = rig
      else delete project.stereotax
    })
    if (saved && rig) {
      scene.set3DDisplay({ layers: { stereotax: true } })
      displayControls.update(currentProject)
    }
    return saved
  },
})
let sceneWindow:ReturnType<typeof floatingWindow>|null=null
function openSceneSettings():void {
  if(sceneWindow?.root.isConnected){sceneWindow.activate();return}
  sceneWindow=floatingWindow('3D display settings','3D display settings')
  sceneWindow.content.append(
    h('div',{class:'button-row'},[button('Fit whole scene',()=>scene.focus3D(true))]),
    displayControls.details,
  )
  sceneWindow.placeBeside(render.closest('.view-pane'))
}
let cutWindow:ReturnType<typeof floatingWindow>|null=null
function openCutSettings():void {
 if(cutWindow?.root.isConnected){cutWindow.activate();return}
 cutWindow=floatingWindow('3D cross-sections','3D cross-sections')
 cutWindow.content.append(cutControls.details)
 cutWindow.placeBeside(render.closest('.view-pane'))
}

const viewButtons = h(
  'div',
  { class: 'camera-buttons' },
  [
    ['Top', 0, 90],
    ['Front', 0, 0],
    ['Side', 90, 0],
  ].map(([label, az, el]) =>
    button(String(label), () => scene.render.setRenderAzimuthElevation(Number(az), Number(el))),
  ),
)
const resumeProject = button(
  'Resume previous autosave',
  () =>
    run(async () => {
      setBusy(true, 'Restoring previous project…')
      try {
        const saved = await persistence?.load()
        if (!saved) throw new Error('No previous autosave is available.')
        await activate(saved)
        renderAtlasOptions()
      } finally {
        setBusy(false)
      }
    }),
  'project-action',
)
resumeProject.hidden = true
const projectName=h('input',{type:'text',ariaLabel:'Project name',placeholder:'Optional',maxLength:120})
projectName.addEventListener('input',()=>setPendingProjectName(projectName.value))
const homeSpecies = selectField('Species', pendingSpecies ?? '', speciesOptions, setPendingSpecies)
welcome.append(h('div',{class:'home-inner'},[
  h('header',{class:'home-heading'},[
    h('img',{class:'brand-icon',src:'/icon.png',alt:'',width:34,height:34}),
    h('h1',{},['BrainanaTarget']),
    button('Settings',()=>settings.open(),'project-action home-settings'),
    button('Guided tutorial',()=>guide.start(),'project-action'),
    button('Demo tutorials',openDemoTutorial,'project-action'),
  ]),
  h('div',{class:'home-columns'},[
    h('section',{class:'start-project home-card',ariaLabel:'Plan targeting'},[
      h('h2',{},['Plan targeting']),
      note('Choose what you want to plan, then load the reference image.'),
      selectField('Planning task',pendingPlanningIntent,planningIntents,setPendingPlanningIntent),
      homeSpecies,
      h('label',{class:'field'},[h('span',{},['Project name']),projectName]),
      h('div',{class:'home-actions'},[
        button('Load reference MRI…',loadAnatomy,'primary project-action'),
        button('Load reference CT…',loadCT,'project-action'),
        button('Load Brainana dataset…',loadBrainana,'project-action'),
        button('Try the macaque demo',loadDemo,'project-action'),
      ]),
    ]),
    h('div',{class:'home-secondary'},[
      h('section',{class:'home-card',ariaLabel:'Continue planning'},[
        h('h2',{},['Continue planning']),
        h('div',{class:'home-actions'},[button('Open saved chamber / project…',open,'project-action'),resumeProject]),
      ]),
      h('section',{class:'home-card',ariaLabel:'Postoperative evaluation'},[
        h('h2',{},['Postoperative evaluation']),
        note('Review measured electrode tracks against cortex and compare them with a saved plan.'),
        h('a',{class:'home-evaluate',href:'?workspace=evaluate'},['Evaluate placement']),
      ]),
    ]),
  ]),
  homeStatus,
]))
document.getElementById('startup-home')?.remove()
app.append(
  welcome,
  guide.element,
  h('header', { class: 'topbar' }, [
    workspaceHomeLink(),
    h('div', { class:'workspace-identity' }, [h('h1', { class: 'workspace-heading' }, ['Plan targeting']), projectTitle]),
    h('div', { class: 'top-actions' }, [
      undo,
      redo,
      h('span', { class: 'toolbar-divider', ariaHidden: 'true' }),
      button('Settings', () => settings.open()),
      button('Guided tutorial', () => guide.start(), 'project-action'),
      button('Demo tutorials', openDemoTutorial, 'project-action'),
      h('span', { class: 'toolbar-divider', ariaHidden: 'true' }),
      button('Reset view', () => resetView()),
      button('Reset workspace', () => run(resetWorkspace), 'project-action'),
      button('Open project', open, 'project-action'),
      button('Save project', save, 'primary project-action'),
    ]),
  ]),
  h('main', { class: 'workspace' }, [
    nav,
    h('aside', { class: 'inspector' }, [description, previewBanner, panel]),
    h('div', { class: 'visual-workspace' }, [
      h('div', { class: 'views two-views' }, [
        pane('Anatomy', 'Choose cardinal slices or optional trajectory reslicing', anatomyView.host, [
          anatomyView.selector,
          Object.assign(button('Overlays',()=>images.layers()),{ariaLabel:'Image layers'}),
          Object.assign(button('Display…',()=>images.adjustCurrent()),{ariaLabel:'Anatomy display settings'}),
          zoomButtons('Anatomy', factor => anatomyView.zoom(factor, anatomyZoom)),
        ],[images.picker,images.quick,anatomyView.controls]),
        pane('3D anatomy & implants', 'Drag to rotate · scroll to zoom · arrow keys to pan · R to focus anatomy', render, [
          Object.assign(button('3D display…',openSceneSettings),{ariaLabel:'3D scene settings'}),
          button('Stereotaxic setup…',()=>{sceneWindow?.close();sceneWindow=null;openStereotax()}),
          Object.assign(button('Cut',openCutSettings),{ariaLabel:'3D cutaway controls'}),
          viewButtons,zoomButtons('3D',renderZoom),
        ],[displayControls.element,intersectionStatus,placementLegend]),

      ]),
    ]),
  ]),
  h('footer', { class: 'statusbar' }, [coordinate, atlasReadout, h('div',{class:'status-activity'},[status,activity])]),
)
const resetPanelLayout = resizablePanels(app.querySelector<HTMLElement>('.workspace')!, app.querySelector<HTMLElement>('.views')!)
avoidanceOverlay = new AvoidanceOverlay(slices, scene.slices)
measurementOverlays=[new MeasurementOverlay(slices,scene.slices,'slices'),new MeasurementOverlay(render,scene.render,'3d')]
avoidanceOverlay.color=preferences.colors.avoidance
updateLegend()
scene.updateAvoidanceSurfaces = () => {void withActivity('Updating avoidance surfaces…',()=>{refreshScene(true)}).catch(errorDialog)}
const brushEnabled = (): boolean =>
  activeFeature === 'avoidance' && scene.drawingEnabled && !busy && !!store.project
const commitStroke = (raw: import('@brainana/planning-core/model.ts').Vec3[], radius: number, sliceNormal?:import('@brainana/planning-core/model.ts').Vec3): void => {
 try{
  const points=scene.fillOutline&&raw.length>2?[...raw.slice(0,1023),raw[0]]:raw
  const stamps=scene.fillOutline?fillOutline(raw,radius):[]
  if(scene.brushMode==='surface'){
    const surfaces=scene.mountingSurface.surfaces
    if(!surfaces.length)throw new Error('Finalize a planning surface before using surface-snapped drawing.')
    // Independent stamps prevent projection gaps from being bridged by a chord through anatomy.
    const projectId=store.project?.id
    void withActivity('Painting avoidance on planning surface…',async()=>{
      await new Promise(resolve=>setTimeout(resolve,30))
      const {centers:projected,patch}=await paintSurface(surfaces,points,stamps,radius,sliceNormal??[0,0,1])
      if(currentProject?.id!==projectId)return
      edit(d=>{d.avoidRegions??=[];d.avoidRegions.push({id:newId(),name:`Surface region ${d.avoidRegions.length+1}`,frameId:d.frame.id,center:projected[0],radius,points:[projected[0]],stamps:projected,drawingMode:'surface',surfacePatch:patch})})
      refreshScene(true)
    }).catch(error=>{if(error?.name!=='AbortError')errorDialog(error)})
  }else edit(d=>{d.avoidRegions??=[];d.avoidRegions.push({id:newId(),name:`Avoid ${d.avoidRegions.length+1}`,frameId:d.frame.id,center:points[0],radius,points,stamps,drawingMode:'volume'})})
 }catch(error){errorDialog(error)}
}
attachAvoidanceBrush(
  slices,
  (x, y) => {
    const rect = slices.getBoundingClientRect()
    const mm = scene.slices.screenXY2mm((x / rect.width) * slices.width, (y / rect.height) * slices.height)
    return [...mm].every(Number.isFinite) ? { point: [mm[0], mm[1], mm[2]], plane: mm[3] } : null
  },
  brushEnabled,
  () => scene.brushRadius,
  commitStroke,
  {fill:()=>scene.fillOutline,color:()=>preferences.colors.avoidance},
)
for (const [index, canvas] of [along, across].entries()) {
  attachAvoidanceBrush(
    canvas,
    (x, y) => {
      const point = reslices.screenPoint(canvas, x, y)
      return point ? { point, plane: index } : null
    },
    brushEnabled,
    () => scene.brushRadius,
    commitStroke,
    {fill:()=>scene.fillOutline,color:()=>preferences.colors.avoidance},
  )
  canvas.addEventListener(
    'wheel',
    (event) => {
      if (brushEnabled()) return
      event.preventDefault()
      reslices.zoom(index, event.deltaY < 0 ? 1.15 : 1 / 1.15)
      refreshScene()
    },
    { passive: false },
  )
}
panel.addEventListener('focusout', () =>
  setTimeout(() => {
    if (!panel.contains(document.activeElement)) refreshPanel()
  }, 0),
)
bindViewerKeys([
  { element: anatomyView.host, pan: (x,y) => anatomyView.pan(x,y,(right,up) => scene.panSlices(right,up)), fit: () => anatomyView.zoom(null,anatomyZoom) },
  { element: render, pan: (x,y) => scene.pan3D(x,y), fit: () => scene.focus3D() },
], () => !busy && !!currentProject)
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    if (!busy) save()
  }
  if (document.querySelector('dialog[open]')) return
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !(e.target instanceof HTMLInputElement)) {
    e.preventDefault()
    if (e.shiftKey) store.redo()
    else store.undo()
  }
})
window.addEventListener('beforeunload', (e) => {
  if (tutorialSession) return
  if (busy || pendingSave) {
    e.preventDefault()
  }
})
async function boot(): Promise<void> {
  setBusy(true, 'Opening planner…')
  try {
    await scene.attach()
    applySettings()
    anatomyView.reset()
    reslices.clear()
    refreshPanel(true)
    if (tutorialSession) {
      const runtime = await client.runtime(), demoRoot = runtime.runtimeMetadata?.demoDatasetRoot
      if (typeof demoRoot !== 'string') throw new Error('Bundled macaque images are unavailable')
      const source = await sources.addLocal(demoRoot)
      const bundle = await importNmtDemo(client, source.id)
      await activate(bundle)
      const { demoTutorial } = await import('./tutorial/workspace.ts')
      tutorial = demoTutorial({
        scene, images, anatomyView, project: () => store.project,
        display: patch => { scene.set3DDisplay(patch); refreshScene(false) },
        replace: p => store.replace(p),
        sync: async () => { let pending: Promise<void>; do { pending = imageSync; await pending } while (pending !== imageSync) },
        navigate: () => { activeFeature = 'images'; refreshPanel(true) },
      })
      app.inert = false
      await tutorial.start(bundle.project)
      return
    }
    try {
      persistence = new IndexedDbPersistence()
      queue = new SaveQueue(persistence)
      const saved = await persistence.load()
      resumeProject.hidden = !saved
      status.textContent = saved ? 'Ready · previous autosave available' : 'Ready'
    } catch (error) {
      status.textContent = `Local restore unavailable: ${error instanceof Error ? error.message : String(error)}`
    }
  } finally {
    welcome.hidden = !!store.project
    setBusy(false, status.textContent === 'Opening planner…' ? 'Ready' : (status.textContent ?? 'Ready'))
  }
}
void boot().catch((error) => {
  errorDialog(error)
  status.textContent = 'Could not initialize WebGL2'
})
