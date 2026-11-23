import {floatingLayer} from './floatingLayer.ts'
import { placeAwayFromViewer } from './windowPlacement.ts'
import { h } from '@brainana/ui/dom.ts'
import { labelColor } from '@brainana/brainana-data/atlas.ts'
import type { NiiVuePlanningScene } from '../render/scene.ts'
import { button, note } from './controls.ts'
import type { AtlasRegion } from '../render/atlasRegions.ts'
export function atlasWindow(
  scene: NiiVuePlanningScene,
  source: HTMLSelectElement,
  load: () => void,
  loadLabels: () => void,
  visible: () => boolean,
  setVisible: (value: boolean) => void,
  addTarget: (region: AtlasRegion) => void,
) {
  const root = h('div', { class: 'atlas-window', role: 'dialog', ariaLabel: 'Atlas explorer', hidden: true })
  const layer=floatingLayer(root)
  const title = h('h2', { tabIndex: 0 }, ['Atlas explorer · drag to move'])
  const select = h('select', { ariaLabel: 'Atlas explorer dataset' })
  select.addEventListener('change', () => {
    source.value = select.value
    source.dispatchEvent(new Event('change'))
  })
  const opacity = h('input', { type: 'range', min: '0', max: '1', step: '0.01', ariaLabel: 'Atlas opacity' })
  const value = h('output')
  opacity.addEventListener('input', () => {
    scene.setAtlasDisplay({ opacity: opacity.valueAsNumber })
    value.textContent = `${Math.round(scene.atlasOpacity * 100)}%`
  })
  const outline = h('input', { type: 'checkbox', ariaLabel: 'Atlas outlines only' })
  outline.addEventListener('change', () => scene.setAtlasDisplay({ outline: outline.checked }))
  const show = h('input', { type: 'checkbox', ariaLabel: 'Show atlas overlay' })
  show.addEventListener('change', () => setVisible(show.checked))
  const isolate = h('input', { type: 'checkbox', ariaLabel: 'Isolate selected atlas region' })
  isolate.addEventListener('change', () => {
    if (isolate.checked && selected) {
      const hidden = new Set(scene.atlasHidden)
      hidden.delete(selected.label.id)
      scene.setAtlasDisplay({ hidden: [...hidden], isolated: selected.label.id })
    } else scene.setAtlasDisplay({ isolated: null })
    drawList()
  })
  const hiddenNow = () =>
    new Set(
      scene.atlasRegions
        .filter(
          (r) =>
            scene.atlasHidden.has(r.label.id) ||
            (scene.atlasIsolated !== null && r.label.id !== scene.atlasIsolated),
        )
        .map((r) => r.label.id),
    )
  const applyHidden = (hidden: Set<number>) => {
    scene.setAtlasDisplay({ hidden: [...hidden], isolated: null })
    isolate.checked = false
    drawList()
  }
  const all = button('Show all', () => {
    applyHidden(new Set())
    setVisible(true)
  })
  const none = button('Show none', () => applyHidden(new Set(scene.atlasRegions.map((r) => r.label.id))))
  const invert = button('Invert', () => {
    const previous = hiddenNow()
    applyHidden(new Set(scene.atlasRegions.filter((r) => !previous.has(r.label.id)).map((r) => r.label.id)))
  })
  const search = h('input', {
    type: 'search',
    ariaLabel: 'Search atlas regions',
    placeholder: 'Name, abbreviation, region, hemisphere or ID',
  })
  const list = h('div', { class: 'atlas-region-list', role: 'list', ariaLabel: 'Atlas regions' })
  const current = h('p', { class: 'note' }),
    status = h('p', { class: 'note' }),
    info = h('p', { class: 'note' })
  let selected: AtlasRegion | undefined, key: unknown
  const locate = button('Locate selected region', () => {
    if (selected) scene.moveCrosshair(selected.point)
  })
  const target = button(
    'Add target in selected region',
    () => {
      if (selected) addTarget(selected)
    },
    'primary',
  )
  const drawList = () => {
    const query = search.value.trim().toLowerCase()
    const matches = scene.atlasRegions.filter((r) =>
      `${r.label.id} ${r.label.name} ${r.label.nameShort ?? ''} ${r.label.region} ${r.label.hemi}`
        .toLowerCase()
        .includes(query),
    )
    const hidden = hiddenNow()
    status.textContent = `${scene.atlasRegions.length - hidden.size} of ${scene.atlasRegions.length} regions visible · ${matches.length} search matches. Showing up to 250 matches.`
    for (const control of [all, none, invert]) control.disabled = !scene.atlasRegions.length
    list.replaceChildren(
      ...matches.slice(0, 250).map((r) => {
        const swatch = h('span', { class: 'atlas-swatch' })
        swatch.style.background = `rgb(${labelColor(r.label, 0).join(',')})`
        const item = button(
          `${r.label.id} · ${r.label.name.replace(/_/g, ' ')}${r.label.hemi ? ' · ' + r.label.hemi : ''}`,
          () => {
            selected = r
            if (isolate.checked) {
              const hidden = new Set(scene.atlasHidden)
              hidden.delete(r.label.id)
              scene.setAtlasDisplay({ hidden: [...hidden], isolated: r.label.id })
            }
            drawList()
          },
        )
        const check = h('input', {
          type: 'checkbox',
          ariaLabel: `Show atlas region ${r.label.id} · ${r.label.name.replace(/_/g, ' ')}`,
        })
        check.dataset.regionId = String(r.label.id)
        check.checked = !hidden.has(r.label.id)
        check.addEventListener('change', () => {
          const next = hiddenNow()
          if (check.checked) next.delete(r.label.id)
          else next.add(r.label.id)
          applyHidden(next)
          list
            .querySelector<HTMLInputElement>(`input[data-region-id="${r.label.id}"]`)
            ?.focus({ preventScroll: true })
        })
        item.prepend(swatch)
        item.setAttribute('aria-pressed', String(selected?.label.id === r.label.id))
        return h('div', { class: 'atlas-region-row', role: 'listitem' }, [check, item])
      }),
    )
    locate.disabled = target.disabled = !selected
    isolate.disabled = !selected
    info.textContent = selected
      ? `${selected.label.name.replace(/_/g, ' ')} · ${selected.count.toLocaleString()} voxels. Navigation and target creation use an actual region voxel nearest its centroid; verify it in the anatomy before planning.`
      : 'Select a region to locate it or create a target. Imported images must already align to the anatomy in RAS millimetres.'
  }
  search.addEventListener('input', drawList)
  root.append(
    h('div', { class: 'atlas-titlebar' }, [
      title,
      button('Close atlas explorer', () => {
        root.hidden = true
      }),
    ]),
    select,
    h('div', { class: 'button-row' }, [
      button('Manage atlas files…', load),
      button('Load atlas labels TSV…', loadLabels),
    ]),
    note(
      "An atlas image uses a different whole-number value for each region. Loading it does not align it to your images. You can load a TSV text file to add region names and colors.",
    ),
    h('div', { class: 'atlas-display-options' }, [
      h('label', {}, [show, 'Show overlay']),
      h('label', {}, [outline, 'Outlines only']),
      h('label', {}, [isolate, 'Isolate selected region']),
      h('label', {}, ['Opacity ', opacity, value]),
    ]),
    current,
    h('div', { class: 'button-row' }, [all, none, invert]),
    note(
      'Visibility buttons affect every region in the atlas, including regions outside the current search results.',
    ),
    search,
    status,
    list,
    info,
    h('div', { class: 'button-row' }, [locate, target]),
  )
  const body=h('div',{class:'atlas-window-content'})
  for(const child of Array.from(root.children).slice(1))body.append(child)
  root.append(body)
  let drag: { id: number; x: number; y: number; left: number; top: number } | null = null
  const position = (left: number, top: number) => {
    const b = root.getBoundingClientRect()
    root.style.left = `${Math.max(8, Math.min(left, innerWidth - b.width - 8))}px`
    root.style.top = `${Math.max(8, Math.min(top, innerHeight - b.height - 8))}px`
  }
  title.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    const b = root.getBoundingClientRect()
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, left: b.left, top: b.top }
    title.setPointerCapture(e.pointerId)
    e.preventDefault()
  })
  title.addEventListener('pointermove', (e) => {
    if (drag?.id === e.pointerId) position(drag.left + e.clientX - drag.x, drag.top + e.clientY - drag.y)
  })
  for (const event of ['pointerup', 'pointercancel'])
    title.addEventListener(event, () => {
      drag = null
    })
  title.addEventListener('keydown', (e) => {
    if (!e.key.startsWith('Arrow')) return
    const b = root.getBoundingClientRect()
    position(
      b.left + (e.key === 'ArrowRight' ? 20 : e.key === 'ArrowLeft' ? -20 : 0),
      b.top + (e.key === 'ArrowDown' ? 20 : e.key === 'ArrowUp' ? -20 : 0),
    )
    e.preventDefault()
  })
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') root.hidden = true
  })
  window.addEventListener('resize', () => {
    if (!root.hidden) {
      const b = root.getBoundingClientRect()
      position(b.left, b.top)
    }
  })
  const updateLocation = () => {
    const p = scene.crosshair,
      label = scene.atlasReadout(p)
    current.textContent = `Crosshair: ${p.map((v) => v.toFixed(2)).join(' · ')} mm RAS · ${label?.label ?? 'No atlas region'}`
  }
  const update = () => {
    select.replaceChildren(
      ...Array.from(source.options).map((o) => h('option', { value: o.value }, [o.textContent ?? ''])),
    )
    select.value = source.value
    select.disabled = !scene.anatomy
    show.disabled = opacity.disabled = outline.disabled = !scene.atlas
    show.checked = visible()
    opacity.value = String(scene.atlasOpacity)
    value.textContent = `${Math.round(scene.atlasOpacity * 100)}%`
    outline.checked = scene.atlasOutline
    if (key !== scene.atlasRegions) {
      key = scene.atlasRegions
      selected = undefined
      search.value = ''
      isolate.checked = false
      drawList()
    }
    updateLocation()
  }
  document.body.append(root)
  return {
    update,
    updateLocation,
    open: () => {
      update()
      root.hidden = false
      layer.activate()
      placeAwayFromViewer(root,document.querySelector?.('[aria-label="Cardinal anatomy slices"]')?.closest('.view-pane')??null)
      title.focus()
    },
  }
}
