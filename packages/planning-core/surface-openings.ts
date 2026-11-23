import type { Project, AvoidRegion, SurfaceOpening } from './model.ts';
import { openingSurfaceKey } from './skull-surface.ts';
/** Review is tied to the exact source and finalized segmentation. Stale detections do not constrain planning. */
export function currentOpening(p: Project, opening: SurfaceOpening): boolean {
    const asset = p.assets.find(a => a.id === opening.assetId);
    return !!asset?.imageDisplay?.skull && asset.sha256 === opening.assetSha256 && openingSurfaceKey(asset.imageDisplay.skull) === opening.surfaceKey;
}
export const openingConstraint=(o:SurfaceOpening)=>o.constraint??(o.avoid?'hard':'ignore')
export function openingAvoidRegions(p: Project, kind:'hard'|'soft'='hard'): AvoidRegion[] {
  const sources=new Map(p.assets.filter(a=>a.imageDisplay?.skull).map(a=>[a.id,{sha:a.sha256,key:openingSurfaceKey(a.imageDisplay!.skull!)}]))
  return (p.surfaceOpenings??[]).filter(o=>{const source=sources.get(o.assetId);return o.reviewed&&openingConstraint(o)===kind&&source?.sha===o.assetSha256&&source.key===o.surfaceKey}).map(o=>({id:o.id,name:o.name,frameId:o.frameId,center:o.center,radius:o.radius}))
}
