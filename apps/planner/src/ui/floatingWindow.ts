import { placeAwayFromViewer } from './windowPlacement.ts'
import { h } from '@brainana/ui/dom.ts'
import { floatingLayer } from './floatingLayer.ts'
import { button } from './controls.ts'
/** Nonmodal image tools keep the canvases usable; drag the header, or use arrow keys. */
export function floatingWindow(title: string, label: string, onClose?: () => void) {
  const root = h('section', { class: 'image-tool-window', role: 'dialog', ariaLabel: label })
  const handle = h('h2', { tabIndex: 0, title: 'Drag to move; arrow keys also move this window' }, [title])
  const content = h('div', { class: 'image-tool-content' })
  const layer = floatingLayer(root)
  let closed=false
  const dismiss = () => { if(closed)return;closed=true;window.removeEventListener?.('resize',onResize);layer.dispose(); root.remove(); onClose?.() }
  const close = button('×', dismiss)
  close.setAttribute('aria-label', `Close ${label}`)
  const actions = h('div', { class: 'window-actions' })
  root.append(h('header', { class: 'modal-head' }, [handle, actions, close]), content)
  document.body.append(root)
  layer.activate()
  let drag: { id: number; x: number; y: number; left: number; top: number } | null = null
  const position = (left: number, top: number) => {
    const b = root.getBoundingClientRect()
    root.style.left = `${Math.max(8, Math.min(left, innerWidth - b.width - 8))}px`
    root.style.top = `${Math.max(8, Math.min(top, innerHeight - b.height - 8))}px`
    root.style.right = 'auto'
    document.dispatchEvent(new Event('planning-window-move'))
  }
  const onResize=()=>{if(root.isConnected){const b=root.getBoundingClientRect();position(b.left,b.top)}}
  window.addEventListener('resize',onResize)
  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    const b = root.getBoundingClientRect()
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, left: b.left, top: b.top }
    handle.setPointerCapture(e.pointerId)
    e.preventDefault()
  })
  handle.addEventListener('pointermove', (e) => {
    if (drag?.id === e.pointerId) position(drag.left + e.clientX - drag.x, drag.top + e.clientY - drag.y)
  })
  for (const event of ['pointerup', 'pointercancel'])
    handle.addEventListener(event, () => {
      drag = null
    })
  handle.addEventListener('keydown', (e) => {
    if (!e.key.startsWith('Arrow')) return
    const b = root.getBoundingClientRect()
    position(
      b.left + (e.key === 'ArrowRight' ? 20 : e.key === 'ArrowLeft' ? -20 : 0),
      b.top + (e.key === 'ArrowDown' ? 20 : e.key === 'ArrowUp' ? -20 : 0),
    )
    e.preventDefault()
  })
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      dismiss()
    }
  })
  const placeBeside=(viewer:Element|null)=>placeAwayFromViewer(root,viewer)
  return { root, content, actions, activate: layer.activate, close: dismiss, placeBeside }
}
