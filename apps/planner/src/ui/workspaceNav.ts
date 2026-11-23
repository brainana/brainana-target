import { h } from '@brainana/ui/dom.ts'

export const workspaceHomeLink = () =>
  h('a', { class: 'workspace-home', href: '/' }, ['← Home'])
