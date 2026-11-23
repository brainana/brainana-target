import { h } from '@brainana/ui/dom.ts'
import { button, note } from './controls.ts'
import { parseAtlasTsv } from '@brainana/brainana-data/atlas.ts'

/** Manual atlas import is an overlay import, never a registration operation. */
export function atlasImport(load: (file: File, name: string, tsv: string | null) => Promise<void>): void {
  const image = h('input', { type: 'file', accept: '.nii,.gz,.mgz', ariaLabel: 'Aligned atlas image' })
  const labels = h('input', { type: 'file', accept: '.tsv', ariaLabel: 'Atlas label table (optional)' })
  const name = h('input', { type: 'text', ariaLabel: 'Atlas name', placeholder: 'Defaults to filename' })
  const error = h('p', { role: 'alert', class: 'atlas-import-error' })
  const dialog = h('dialog', { class: 'atlas-import', ariaLabel: 'Load an aligned atlas' }, [
    h('h2', {}, ['Load an aligned atlas']),
    note(
      "The atlas must already line up with your anatomical image. Loading it does not align the images. Different image sizes and voxel sizes are allowed if their position information matches. Check the overlay in all three slice views before using its region names for targets.",
    ),
    h('label', { class: 'field' }, [h('span', {}, ['Atlas image (.nii, .nii.gz, .mgz)']), image]),
    h('label', { class: 'field' }, [h('span', {}, ['Atlas name']), name]),
    h('label', { class: 'field' }, [
      h('span', {}, ['Optional TSV label table (ID and name columns)']),
      labels,
    ]),
    note('Use a discrete label image. Without a label table, regions are shown by their numeric IDs.'),
    error,
  ])
  const importButton = button(
    'Load atlas',
    () => {
      const file = image.files?.[0]
      if (!file) {
        error.textContent = 'Choose an aligned atlas image first.'
        return
      }
      importButton.disabled = true
      cancel.disabled = true
      void (async () => {
        try {
          const tsv = labels.files?.[0] ? await labels.files[0].text() : null
          if (tsv !== null && !parseAtlasTsv(tsv).length)
            throw new Error('The TSV must include ID and name (or label) columns with valid region rows.')
          await load(file, name.value.trim() || file.name, tsv)
          dialog.close()
        } catch (reason) {
          error.textContent = reason instanceof Error ? reason.message : String(reason)
        } finally {
          importButton.disabled = false
          cancel.disabled = false
        }
      })()
    },
    'primary',
  )
  const cancel = button('Cancel', () => dialog.close())
  dialog.append(h('div', { class: 'button-row' }, [importButton, cancel]))
  dialog.addEventListener('cancel', (event) => {
    if (importButton.disabled) event.preventDefault()
  })
  dialog.addEventListener('close', () => dialog.remove())
  document.body.append(dialog)
  dialog.showModal()
}
