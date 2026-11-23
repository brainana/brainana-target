import {paintSurface} from '../render/paintSurface.ts'
import { withActivity } from '../ui/activity.ts'
import { errorDialog } from '../ui/controls.ts'
import { fillOutline } from '../render/filledOutline.ts'
import { avoidanceChoices } from '../ui/avoidanceChoices.ts'
import { h } from '@brainana/ui/dom.ts'
import { newId } from '@brainana/planning-core/model.ts'
import type { PlannerFeature } from './contracts.ts'
import { button, note, numberField, selectField, section, textField } from '../ui/controls.ts'
export const avoidanceFeature: PlannerFeature = {
  id: 'avoidance',
  label: 'Avoid',
  glyph: '⊘',
  description: 'Mark regions that constrain trajectory searches',
  render(ctx) {
    const p = ctx.project
    if (!p) return note('Load anatomy before marking regions.')
    return h('div', {}, [
      section('Avoidance regions', [
        note(
          "Choose how to draw and what to mark below, then select Draw avoidance regions and drag over a slice. Each stroke creates one named region. For a tissue volume, draw on several slices to cover the area you want to avoid. Placement checks include the electrode width and your extra clearance distance.",
        ),
        selectField('Drawing tool',ctx.scene.fillOutline?'outline':'brush',[{value:'brush',label:'Paint a stroke'},{value:'outline',label:'Outline and fill enclosed area'}],value=>{ctx.scene.fillOutline=value==='outline';ctx.refresh()}),
        selectField('Drawing geometry',ctx.scene.brushMode??'volume',[{value:'volume',label:'3D volume'},{value:'surface',label:'Snap stroke to planning surface'}],value=>{ctx.scene.brushMode=value as 'volume'|'surface';ctx.refresh()}),
        note("Paint a stroke to mark a strip, or draw a closed outline to fill the area inside it. 3D volume marks a region through the tissue. Snap stroke to planning surface marks only the skull or other surface you finalized. Brush radius controls the width of the mark."),
        numberField(
          'Brush radius (mm)',
          ctx.scene.brushRadius,
          (value) => {
            ctx.scene.brushRadius = value
          },
          { min: 0.1, max: 20 },
        ),
        button(
          ctx.scene.drawingEnabled ? 'Finish drawing regions' : 'Draw avoidance regions',
          () => {
            if(ctx.scene.drawingEnabled){void withActivity('Updating avoidance surfaces…',()=>{ctx.scene.drawingEnabled=false;ctx.refresh()}).catch(error=>{if(error?.name!=='AbortError')errorDialog(error)})}
            else {ctx.scene.drawingEnabled=true;ctx.refresh()}
          },
          ctx.scene.drawingEnabled ? 'primary' : '',
        ),
        button('Update avoidance surfaces', ctx.scene.updateAvoidanceSurfaces),
        note(
          'Each completed stroke appears automatically. Surface painting runs in the background; its progress appears in the bottom-right status area.',
        ),
        button(
          ctx.scene.brushMode==='surface'?'Paint surface region near crosshair':'Mark volume region at crosshair',
          () => {
            const surface=ctx.scene.brushMode==='surface',point=[...ctx.crosshair()] as import('@brainana/planning-core/model.ts').Vec3,radius=ctx.scene.brushRadius
            void withActivity(surface?'Painting avoidance on planning surface…':'Adding avoidance region…',async()=>{
              const result=surface?await paintSurface(ctx.scene.mountingSurface.surfaces,[point],[],radius,[0,0,1]):null
              if(ctx.store.project?.id!==p.id)return
              ctx.edit(d=>{d.avoidRegions??=[];d.avoidRegions.push({id:newId(),name:`${surface?'Surface region':'Avoid'} ${d.avoidRegions.length+1}`,frameId:d.frame.id,center:result?.centers[0]??point,radius,...(result?{drawingMode:'surface' as const,points:[result.centers[0]],stamps:result.centers,surfacePatch:result.patch}:{drawingMode:'volume' as const})})})
              ctx.scene.updateAvoidanceSurfaces()
            }).catch(error=>{if(error?.name!=='AbortError')errorDialog(error)})
          },
          '',
        ),
      ]),
      ...(p.avoidRegions ?? []).map((r) =>
        section(r.name, [
          selectField('Placement priority',r.constraint??'hard',avoidanceChoices,value=>ctx.edit(d=>{d.avoidRegions!.find(x=>x.id===r.id)!.constraint=value as typeof r.constraint})),
          note(
            r.points
              ? `${r.drawingMode==='surface'?'Surface-only patch':r.stamps?.length?'Filled outline':'Brush stroke'} · ${r.points.length} boundary points${r.stamps?.length?` and ${r.stamps.length} fill stamps`:''}. Radius edits resize the whole stroke; centre edits translate it.`
              : 'Spherical region',
          ),
          textField('Region name', r.name, (name) =>
            ctx.edit((d) => {
              d.avoidRegions!.find((x) => x.id === r.id)!.name = name
            }),
          ),
          numberField(
            'Region radius (mm)',
            r.radius,
            (radius) => {
              void withActivity('Resizing avoidance region…',async()=>{
                const result=r.drawingMode==='surface'?await paintSurface(ctx.scene.mountingSurface.surfaces,r.stamps??r.points??[r.center],[],radius,[0,0,1],true):null
                if(ctx.store.project?.id!==p.id)return
                ctx.edit(d=>{const region=d.avoidRegions!.find(x=>x.id===r.id);if(!region)return;region.radius=radius;if(result)region.surfacePatch=result.patch;else if(region.stamps?.length&&region.points&&region.points.length>=3)region.stamps=fillOutline(region.points,radius)})
                ctx.scene.updateAvoidanceSurfaces()
              }).catch(error=>{if(error?.name!=='AbortError')errorDialog(error)})
            },
            { min: 0.1, max: 100 },
          ),
          ...(r.drawingMode==='surface'?[note("This mark stays on the surface where you painted it. To move it, remove it and paint a new mark.")]:[h(
            'div',
            { class: 'triple' },
            ['R', 'A', 'S'].map((label, i) =>
              numberField(`${label} (mm)`, r.center[i], (value) =>
                ctx.edit((d) => {
                  const region = d.avoidRegions!.find((x) => x.id === r.id)!
                  const delta = value - region.center[i]
                  if(region.drawingMode==='surface')throw new Error('Surface regions stay on the planning surface. Repaint the region at its new location.')
                  region.center[i] = value
                  region.stamps?.forEach(p=>{p[i]+=delta})
                  region.points?.forEach((p) => {
                    p[i] += delta
                  })
                }),
              ),
            ),
          )]),
          button('Locate region', () => ctx.scene.moveCrosshair(r.center)),
          button(
            'Remove region',
            () =>
              ctx.edit((d) => {
                d.avoidRegions = d.avoidRegions!.filter((x) => x.id !== r.id)
                if (d.planning?.avoidRegionIds) d.planning.avoidRegionIds = d.planning.avoidRegionIds.filter(id => id !== r.id)
              }),
            'danger',
          ),
        ]),
      ),
    ])
  },
}
