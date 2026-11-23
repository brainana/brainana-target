export function keyboardPan(event:{key:string;metaKey?:boolean;ctrlKey?:boolean;altKey?:boolean;shiftKey?:boolean},allowed:boolean,editing:boolean):[number,number]|null {
 const arrows:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,1],ArrowDown:[0,-1]}
 if(!allowed||editing||event.metaKey||event.ctrlKey||event.altKey||!arrows[event.key])return null
 const [x,y]=arrows[event.key],factor=event.shiftKey?3:1
 return [x*factor,y*factor]
}

interface KeyboardView {
  element: HTMLElement
  pan: (right: number, up: number) => void
  fit: () => void
}

/** Capture navigation before the underlying viewer can rotate or move the crosshair. */
export function bindViewerKeys(views: KeyboardView[], available: () => boolean): void {
  let hovered: KeyboardView | undefined
  let focusBeforeHover: Element | null = null
  for (const view of views) {
    view.element.addEventListener('pointerenter', event => {
      if (event.pointerType === 'touch') return
      hovered = view
      focusBeforeHover = document.activeElement
    })
    view.element.addEventListener('pointerleave', () => {
      if (hovered === view) hovered = undefined
    })
  }
  window.addEventListener('blur', () => { hovered = undefined })
  document.addEventListener('focusin', () => { focusBeforeHover = null })
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.isComposing || !available() || document.querySelector('dialog[open]')) return
    const target = event.target instanceof HTMLElement ? event.target : null
    if (target?.closest('.image-tool-window, .planning-guide, textarea, [contenteditable], [role="separator"]')) return
    const field = target?.closest('input, select, [role="slider"]')
    if (field) {
      // Returning the pointer to a viewport after changing a view control gives the
      // camera the arrows. Tabbing to that same control still lets the user adjust it.
      const viewControl = field.matches('select, input[type="range"], input[type="checkbox"], input[type="radio"], [role="slider"]')
      if (!hovered || field !== focusBeforeHover || !viewControl) return
    }
    const view = hovered ?? views.find(item => target?.tagName === 'CANVAS' && item.element.contains(target))
    if (!view || !view.element.getClientRects().length) return

    const movement = keyboardPan(event, true, false)
    const fit = event.key.toLowerCase() === 'r' && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
    if (!movement && !fit) return
    event.preventDefault()
    event.stopPropagation()
    if (movement) view.pan(...movement)
    else if (!event.repeat) view.fit()
  }, true)
}
