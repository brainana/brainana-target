import { h } from '@brainana/ui/dom.ts'
const expanded = new WeakMap<object, Map<string, boolean>>()
export function details(store: object, key: string, children: Node[]): HTMLDetailsElement {
  let state = expanded.get(store)
  if (!state) {
    state = new Map()
    expanded.set(store, state)
  }
  const element = h('details', { open: state.get(key) ?? false }, children)
  element.querySelector('summary')!.addEventListener('click', () => state!.set(key, !element.open))
  element.addEventListener('toggle', () => state!.set(key, element.open))
  element.addEventListener('change', () => state!.set(key, element.open), true)
  return element
}
