/** Resolve after reactive redraw, reveal collapsed ancestors, then move focus to the required input. */
export function revealField(root: ParentNode, key: string): void {
  requestAnimationFrame(() => {
    const target = root.querySelector<HTMLElement>(`[data-followup="${key}"]`)
    if (!target || !target.isConnected) return
    const dialog = target.closest('dialog')
    if (dialog && !dialog.open) return
    for (let parent = target.parentElement; parent; parent = parent.parentElement)
      if (parent instanceof HTMLDetailsElement) parent.open = true
    const input = target.matches('input, select, textarea')
      ? target
      : target.querySelector<HTMLElement>('input, select, textarea')
    input?.focus({ preventScroll: true })
    ;(input ?? target).scrollIntoView({ block: 'center', inline: 'nearest' })
    target.classList.add('followup-highlight')
    setTimeout(() => target.classList.remove('followup-highlight'), 2200)
  })
}

export function followupField<T extends HTMLElement>(element: T, key: string): T {
  element.dataset.followup = key
  return element
}

/** Jump to an exact labelled control in another feature, opening collapsed sections. */
export function revealLabeledControl(root:ParentNode,label:string):void {
 const controls=Array.from(root.querySelectorAll<HTMLElement>('input, select, textarea'))
 const input=controls.find(input=>input.getAttribute('aria-label')===label||input.closest('label')?.querySelector('span')?.textContent===label)
 if(!input||!input.isConnected)return
 for(let parent=input.parentElement;parent;parent=parent.parentElement)if(parent instanceof HTMLDetailsElement)parent.open=true
 input.focus({preventScroll:true});input.scrollIntoView({block:'center',inline:'nearest'})
 input.classList.add('followup-highlight');setTimeout(()=>input.classList.remove('followup-highlight'),2200)
}
