import { h } from '@brainana/ui/dom.ts'
import type { RuntimeClient } from '@brainana/core-client/runtimeClient.ts'
import { SourceManager } from '@brainana/core-client/sourceManager.ts'
import { FilesystemClient } from '@brainana/core-client/filesystemClient.ts'
import type { BrainanaManifest } from '../data/brainana.ts'
import { button, note } from './controls.ts'
export function datasetDialog(
  client: RuntimeClient,
  onLoad: (manifest: BrainanaManifest, sourceRoot: string | null) => Promise<void>,
): void {
  const sources = new SourceManager(client),
    fs = new FilesystemClient(client)
  const dialog = h('dialog', { class: 'dataset-dialog' }),
    message = h('p', { class: 'note', role: 'status' }),
    listing = h('div', { class: 'dataset-list' })
  const path = h('input', {
    type: 'text',
    placeholder: 'Path to the folder containing sub-* subjects',
    ariaLabel: 'Brainana dataset folder',
  })
  let currentSource: { id: string; root: string | null } | null = null
  const loadSubjects = async (folder: string): Promise<void> => {
    message.textContent = 'Discovering subjects…'
    listing.replaceChildren()
    try {
      const source = await sources.addLocal(folder)
      currentSource = source
      const subjects = await fs.listMonkeys(source.id)
      for (const subject of subjects) {
        const b = button(subject.label, () => void loadScans(subject.id))
        listing.append(b)
      }
      message.textContent = subjects.length
        ? 'Select a subject to choose its imaging session.'
        : 'No subjects found. Select the dataset root containing sub-* folders.'
    } catch (error) {
      message.textContent = error instanceof Error ? error.message : String(error)
    }
  }
  const loadScans = async (subjectId: string): Promise<void> => {
    if (!currentSource) return
    message.textContent = 'Reading reconstructions…'
    try {
      const initial = (await fs.getManifest(currentSource.id, subjectId)) as unknown as BrainanaManifest
      listing.replaceChildren()
      const scans = initial.scans.filter((s) => s.stream === 'cross')
      for (const scan of scans)
        listing.append(
          button(
            scan.label,
            () =>
              void (async () => {
                message.textContent = 'Loading anatomy and surfaces…'
                try {
                  const m = (await fs.getManifest(
                    currentSource!.id,
                    subjectId,
                    scan.id,
                  )) as unknown as BrainanaManifest
                  await onLoad(m, currentSource!.root)
                  dialog.close()
                } catch (error) {
                  message.textContent = error instanceof Error ? error.message : String(error)
                }
              })(),
          ),
        )
      message.textContent = scans.length
        ? 'Select the cross-sectional scan used for this plan.'
        : 'No cross-sectional scans available.'
    } catch (error) {
      message.textContent = error instanceof Error ? error.message : String(error)
    }
  }
  let browsePath = ''
  const browse = async (folder: string): Promise<void> => {
    try {
      const result = await fs.browseFs(folder)
      browsePath = result.path
      path.value = browsePath
      listing.replaceChildren()
      if (result.parent) listing.append(button('↑ Parent folder', () => void browse(result.parent!)))
      for (const e of result.entries.filter((e) => e.isDir))
        listing.append(button(e.name, () => void browse(e.path)))
      message.textContent = 'Browse to the dataset root, then choose “Find subjects”.'
    } catch (error) {
      message.textContent = error instanceof Error ? error.message : String(error)
    }
  }
  dialog.append(
    h('h2', {}, ['Load a Brainana dataset']),
    note('Choose a local dataset root, then its subject and physical imaging session.'),
    path,
    h('div', { class: 'button-row' }, [
      button('Browse folders', () => void browse(path.value || browsePath)),
      button('Find subjects', () => void loadSubjects(path.value), 'primary'),
    ]),
    message,
    listing,
    button('Cancel', () => dialog.close()),
  )
  dialog.addEventListener('close', () => dialog.remove())
  document.body.append(dialog)
  dialog.showModal()
}
