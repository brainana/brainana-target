// Keep nonmodal tools independently usable without stealing keyboard focus.
const windows: HTMLElement[] = []
export function floatingLayer(root: HTMLElement) {
  const activate = () => {
    const others = windows.filter(w => w !== root && w.isConnected)
    windows.splice(0, windows.length, ...others, root)
    windows.forEach((w, i) => { w.style.zIndex = String(60 + i * 3) })
    document.dispatchEvent(new Event('planning-window-move'))
  }
  root.addEventListener('pointerdown', activate, true)
  root.addEventListener('focusin', activate)
  return { activate, dispose: () => { const i = windows.indexOf(root); if (i >= 0) windows.splice(i, 1) } }
}
