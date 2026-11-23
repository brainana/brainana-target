import { h } from '@brainana/ui/dom.ts'
import { button } from './controls.ts'
import '../tutorial/tutorial.css'

/** A separate document keeps project state, drafts, history and autosave out of the lesson. */
export function demoTutorialLauncher() {
  let dialog: HTMLDialogElement | null = null
  return () => {
    if (dialog?.isConnected) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const frame = h('iframe', { title: 'Macaque demo tutorial', src: '?workspace=tutorial' })
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin')
    const close = () => {
      window.removeEventListener('message', message)
      dialog?.close()
      dialog?.remove()
      dialog = null
      previous?.focus({ preventScroll: true })
    }
    const message = (event: MessageEvent) => {
      if (event.origin === location.origin && event.source === frame.contentWindow && event.data?.type === 'brainana-demo-tutorial-exit') close()
    }
    dialog = h('dialog', { class: 'demo-tutorial-host', ariaLabel: 'Demo tutorials' }, [
      h('div', { class: 'demo-tutorial-host-bar' }, [h('span', {}, ['Demo tutorials · Macaque']), button('Exit tutorial', close)]), frame,
    ])
    dialog.addEventListener('cancel', event => { event.preventDefault(); close() })
    window.addEventListener('message', message)
    document.body.append(dialog)
    dialog.showModal()
    frame.focus()
  }
}
