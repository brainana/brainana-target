import { h } from '@brainana/ui/dom.ts'
import type { Project } from '@brainana/planning-core/model.ts'
import type { NiiVuePlanningScene } from '../render/scene.ts'
import type { imageFiles } from '../ui/imageFiles.ts'
import type { anatomyModes } from '../ui/anatomyModes.ts'
import { button, note } from '../ui/controls.ts'
import { floatingWindow } from '../ui/floatingWindow.ts'
import { imageLesson, TutorialPlayer, type StepRequest, type TutorialState } from './player.ts'
import { lessonPoint, lessonProject, permittedPracticeEdit } from './checkpoints.ts'
import './tutorial.css'

interface Context {
  scene: NiiVuePlanningScene
  images: ReturnType<typeof imageFiles>
  anatomyView: ReturnType<typeof anatomyModes>
  project: () => Project | null
  replace: (project: Project) => void
  sync: () => Promise<void>
  navigate: () => void
  display: (patch: { anatomyOpacity: number; skullOpacity?: number }) => void
}
export interface DemoTutorial {
  start: (project: Project) => Promise<void>
  allowsEdit: (before: Project, candidate: Project) => boolean
  edited: () => void
}

/** The ordinary planner owns all viewers and controls. This only directs the lesson. */
export function demoTutorial(ctx: Context): DemoTutorial {
  document.body.classList.add('demo-lesson-session')
  let baseline: Project, ctId = '', player: TutorialPlayer, disposed = false
  const tool = floatingWindow('Demo tutorials', 'Macaque demo tutorial controls', exit)
  tool.root.classList.add('demo-lesson-window')
  const title = h('h3', { ariaLive: 'polite' }), count = h('span', { class: 'eyebrow' })
  const instruction = h('p'), explanation = note(''), feedback = h('output', { class: 'demo-lesson-readout', ariaLive: 'polite' })
  const section = h('select', { ariaLabel: 'Tutorial section' }, [h('option', {}, ['Macaque · Images and display'])])
  const progress = h('input', { type: 'range', min: '0', max: String(imageLesson.length - 1), step: '1', ariaLabel: 'Tutorial progress' })
  const previous = button('← Back', () => { void player.seek(player.state.index - 1) })
  const next = button('Next →', () => { void player.next() }, 'primary')
  const replay = button('Show me', () => { void player.seek(player.state.index, false, true) })
  const practice = button('Try it', () => { void player.seek(player.state.index, true) })
  const reset = button('Reset this step', () => { void player.seek(player.state.index, true) })
  const restore = button('Restore view', () => restoreView())
  const restart = button('Start again', () => { void player.seek(0) })
  tool.actions.append(restart)
  const showControls = button('Show controls', () => { void showTool(player.state.index); highlight(player.state.index) })
  const body = h('div', { class: 'demo-lesson-text' }, [
    h('label', { class: 'field demo-lesson-section' }, ['Section', section]), title, instruction, explanation, feedback,
    h('div', { class: 'button-row' }, [showControls, restore]),
  ])
  const footer = h('footer', { class: 'demo-lesson-footer' }, [
    h('label', { class: 'field' }, [count, progress]),
    h('div', { class: 'button-row' }, [previous, replay, practice, reset, next]),
  ])
  tool.content.append(body, footer)
  tool.root.style.top = 'auto'; tool.root.style.bottom = '44px'; tool.root.style.right = '18px'

  function exit(): void {
    if (disposed) return
    disposed = true; player?.dispose(); observer.disconnect()
    if (window.parent !== window) window.parent.postMessage({ type: 'brainana-demo-tutorial-exit' }, location.origin)
    else location.assign('/')
  }
  function currentPractice(): string {
    return player?.state.phase === 'practice' ? imageLesson[player.state.index].practice : 'none'
  }
  function allowed(element: Element): boolean {
    if (element.closest('.demo-lesson-window')) return true
    const label = element.getAttribute('aria-label') ?? '', p = currentPractice()
    if (element.matches('canvas') || element.closest('.camera-buttons')) return true
    if (element.matches('.image-tool-window>.modal-head h2, .image-tool-window>.modal-head')) return true
    if (element.matches('.image-tool-window button') && (label.startsWith('Close ') || element.textContent === 'Close')) return true
    if (label === 'Image layers' && ['blend', 'opacity'].includes(imageLesson[player?.state.index ?? 0].id)) return true
    if (p === 'image') return label === 'Anatomical image'
    if (p === 'window') return ['Anatomy brightness', 'Anatomy contrast', 'Anatomy display settings', 'Display minimum', 'Display minimum value', 'Display maximum', 'Display maximum value', 'Window center', 'Window center value', 'Window width', 'Window width value'].includes(label)
    if (p === 'blend') return label === 'Blend other MRI and CT images' || label === `Show ${baseline?.assets.find(a => a.id === ctId)?.name}`
    if (p === 'opacity') return ['Overlay opacity', 'Overlay opacity value'].includes(label) || (element as HTMLElement).dataset.imageAdjust === ctId
    if (p === 'layout') return label === 'Anatomy view mode'
    if (p === 'brain') return label === 'Brain opacity in 3D' || label === 'Toggle brain visibility in 3D'
    return false
  }
  function restrict(): void {
    if (disposed) return
    for (const element of document.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>('button,input,select')) {
      const disabled = !allowed(element)
      if (element.disabled !== disabled) element.disabled = disabled
      if (element instanceof HTMLSelectElement && element.getAttribute('aria-label') === 'Anatomical image' && baseline)
        for (const option of element.options) {
          const disabled = ![baseline.frame.referenceAssetId, ctId].includes(option.value)
          if (option.disabled !== disabled) option.disabled = disabled
        }
    }
  }
  const observer = new MutationObserver(() => { restrict(); positionHighlight() })
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] })
  const block = (event: Event) => {
    const target = event.target instanceof Element ? event.target : null
    if (!target || target.closest('.demo-lesson-window')) return
    const control = target.closest('button,input,select,a,summary,[role="separator"]')
    if (control && !allowed(control)) { event.preventDefault(); event.stopImmediatePropagation() }
  }
  for (const type of ['click', 'input', 'change', 'pointerdown']) document.addEventListener(type, block, true)
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); exit(); return }
    if ((event.metaKey || event.ctrlKey) && ['s', 'o', 'z', 'y'].includes(event.key.toLowerCase())) { event.preventDefault(); event.stopImmediatePropagation() }
  }, true)

  const marker = h('div', { class: 'demo-lesson-highlight', ariaHidden: 'true' })
  document.body.append(marker)
  let highlighted: Element | null = null
  function positionHighlight(): void {
    if (!highlighted?.isConnected || tool.root.hidden) { marker.hidden = true; return }
    const r = highlighted.getBoundingClientRect()
    marker.hidden = !r.width || !r.height
    Object.assign(marker.style, { left: `${r.left - 3}px`, top: `${r.top - 3}px`, width: `${r.width + 6}px`, height: `${r.height + 6}px` })
    marker.style.zIndex = String(Number(highlighted.closest<HTMLElement>('.image-tool-window')?.style.zIndex || 54) + 1)
  }
  function highlight(index: number): void {
    const id = imageLesson[index].id
    const query: Record<string, string> = {
      images: '.inspector', image: '[aria-label="Anatomical image"]', slices: '[aria-label="Cardinal anatomy slices"]',
      window: '.image-quick-controls', blend: '[aria-label="Blend other MRI and CT images"]',
      opacity: '[aria-label="Overlay opacity"]', layout: '[aria-label="Anatomy view mode"]', brain: '[aria-label="Brain opacity in 3D"]',
    }
    highlighted = document.querySelector(query[id]); positionHighlight()
  }
  document.addEventListener('scroll', positionHighlight, true)
  document.addEventListener('planning-window-move', positionHighlight)
  window.addEventListener('resize', positionHighlight)

  async function showTool(index: number): Promise<void> {
    if (imageLesson[index].id === 'opacity') {
      await ctx.images.adjustImage(ctId)
      const window = document.querySelector<HTMLElement>(`[data-image-display="${ctId}"]`)
      if (window) {
        const rect = document.querySelector('.visual-workspace')!.getBoundingClientRect()
        const leftOfGuide = tool.root.getBoundingClientRect().left - 462
        window.style.left = `${Math.max(8, Math.min(rect.left + rect.width * .3, innerWidth - 470, leftOfGuide))}px`
        window.style.right = 'auto'; window.style.top = '82px'
        window.style.width = '450px'; window.style.height = `${Math.min(420, innerHeight * .48)}px`
        window.querySelector('[aria-label="Overlay opacity"]')?.scrollIntoView({ block: 'center' })
      }
      tool.activate()
    }
    restrict()
  }
  function restoreView(): void {
    ctx.anatomyView.reset()
    ctx.scene.slices.setPan2Dxyzmm([0, 0, 0, 1])
    ctx.scene.render.setRenderAzimuthElevation(120, 20)
    ctx.scene.focus3D()
    ctx.scene.moveCrosshair(lessonPoint(player?.state.index ?? 0))
  }
  async function wait(ms: number, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    await new Promise<void>((resolve, reject) => {
      const stop = () => { clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')) }
      const timer = setTimeout(() => { signal.removeEventListener('abort', stop); resolve() }, ms)
      signal.addEventListener('abort', stop, { once: true })
    })
  }
  async function apply(index: number, request: StepRequest): Promise<void> {
    ctx.images.closeTools(); ctx.navigate()
    const p = lessonProject(baseline, ctId, index), id = imageLesson[index].id
    const animate = request.animate && !matchMedia('(prefers-reduced-motion: reduce)').matches
    if (animate && id === 'window') p.assets.find(a => a.id === p.frame.referenceAssetId)!.imageDisplay = structuredClone(baseline.assets.find(a => a.id === p.frame.referenceAssetId)!.imageDisplay)
    ctx.replace(p)
    ctx.display({ anatomyOpacity: id === 'brain' && !animate ? .35 : 1, skullOpacity: 0 })
    await ctx.sync(); request.signal.throwIfAborted()
    restoreView(); highlight(index)
    if (animate && id === 'slices') for (const s of [20, 22, 24, 26, 28]) { request.signal.throwIfAborted(); ctx.scene.moveCrosshair([0, 10, s]); await wait(130, request.signal) }
    if (animate && id === 'window') {
      await wait(250, request.signal)
      ctx.replace(lessonProject(baseline, ctId, index)); await ctx.sync(); request.signal.throwIfAborted()
    }
    if (id === 'opacity') { await showTool(index); request.signal.throwIfAborted(); highlight(index) }
    if (id === 'brain' && animate) { ctx.display({ anatomyOpacity: .35 }); await wait(450, request.signal) }
  }
  function updateReadout(): void {
    if (!player) return
    const p = ctx.project(), id = imageLesson[player.state.index].id, ct = ctx.scene.imageForAsset(ctId)
    if (id === 'opacity' || id === 'blend') feedback.textContent = `CT in the slices: ${Math.round((ct?.opacity ?? 0) * 100)}%. The 3D brain has a separate opacity control.`
    else if (id === 'brain') feedback.textContent = `3D brain opacity: ${Math.round(ctx.scene.display.anatomyOpacity * 100)}%.`
    else if (id === 'image') feedback.textContent = `${p?.display.anatomyAssetId === ctId ? 'CT' : 'MRI'} is the main slice image.`
    else if (player.state.phase === 'practice') feedback.textContent = player.state.practiced ? 'The view has changed. You can keep trying, reset this step, or continue.' : 'The controls for this step are available. Try changing the view, then continue when you are ready.'
    else feedback.textContent = ''
  }
  function renderState(state: TutorialState): void {
    const step = imageLesson[state.index], practicing = state.phase === 'practice', finished = state.phase === 'finished'
    count.textContent = finished ? 'Finished' : `Step ${state.index + 1} of ${imageLesson.length}${practicing ? ' · Your turn' : ''}`
    const text = finished ? 'You have finished this section' : step.title
    if (title.textContent !== text) title.textContent = text
    instruction.textContent = finished ? 'You can return to any step with the slider, start again, or exit to your project.' : step.action
    explanation.textContent = finished ? '' : step.notice
    progress.value = String(state.index); progress.setAttribute('aria-valuetext', `${state.index + 1} of ${imageLesson.length}: ${step.title}`)
    previous.disabled = state.index === 0
    next.disabled = state.phase === 'loading' || state.phase === 'error' || finished
    next.textContent = state.index === imageLesson.length - 1 ? 'Finish section' : 'Next →'
    practice.hidden = practicing || step.practice === 'none' || finished
    practice.disabled = replay.disabled = state.phase === 'loading'
    replay.hidden = finished; reset.hidden = !practicing
    reset.disabled = state.phase === 'loading'
    if (state.phase === 'loading') feedback.textContent = 'Showing this step…'
    else if (state.phase === 'error') feedback.textContent = `${state.error}. Choose Show me to retry.`
    else updateReadout()
    restrict(); highlight(state.index)
    if (!['loading', 'error'].includes(state.phase)) try { localStorage.setItem('brainana-demo-tutorial-progress-v2', JSON.stringify({ section: 'images', step: state.index })) } catch { /* Progress is optional. */ }
  }
  progress.addEventListener('input', () => { void player.seek(progress.valueAsNumber) })
  section.addEventListener('change', () => { void player.seek(0) })
  const viewed = () => {
    if (['slices', 'layout', 'brain'].includes(currentPractice())) { player.practiced(); updateReadout() }
  }
  for (const type of ['input', 'change', 'pointerup', 'wheel', 'keyup', 'click']) document.addEventListener(type, event => {
    const target = event.target instanceof Element ? event.target : null
    if (target && !target.closest('.demo-lesson-window') && (target.matches('canvas,[aria-label="Anatomy view mode"],[aria-label="Brain opacity in 3D"],[aria-label="Toggle brain visibility in 3D"]') || target.closest('.camera-buttons'))) viewed()
  })
  window.addEventListener('pagehide', () => { disposed = true; player?.dispose(); observer.disconnect(); marker.remove() }, { once: true })
  return {
    async start(project) {
      ctId = project.assets.find(a => a.role === 'ct')!.id
      baseline = structuredClone(project)
      const mri = baseline.assets.find(a => a.id === baseline.frame.referenceAssetId)!
      mri.imageDisplay ??= ctx.scene.defaultsForImage(mri.id)!
      let initial = 0
      try { const saved = JSON.parse(localStorage.getItem('brainana-demo-tutorial-progress-v2') ?? 'null'); if (Number.isInteger(saved?.step) && saved.step >= 0 && saved.step < imageLesson.length) initial = saved.step } catch { /* Start from the beginning. */ }
      player = new TutorialPlayer(apply, renderState, initial)
      await player.seek(initial)
    },
    allowsEdit(before, candidate) { return permittedPracticeEdit(before, candidate, ctId, currentPractice()) },
    edited() {
      const revision = player?.revision
      void ctx.sync().then(() => {
        if (disposed || player?.revision !== revision || player.state.phase !== 'practice') return
        player.practiced(); updateReadout()
      })
    },
  }
}
