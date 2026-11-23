import type { SurfaceOpening } from '@brainana/planning-core/model.ts'
export const openingColors = {
  selected: [255, 32, 32, 255],
  candidate: [255, 195, 84, 255],
  soft: [70, 180, 255, 255],
  avoid: [250, 104, 124, 255],
  stale: [150, 150, 150, 255],
} as const
export function openingCategory(opening:SurfaceOpening,key:string|null,selected:string|null){
  return opening.id===selected?'selected':opening.surfaceKey!==key?'stale':opening.reviewed&&opening.constraint==='soft'?'soft':opening.reviewed&&(opening.constraint==='hard'||(!opening.constraint&&opening.avoid))?'avoid':'candidate'
}
export function openingColor(opening:SurfaceOpening,key:string|null,selected:string|null){
  return '#'+openingColors[openingCategory(opening,key,selected)].slice(0,3).map(v=>v.toString(16).padStart(2,'0')).join('')
}
