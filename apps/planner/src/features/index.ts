import {headpostsFeature} from './headposts.ts'
import { avoidanceFeature } from './avoidance.ts'
import { dataFeature } from './data.ts'
import { targetsFeature } from './targets.ts'
import { chamberFeature } from './chamber.ts'
import { gridFeature } from './grid.ts'
import { electrodesFeature } from './electrodes.ts'
import { positioningFeature } from './positioning.ts'
import { reviewFeature } from './review.ts'
import { stereotaxFeature } from './stereotax.ts'
import type { PlannerFeature } from './contracts.ts'
export const features: PlannerFeature[] = [
  dataFeature,
  {
    id: 'images',
    label: 'Load images',
    glyph: '01',
    description: 'Brain images · aligned MRI, CT, atlas and functional maps',
    render: (ctx) => (ctx.project ? ctx.actions.imagePanel() : dataFeature.render(ctx)),
  },
  { id: 'surface', label: 'Planning surface', glyph: '02', description: 'Choose, prepare and review the boundary used for chamber placement', render: ctx => ctx.actions.surfacePanel() },
  headpostsFeature,
  targetsFeature,
  avoidanceFeature,
  chamberFeature,
  electrodesFeature,
  positioningFeature,
  gridFeature,
  stereotaxFeature,
  reviewFeature,
]
