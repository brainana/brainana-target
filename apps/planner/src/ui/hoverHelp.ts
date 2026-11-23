import {controlExplanation} from './controlHelp.ts'
import { h } from '@brainana/ui/dom.ts'
let tip: HTMLElement | null = null
let owner: HTMLElement | null = null
let sequence = 0
let timer: ReturnType<typeof setTimeout> | undefined
let interacting = false
const explanations=new WeakMap<HTMLElement,string|(()=>string)>()
const nativeTitles=new Map<HTMLElement,string>()
function hide(): void {
  clearTimeout(timer)
  for(const [element,title] of nativeTitles)if(!element.title)element.title=title
  nativeTitles.clear()
  owner?.removeAttribute('aria-describedby')
  tip?.remove()
  tip = null
  owner = null
}
document.addEventListener('pointerdown', () => { interacting = true; hide() }, true)
document.addEventListener('pointerup', () => { interacting = false }, true)
document.addEventListener('pointercancel', () => { interacting = false }, true)
document.addEventListener('input', hide, true)
document.addEventListener('wheel', hide, true)
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') hide()
})
document.addEventListener('pointermove', () => {
  if (owner && !owner.isConnected) hide()
})
/** Available on hover and keyboard focus, including aria-disabled controls and modal dialogs. */
export function hoverHelp(element: HTMLElement, explanation: string | (() => string)): void {
  const existing=explanations.has(element)
  explanations.set(element,explanation)
  element.dataset.hoverHelp='true'
  if(existing)return
  const show = (): void => {
    hide()
    if (interacting || document.documentElement.dataset.helpTips === 'false') return
    const current=explanations.get(element)!
    const text = typeof current === 'function' ? current() : current
    if (!text) return
    owner = element
    for(const titled of [element,...Array.from(element.querySelectorAll<HTMLElement>('[title]'))])if(titled.title){nativeTitles.set(titled,titled.title);titled.title=''}
    tip = h('div', { class: 'hover-help', role: 'tooltip', id: `hover-help-${++sequence}` }, [text])
    element.setAttribute('aria-describedby', tip.id)
    ;(element.closest('dialog') ?? document.body).append(tip)
    const bounds = element.getBoundingClientRect()
    // Place outside the entire control, never over a slider's track.
    const width = tip.offsetWidth, height = tip.offsetHeight
    let left = bounds.right + 12, top = bounds.top
    if (left + width > innerWidth - 8) {
      if (bounds.left - width - 12 >= 8) left = bounds.left - width - 12
      else { left = Math.max(8, Math.min(bounds.left, innerWidth - width - 8)); top = bounds.bottom + 12 }
    }
    if (top + height > innerHeight - 8) top = bounds.top - height - 12
    top = Math.max(8, top)
    if (left < bounds.right && left + width > bounds.left && top < bounds.bottom && top + height > bounds.top) {
      hide() // A crowded viewport is preferable to covering the active control.
      return
    }
    tip.style.left = `${left}px`
    tip.style.top = `${top}px`
  }
  element.addEventListener('pointerenter', () => { clearTimeout(timer); timer = setTimeout(show, 600) })
  element.addEventListener('focusin', () => { if (!interacting) { clearTimeout(timer); timer = setTimeout(show, 600) } })
  element.addEventListener('pointerleave', hide)
  element.addEventListener('focusout', hide)
}

let installed=false
/** Covers dynamically created dialogs and controls as well as the main sidebar. */
export function installControlHelp():void{
 if(installed)return;installed=true
 const prepare=(event:Event)=>{
  const target=event.target as HTMLElement|null
  if(!target?.closest)return
  const control=target.closest<HTMLElement>('button,input:not([type=hidden]),select,textarea,summary,[role=separator],[role=button]')
  if(!control)return
  const registered=control.closest<HTMLElement>('[data-hover-help]')
  const owner=registered??control.closest<HTMLElement>('label')??control
  if(event instanceof MouseEvent&&event.relatedTarget instanceof Node&&owner.contains(event.relatedTarget))return
  if(!registered)hoverHelp(owner,()=>controlExplanation(control))
  owner.dispatchEvent(new Event('pointerenter'))
 }
 document.addEventListener('pointerover',prepare,true)
 document.addEventListener('focusin',prepare,true)
 document.addEventListener('scroll',hide,true)
}
