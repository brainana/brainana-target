import {followupField} from '../ui/revealField.ts'
import { MAX_ELECTRODE_LENGTH_MM } from '@brainana/planning-core/model.ts'
import { h } from '@brainana/ui/dom.ts'
import { gridCompatibility, shaftDiameter } from '@brainana/planning-core/hardware.ts'
import type { Electrode } from '@brainana/planning-core/model.ts'
import type { FeatureContext } from './contracts.ts'
import { section, numberField, note } from '../ui/controls.ts'
import { hoverHelp } from '../ui/hoverHelp.ts'
export function guideTubePanel(ctx: FeatureContext, e: Electrode): HTMLElement {
  const compatible = gridCompatibility(e).available
  const enable = h('input', {
    type: 'checkbox',
    ariaLabel: 'Enable guide tube',
    disabled: !compatible,
    checked: !!e.guideTube,
  })
  const label = h('label', {}, [enable, 'Use a guide tube around this shaft'])
  label.tabIndex = 0
  hoverHelp(
    label,
    compatible
      ? "A guide tube supports and surrounds one electrode shaft. Enter the tube dimensions separately. Adding a tube does not make the electrode longer."
      : "This guide tube fits around one shaft. An array with several shafts needs its own guide or holder, which the app does not model.",
  )
  const update = (fn: (device: Electrode) => void) =>
    ctx.edit((p) => fn(p.electrodes.find((x) => x.id === e.id)!))
  enable.addEventListener('change', () => {
    update((d) => {
      if (!enable.checked) delete d.guideTube
      else {
        const diameter = shaftDiameter(d),
          chamber = ctx.project!.chambers.find(
            (c) => c.id === ctx.project!.grids.find((g) => g.id === d.gridId)!.chamberId,
          )!
        d.guideTube = {
          innerDiameter: diameter + 0.1,
          outerDiameter: diameter + 0.3,
          length: chamber.height + 10,
          tipDepth: chamber.height,
        }
      }
    })
    ctx.refresh()
    requestAnimationFrame(() => {
      const heading = Array.from(document.querySelectorAll<HTMLElement>('.electrode-configurator h3, .feature-panel h3')).find(el => el.textContent === 'Guide tube')
      heading?.scrollIntoView({ block: 'start' })
    })
  })
  return section('Guide tube', [
    label,
    ...(!compatible
      ? [
          note(
            "This array has several electrodes, so one tube around a single shaft cannot describe its guide or holder.",
          ),
        ]
      : []),
    ...(e.guideTube
      ? [
          ...(['innerDiameter', 'outerDiameter', 'length', 'tipDepth'] as const).map((key, i) =>
            followupField(numberField(
              [
                'Tube inner diameter (mm)',
                'Tube outer diameter (mm)',
                'Tube length (mm)',
                'Tube distal-end depth from grid (mm)',
              ][i],
              e.guideTube![key],
              (v) =>
                update((d) => {
                  if (key === 'innerDiameter')
                    d.guideTube!.outerDiameter = v + (d.guideTube!.outerDiameter - d.guideTube!.innerDiameter)
                  d.guideTube![key] = v
                }),
              {
                min: key === 'tipDepth' ? 0 : key === 'length' ? 0.5 : 0.001,
                max: key === 'length' || key === 'tipDepth' ? MAX_ELECTRODE_LENGTH_MM : 20,
              },
            ),'guideTube-'+key),
          ),
          note(
            `Tube upper end: ${(e.guideTube.tipDepth - e.guideTube.length).toFixed(2)} mm from grid. Negative depth lies above the grid. Probe tip ${e.depth > e.guideTube.tipDepth ? 'extends beyond' : 'is at or inside'} the tube; placement searches require the tip beyond its lower end.`,
          ),
          note(
            "Placement checks use the tube outside diameter to test whether it fits through the specified grid hole and chamber and clears marked areas to avoid. Check the fit of the real tube, electrode and holder too. Choosing another hardware preset removes these guide-tube settings.",
          ),
        ]
      : []),
  ])
}
