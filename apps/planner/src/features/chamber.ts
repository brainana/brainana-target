import { refitChamberTrajectories } from '@brainana/planning-core/placement-adjustment.ts'
import { fitChamberBase, chamberBaseEnd, alignChamberToSurface } from '@brainana/planning-core/surface-fit.ts'
import { regionClearance, settings, activeAvoidRegions } from '@brainana/planning-core/optimization.ts'
import { chamberSpecificationsPanel } from '../ui/chamberSpecifications.ts'
import { h } from '@brainana/ui/dom.ts'
import { validateProject } from '@brainana/planning-core/validation.ts'
import { gridHoles } from '@brainana/planning-core/geometry.ts'
import type { Chamber } from '@brainana/planning-core/model.ts'
import type { FeatureContext, PlannerFeature } from './contracts.ts'
import { button, note, section, numberField, readout } from '../ui/controls.ts'
export const chamberFeature: PlannerFeature = {
  id: 'chamber',
  label: 'Chamber',
  glyph: '04',
  description: 'Name and define chamber hardware; placement is handled in Position',
  render: chamberSpecificationsPanel,
}

/** Pose and surface tools belong to Position, after hardware and targets are defined. */
export function chamberPlacementControls(ctx: FeatureContext, chamberId?: string): HTMLElement {
    const p = ctx.project
    const grid = p?.grids.find(g => g.id === p.electrodes.find(e => e.id === ctx.selectedElectrode)?.gridId)
    const c = p?.chambers.find(c => c.id === (chamberId ?? grid?.chamberId)) ?? p?.chambers[0]
    if (!c) return note('Define a chamber in Chamber before placing it.')
    const update = (fn: (chamber: Chamber) => void): void => {
      ctx.edit((d) => {
        fn(d.chambers.find(item => item.id === c.id)!)
        for (const g of d.grids) {
          const chamber = d.chambers.find((x) => x.id === g.chamberId)!
          for (const e of d.electrodes.filter((e) => e.gridId === g.id))
            if (!gridHoles(chamber, g).some((h) => h[0] === e.hole[0] && h[1] === e.hole[1])) e.hole = [0, 0]
        }
      })
  }
    const drag = button(
      ctx.scene.dragEnabled ? 'Finish moving chamber' : 'Move chamber in 3D',
      () => {
        if (c.placementState === 'unplaced') return
        ctx.scene.dragEnabled = !ctx.scene.dragEnabled
        ctx.scene.dragChamberId = ctx.scene.dragEnabled ? c.id : undefined
        ctx.refresh()
      },
      ctx.scene.dragEnabled ? 'primary' : '',
    )
    const project = ctx.project!
    const hasTarget = project.electrodes.some(e => e.targetId && !e.direct && project.grids.some(g => g.id === e.gridId && g.chamberId === c.id))
    const fixed = settings(project).mode === 'existing'
    const surface = ctx.scene.mountingSurface
    const useRefit = !fixed && c.placementState !== 'unplaced' && (hasTarget || !!surface.surfaces.length)
    drag.disabled = c.placementState === 'unplaced' || hasTarget
    if(drag.disabled)drag.title='Use the measured controls or choose a new mounting point in Review.'
    const fitBase = button(
      'Conform base to surface',
      () =>
        ctx.edit((d) => {
          const chamber = d.chambers.find(item => item.id === c.id)!
          const profile = fitChamberBase(chamber, surface.surfaces, surface.source, surface.assetIds)
          const fitted = { ...chamber, baseFit: profile }
          const blocked = activeAvoidRegions(d).some(
            (r) =>
              regionClearance(
                chamber.pose.origin,
                chamberBaseEnd(fitted),
                2 * (chamber.innerRadius + chamber.wallThickness),
                r,
              ) <
              settings(d).margin - 1e-8,
          )
          if (blocked)
            throw new Error(
              'The contoured chamber body may intersect an exclusion. Choose another placement or adjust the chamber dimensions. The previous base is unchanged.',
            )
          chamber.baseFit = profile
        }),
      'primary',
    )
    fitBase.disabled = !surface.surfaces.length || ctx.hasPlacementPreview || c.placementState === 'unplaced'
    const signature = (p: NonNullable<typeof ctx.project>) =>
      JSON.stringify([p.chambers, p.grids, p.electrodes, p.targets, p.avoidRegions, p.planning, p.assets])
    const alignBase = button(
      'Preview surface-aligned chamber',
      () => {
        if (settings(ctx.project!).mode === 'existing') return
        const candidate = structuredClone(ctx.project!),
          original = signature(candidate)
        try {
          const index = candidate.chambers.findIndex(item => item.id === c.id)
          const aligned = alignChamberToSurface(candidate.chambers[index], surface.surfaces)
          aligned.baseFit = fitChamberBase(aligned, surface.surfaces, surface.source, surface.assetIds)
          delete aligned.placementState
          candidate.chambers[index] = aligned
          refitChamberTrajectories(candidate, aligned.id)
          if (
            activeAvoidRegions(candidate).some(
              (r) =>
                regionClearance(
                  aligned.pose.origin,
                  chamberBaseEnd(aligned),
                  2 * (aligned.innerRadius + aligned.wallThickness),
                  r,
                ) <
                settings(candidate).margin - 1e-8,
            )
          )
            throw new Error(
              'The surface-aligned chamber body may intersect an exclusion. Try another access location or a smaller chamber.',
            )
          validateProject(candidate)
          ctx.previewPlacement(candidate, 'Surface-aligned chamber and contoured rim', () =>
            ctx.edit((d) => {
              if (signature(d) !== original)
                throw new Error(
                  'The plan changed. Preview the surface-aligned chamber again before applying.',
                )
              d.chambers = structuredClone(candidate.chambers)
              d.electrodes = structuredClone(candidate.electrodes)
            }),
          )
          ctx.refresh()
        } catch (error) {
          ctx.edit(() => {
            throw new Error(
              `Cannot fit a surface-aligned chamber: ${error instanceof Error ? error.message : String(error)} The applied placement is unchanged.`,
            )
          })
        }
      },
      'primary',
    )
    alignBase.disabled =
      !surface.surfaces.length || ctx.hasPlacementPreview || settings(ctx.project!).mode === 'existing'
    alignBase.title =
      settings(ctx.project!).mode === 'existing'
        ? "Fixed-chamber mode keeps the measured position and angles. To let the app move it, change Placement method in Position to Find a placement for this chamber."
        : "Move and tilt the chamber to follow the nearby skull surface, then adjust its wall lengths and try to reach linked targets again. Review the preview before applying it."

    return h('div', {}, [
      section('Placement', [
        ...(c.placementState === 'unplaced' ? [
          note("The chamber dimensions are saved, but it has not been placed yet. Use Position to find possible locations. If you already know its measured location and angle, enter them below and accept the manual placement."),
          button('Use these measurements for placement', () => update(c => { delete c.placementState })),
        ] : []),
        note(
          "The chamber position is measured at the centre of its top opening. The chamber body extends below that point. With an angled grid, electrode insertion depth starts at the entry of the selected hole on the sloping top face.",
        ),
        ...(useRefit ? [
          note('Choose a new mounting point in Review to refit the rim and trajectories.'),
          ...(ctx.actions.openReview ? [button('Open Review', ctx.actions.openReview)] : []),
        ] : [
        button('Set origin to crosshair', () =>
          update((c) => {
            c.pose.origin = [...ctx.crosshair()]
              delete c.placementState
          }),
        ),
        drag,
        note(
          "While Move chamber is active, drag in the 3D view to move the chamber left, right, up or down on screen. Finish moving returns the mouse to rotating the view.",
        ),
        h(
          'div',
          { class: 'triple' },
          ['R', 'A', 'S'].map((label, i) =>
            numberField(`${label} (mm)`, c.pose.origin[i], (v) =>
              update((c) => {
                c.pose.origin[i] = v
              }),
            ),
          ),
        ),
        ]),
      ]),
      ...(!useRefit ? [section('Orientation', [
        h(
          'div',
          { class: 'triple' },
          ['X tilt', 'Y tilt', 'Z rotation'].map((label, i) =>
            numberField(
              `${label} (°)`,
              c.pose.angles[i],
              (v) =>
                update((c) => {
                  c.pose.angles[i] = v
                }),
              { min: -180, max: 180, step: 1 },
            ),
          ),
        ),
        note('Rotations use Rz × Ry × Rx. Numeric values are stored with the plan.'),
      ])] : []),
      section('Surface fit', [
        button('Open Planning surface', ctx.actions.preparePlanningSurface ?? ctx.actions.manageImages),
        note(
          "Load a skull surface file that already lines up with your images and uses millimetres. Supported formats are STL, OBJ, PLY and GIfTI. A skull surface is preferred. A brain surface is only an approximation and does not include skull thickness.",
        ),
        readout(
          'Fitting surface',
          surface.surfaces.length
            ? surface.source === 'skull'
              ? 'Skull'
              : 'Brain approximation'
            : 'None loaded',
        ),
        note(
          ctx.hasPlacementPreview
            ? 'Apply the previewed placement before fitting its base.'
            : "Shape the bottom edge of the chamber to follow the skull. The top of the chamber and the electrode direction stay in place, so the walls can have different lengths. The fit leaves a 0.5 mm gap. Review the result before using the exported model for design or printing.",
        ),
        numberField(
          'Minimum fitted wall height (mm)',
          c.minimumWallHeight ?? 2,
          (value) =>
            update((c) => {
              c.minimumWallHeight = value
            }),
          { min: 0.5, max: 20 },
        ),
        note(
          "Enter the shortest wall height you will allow. This setting does not check material strength. Review the shortest and tallest fitted walls.",
        ),
        fitBase,
        alignBase,
        note(
          "For a chamber on the side of the head, Preview surface-aligned chamber moves it outward and tilts it to follow the local skull surface. The walls can have different lengths. The app then tries to reach each linked target again. If the hardware cannot reach or would cross an area to avoid, your current placement is kept. An already implanted chamber keeps its measured position and angle.",
        ),
        ...(c.baseFit
          ? [
              readout(
                'Base model',
                c.baseFit.source === 'skull' ? 'Skull-contoured rim' : 'Brain-contoured approximation',
              ),
              readout(
                'Wall height range',
                `${Math.min(...c.baseFit.innerDepths, ...c.baseFit.outerDepths).toFixed(2)} – ${Math.max(...c.baseFit.innerDepths, ...c.baseFit.outerDepths).toFixed(2)} mm`,
              ),
              ...(!useRefit ? [button('Restore flat base', () =>
                ctx.edit((d) => {
                  delete d.chambers.find(item => item.id === c.id)!.baseFit
                }),
              )] : []),
            ]
          : []),
        note(
          "A fitted rim belongs to a specific position and chamber size. Review the new rim after changing either.",
        ),
      ]),
    ])
}
