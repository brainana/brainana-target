import { h } from '@brainana/ui/dom.ts'

interface Layout {
  sidebar: number
  column: number
  row: number
}
const initial = (): Layout => ({ sidebar: 310, column: 0.235, row: 1.25 / 2.25 })
const storageKey = 'brainana-target-panel-layout-v1'
/** Layout preferences stay separate from saved scientific geometry and edit history. */
export function resizablePanels(workspace: HTMLElement, views: HTMLElement): () => void {
  let layout = initial()
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as Partial<Layout> | null
    if (
      saved &&
      Number.isFinite(saved.sidebar) &&
      Number.isFinite(saved.column) &&
      Number.isFinite(saved.row)
    )
      layout = {
        sidebar: Math.max(240, Math.min(680, saved.sidebar!)),
        column: Math.max(0.2, Math.min(0.8, saved.column!)),
        row: Math.max(0.2, Math.min(0.8, saved.row!)),
      }
  } catch {
    /* Storage may be unavailable; layout remains usable. */
  }
  const refreshSeparators: Array<() => void> = []
  const apply = (): void => {
    const navWidth = workspace.querySelector('.workflow')!.getBoundingClientRect().width
    layout.sidebar = Math.min(
      layout.sidebar,
      Math.max(240, Math.min(680, workspace.clientWidth - navWidth - 480)),
    )
    workspace.style.setProperty('--inspector-width', `${layout.sidebar}px`)
    views.style.setProperty('--view-left', `${layout.column}fr`)
    views.style.setProperty('--view-right', `${1 - layout.column}fr`)
    views.style.setProperty('--view-top', `${layout.row}fr`)
    views.style.setProperty('--view-bottom', `${1 - layout.row}fr`)
    views.style.setProperty('--column-divider', `${layout.column * 100}%`)
    views.style.setProperty('--row-divider', `${layout.row * 100}%`)
    refreshSeparators.forEach((refresh) => refresh())
  }
  const save = (): void => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(layout))
    } catch {
      /* Optional preference. */
    }
  }
  const separator = (name: string, kind: 'sidebar' | 'column' | 'row'): HTMLElement => {
    const element = h('div', {
      class: `panel-divider divider-${kind}`,
      role: 'separator',
      tabIndex: 0,
      ariaLabel: name,
    })
    element.setAttribute('aria-orientation', kind === 'row' ? 'horizontal' : 'vertical')
    element.title = 'Drag to resize. Arrow keys adjust; double-click resets.'
    const refreshValue = (): void => {
      element.setAttribute(
        'aria-valuenow',
        String(Math.round(kind === 'sidebar' ? layout.sidebar : layout[kind] * 100)),
      )
      element.setAttribute('aria-valuemin', kind === 'sidebar' ? '240' : '20')
      element.setAttribute('aria-valuemax', kind === 'sidebar' ? '680' : '80')
    }
    const resize = (value: number): void => {
      if (kind === 'sidebar') {
        const max = Math.max(240, Math.min(680, workspace.clientWidth - 78 - 480))
        layout.sidebar = Math.max(240, Math.min(max, value))
      } else layout[kind] = Math.max(0.2, Math.min(0.8, value))
      apply()
      refreshValue()
    }
    let dragging = false
    element.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return
      event.preventDefault()
      dragging = true
      element.setPointerCapture(event.pointerId)
      document.body.classList.add('resizing-panels')
    })
    element.addEventListener('pointermove', (event) => {
      if (!dragging) return
      const rect = (kind === 'sidebar' ? workspace : views).getBoundingClientRect()
      resize(
        kind === 'sidebar'
          ? event.clientX - rect.left - workspace.querySelector('.workflow')!.getBoundingClientRect().width
          : kind === 'column'
            ? (event.clientX - rect.left) / rect.width
            : (event.clientY - rect.top) / rect.height,
      )
    })
    const finish = (event: PointerEvent): void => {
      if (!dragging) return
      dragging = false
      document.body.classList.remove('resizing-panels')
      if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId)
      save()
    }
    element.addEventListener('pointerup', finish)
    element.addEventListener('pointercancel', finish)
    element.addEventListener('lostpointercapture', () => {
      dragging = false
      document.body.classList.remove('resizing-panels')
    })
    element.addEventListener('dblclick', () => {
      resize(initial()[kind])
      save()
    })
    element.addEventListener('keydown', (event) => {
      const backward = kind === 'row' ? 'ArrowUp' : 'ArrowLeft'
      const forward = kind === 'row' ? 'ArrowDown' : 'ArrowRight'
      if (event.key !== backward && event.key !== forward) return
      event.preventDefault()
      resize(layout[kind] + (event.key === forward ? 1 : -1) * (kind === 'sidebar' ? 20 : 0.03))
      save()
    })
    refreshSeparators.push(refreshValue)
    refreshValue()
    return element
  }
  workspace.insertBefore(
    separator('Resize settings panel', 'sidebar'),
    workspace.querySelector('.visual-workspace'),
  )
  views.append(separator('Resize view columns', 'column'))
  apply()
  new ResizeObserver(apply).observe(workspace)
  return () => { layout = initial(); apply(); save() }
}
