export const imageLesson = [
  { id: 'images', title: 'Check the loaded images', practice: 'none', action: 'The files are listed under Load images on the left. The MRI is shown in three slices; the 3D brain comes from the cortical surface files.', notice: 'The CT in this example was warped from the MEBRAINS template. It is an estimate, not a CT acquired from the NMT subjects. No skull surface has been finalized.' },
  { id: 'image', title: 'Switch between MRI and CT', practice: 'image', action: 'Use View image above the slices to choose MRI or CT. The example now shows CT alone.', notice: 'Choose Try it, then switch between the two images. Notice how bone is bright in CT and brain tissue is clearer in MRI.' },
  { id: 'slices', title: 'Move through the slices', practice: 'slices', action: 'Scroll over a slice to move through it, or click to move the crosshair. The other slices show the same location.', notice: 'Choose Try it and scroll or click in the slices. Restore view brings you back to the starting location.' },
  { id: 'window', title: 'Adjust brightness and contrast', practice: 'window', action: 'The Brightness and Contrast sliders are above Anatomy. Watch the MRI change as contrast is increased.', notice: 'Choose Try it and adjust either slider. These settings change the display; they do not change the image data.' },
  { id: 'blend', title: 'Overlay the CT on the MRI', practice: 'blend', action: 'With MRI selected, turn on Blend images. The other MRI and CT images are blended over it in the slices.', notice: 'Choose Try it and switch Blend images off and on. Overlays lets you choose individual layers, including the CT.' },
  { id: 'opacity', title: 'Change CT opacity in the slices', practice: 'opacity', action: 'Open Overlays, then Adjust next to the CT. Overlay opacity controls how much CT you see over the MRI.', notice: 'Choose Try it. Move Overlay opacity between 0 and 1 and watch the skull in the slices. This control does not change the 3D brain.' },
  { id: 'layout', title: 'Change the slice layout', practice: 'layout', action: 'Use the layout menu beside Anatomy to arrange the slices in a column, row or grid, or show one slice at a time.', notice: 'Choose Try it and compare a few layouts. The images and their coordinates stay the same.' },
  { id: 'brain', title: 'Adjust the 3D brain view', practice: 'brain', action: 'Drag the 3D brain to rotate it. Hover over it and use the arrow keys to shift the view. Brain opacity changes its transparency.', notice: 'Choose Try it, then rotate the brain or adjust the Brain slider above it. This is separate from CT opacity in the slices. Press R over the brain to fit it again.' },
] as const

export type TutorialPhase = 'loading' | 'watch' | 'practice' | 'finished' | 'error'
export interface TutorialState { index: number; phase: TutorialPhase; practiced: boolean; error: string }
export interface StepRequest { signal: AbortSignal; practice: boolean; animate: boolean }

/** Playback history is independent of project undo. Each request restores a full checkpoint. */
export class TutorialPlayer {
  state: TutorialState
  #controller: AbortController | null = null
  #revision = 0
  get revision(): number { return this.#revision }
  constructor(private apply: (index: number, request: StepRequest) => Promise<void>, private changed: (state: TutorialState) => void, initial = 0) {
    this.state = { index: Math.max(0, Math.min(imageLesson.length - 1, Math.trunc(initial) || 0)), phase: 'loading', practiced: false, error: '' }
  }
  async seek(index: number, practice = false, animate = false): Promise<void> {
    if (!Number.isFinite(index)) return
    index = Math.max(0, Math.min(imageLesson.length - 1, Math.trunc(index)))
    this.#controller?.abort()
    this.#revision++
    const controller = new AbortController()
    this.#controller = controller
    this.state = { index, phase: 'loading', practiced: false, error: '' }
    this.changed(this.state)
    try {
      const interactive = practice && imageLesson[index].practice !== 'none'
      await this.apply(index, { signal: controller.signal, practice: interactive, animate })
      if (controller.signal.aborted) return
      this.state = { index, phase: interactive ? 'practice' : 'watch', practiced: false, error: '' }
    } catch (error) {
      if (controller.signal.aborted) return
      this.state = { index, phase: 'error', practiced: false, error: error instanceof Error ? error.message : String(error) }
    }
    this.changed(this.state)
  }
  async next(): Promise<void> {
    if (this.state.index < imageLesson.length - 1) return this.seek(this.state.index + 1, false, true)
    const pending = this.seek(this.state.index), controller = this.#controller
    await pending
    if (this.#controller !== controller || this.state.phase !== 'watch') return
    this.state = { ...this.state, phase: 'finished' }
    this.changed(this.state)
  }
  practiced(): void {
    if (this.state.phase !== 'practice' || this.state.practiced) return
    this.state = { ...this.state, practiced: true }
    this.changed(this.state)
  }
  dispose(): void { this.#revision++; this.#controller?.abort() }
}
