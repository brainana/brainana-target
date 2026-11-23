import { stereotaxGeometryParts } from './stereotaxGeometry.ts'
import {electrodeAssembly} from '@brainana/planning-core/electrode-frame.ts'
import {connectorGeometry} from './connectorGeometry.ts'
import {targetRegionMesh} from './targetRegion.ts'
import {assessHole} from '@brainana/planning-core/grid-assessment.ts'
import {headpostGeometry} from './headpostGeometry.ts'
import {chamberBody,chamberSupport} from './mountGeometry.ts'
import {avoidanceKey,geometryIdentity} from './avoidanceKey.ts'
import {surfacePaint} from './surfacePaint.ts'
import {surfacePatch} from '@brainana/planning-core/surface-patch.ts'
import {gridWedge,gridChannel,gridChannelLength} from './gridGeometry.ts'
import type {SceneColors} from './colors.ts'
import type {SceneLayer} from './display.ts'
import type {Headpost,Project,Stereotax,Vec3} from '@brainana/planning-core/model.ts'
import type {TriangleSurface} from '@brainana/planning-core/surface-fit.ts'
import type {placementMap} from './placementMap.ts'
import {currentOpening} from '@brainana/planning-core/surface-openings.ts'
import {openingMarker} from './openingMarker.ts'
import {openingColor} from '../ui/openingAppearance.ts'
import {shankLength,gridCompatibility} from '@brainana/planning-core/hardware.ts'
import {add,scale,localToWorld,poseFromAxes,trajectoryAxes,gridHoles,gridPose,holeLocal,trajectory,guideTubePath,electrodePaths,axes,sub} from '@brainana/planning-core/geometry.ts'
import {ring,cylinder,blade,pointMesh,sphere,combine,type MeshGeometry} from './primitives.ts'
export interface ScenePart {
  key?:string; geometry:MeshGeometry; overviewGeometry?:MeshGeometry; color:string; opacity:number; name:string; layer:SceneLayer
  avoidance?:boolean;placementOverlay?:boolean;renderOnly?:boolean
  collisionGroup?: string; collisionName?: string; gridSolid?: import('./intersections.ts').IntersectionSurface['gridSolid']
}
export function stereotaxSceneParts(rig: Stereotax): ScenePart[] {
  const colors={frame:'#819db7',ears:'#60d5d0',bite:'#f2a35c',arms:'#cba6ee',base:'#536c80',scales:'#1b2936',controls:'#d6e2ed'}
  const names={frame:'Stereotaxic rails and blocks',ears:'Stereotax ear bars',bite:'Stereotax bite bar',arms:'Stereotax manipulator arms',base:'Stereotax base plate',scales:'Stereotax graduation marks',controls:'Stereotax controls'}
  return stereotaxGeometryParts(rig).map(({geometry,kind})=>({key:`stereotax:${kind}`,geometry,color:colors[kind],opacity:.65,name:names[kind],layer:'stereotax',renderOnly:!['ears','bite'].includes(kind),collisionGroup:'stereotax'}))
}
interface ScenePartContext {
  colors:SceneColors;enhanceElectrodes:boolean;center:Vec3;surfaces:TriangleSurface[]
  placementPoint:Vec3|null;placementParts:ReturnType<typeof placementMap>
  headpostPreview?: Headpost | null
}
/** Keep generated geometry for unchanged objects; discard entries as objects leave the scene. */
export class SceneParts {
  #entries=new Map<string,{signature:string;parts:ScenePart[]}>()
  clear():void{this.#entries.clear()}
  build(p:Project,selectedElectrode:string|null,context:ScenePartContext):ScenePart[]{
    const parts:ScenePart[]=[],used=new Set<string>()
    const targetKey=p.targets.map(target=>[target.id,target.point,target.region?.kind==='voxels'?geometryIdentity(target.region):target.region])
    const group=(id:string,inputs:unknown[],build:()=>ScenePart[]):ScenePart[]=>{
      used.add(id)
      const signature=JSON.stringify(inputs),cached=this.#entries.get(id)
      if(cached?.signature===signature)return cached.parts
      const result=build().map((part,index)=>({...part,key:`${id}:${index}`}))
      this.#entries.set(id,{signature,parts:result});return result
    }
    if (p.stereotax) {
      const rig = p.stereotax
      parts.push(...group('stereotax', [rig], () => stereotaxSceneParts(rig)))
    }
    const preview=context.headpostPreview
    const posts=(p.headposts??[]).filter(post=>post.id!==preview?.id)
    if(preview)posts.push(preview)
    for(const post of posts){
      const isPreview=post===preview
      const color=isPreview?'#2ccddc':context.colors.headpost
      parts.push(...group(`headpost:${post.id}`,[{...post,mesh:undefined},geometryIdentity(post.mesh),color,isPreview],()=>[{
        geometry:headpostGeometry(post),color,opacity:isPreview ? .75 : .9,
        name:isPreview?'Headpost preview':post.name,layer:'headposts',collisionGroup:isPreview ? undefined : `headpost:${post.id}`,renderOnly:!!post.mesh,placementOverlay:isPreview,
      }]))
    }
    for (const c of p.chambers) {
      if (c.placementState === 'unplaced') continue
      parts.push(...group(`chamber:${c.id}`,[c,p.grids.filter(g=>g.chamberId===c.id),p.electrodes,selectedElectrode,targetKey,p.planning?.maxMiss,context.colors,context.enhanceElectrodes],()=>{
      const parts:ScenePart[]=[]
      parts.push({
        geometry: chamberBody(c),
        color: context.colors.chamber,
        opacity: 0.65,
        name: c.name,
        layer: 'chambers',
        collisionGroup: `chamber:${c.id}`,
      })
      const mount=chamberSupport(c)
      if(mount)parts.push({geometry:mount,color:c.mounting==='acrylic'?'#e8e0cb':'#70b7d6',opacity:.8,name:c.mounting==='acrylic'?'Acrylic / cement build-up estimate':'Fitted pedestal estimate',layer:'chambers',collisionGroup:`chamber:${c.id}`,collisionName:c.name})
      for (const g of p.grids.filter((g) => g.chamberId === c.id)) {
        const device=p.electrodes.find(e=>e.id===selectedElectrode&&e.gridId===g.id)??p.electrodes.find(e=>e.gridId===g.id)
        if(g.enabled!==false&&device&&gridCompatibility(device).available){
          parts.push({geometry:gridWedge(c,g),color:context.colors.grid,opacity:.12,name:g.name+' schematic grid plane',layer:'grids', ...((g.minimumThickness??0)>0 ? {collisionGroup:`grid:${g.id}`,collisionName:g.name,gridSolid:{chamber:c,grid:g}} : {})})
          const frame=gridPose(c,g),assessments=gridHoles(c,g).map(h=>({hole:h,...assessHole(p,c,g,device,h)}))
          for(const state of ['blocked','target','clear']){
            const holes=assessments.filter(a=>state==='blocked'?!a.wallClear:state==='target'?a.hitsTarget:a.wallClear&&!a.hitsTarget).map(a=>a.hole)
            if(holes.length)parts.push({geometry:combine(holes.flatMap(h=>[ring({...frame,origin:localToWorld(c.pose,holeLocal(g,h,c))},Math.max(.1,(g.holeDiameter??.7)/2-.06),(g.holeDiameter??.7)/2+.06,.12,12),...(gridChannelLength(c,g,h)>1e-8?[cylinder(...gridChannel(c,g,h),Math.min(.18,(g.holeDiameter??.7)/2),8)]:[])])),color:state==='blocked'?context.colors.gridBlocked:state==='target'?context.colors.gridTarget:context.colors.gridSafe,opacity:.9,renderOnly:true,name:state==='blocked'?'Guide channels blocked by grid / chamber wall':state==='target'?'Target-reaching guide channels':'Wall-clear guide channels at selected insertion',layer:'grids'})
          }
          parts.push({geometry:ring({...frame,origin:localToWorld(c.pose,holeLocal(g,device.hole,c))},.3,.44,.2,16),color:context.colors.selectedPlacement,opacity:1,name:'Selected grid hole',layer:'grids'})
        }
        for (const e of p.electrodes.filter((e) => e.gridId === g.id)) {
          parts.push(...deviceParts(c,g,e,selectedElectrode,context))
        }
      }
      const z = axes(c.pose)[2]
      parts.push({
        geometry: cylinder(c.pose.origin, add(c.pose.origin, scale(z, 6)), 0.18),
        color: context.colors.chamber,
        opacity: 1,
        name: 'Chamber outward axis',
        layer: 'axes',
      })
      return parts
      }))
    }
    for(const e of p.electrodes){
      if(e.direct&&!e.direct.unplaced){const a=electrodeAssembly(p,e)!;parts.push(...group(`direct:${e.id}`,[e,selectedElectrode,context.enhanceElectrodes],()=>deviceParts(a.chamber,a.grid,e,selectedElectrode,context)))}
      if(e.connector&&!e.connector.unplaced)parts.push(...group(`connector:${e.id}`,[e.connector],()=>[{geometry:connectorGeometry(e.connector!),color:'#a9b7cf',opacity:.9,name:e.name+' skull connector',layer:'electrodes',collisionGroup:`connector:${e.id}`}]))
    }
    for (const mark of p.landmarks ?? []) parts.push(...group(`landmark:${mark.id}`, [mark], () => [{
      geometry: pointMesh(mark.point, .7), color: '#72d7ff', opacity: 1, name: mark.name, layer: 'targets',
    }]))
    for (const t of p.targets) {
      parts.push(...group(`target:${t.id}`,[{...t,region:undefined},t.region?.kind==='voxels'?geometryIdentity(t.region):t.region],()=>{
      const parts:ScenePart[]=[]
      const region=targetRegionMesh(t);if(region)parts.push({geometry:region,color:t.color,opacity:.3,name:`${t.name} valid target region`,layer:'targets',renderOnly:true})
      const radius = t.displayRadiusMm ?? 2
      for (const fraction of [1, 0.75, 0.5]) if (radius > 0) parts.push({
        geometry: sphere(t.point, radius * fraction, 16, 8), color: t.color, opacity: 0.10 + (1 - fraction) * 0.3, name: `${t.name} display falloff`, layer: 'targets',
      })
      parts.push({
        geometry: pointMesh(t.point, 0.8),
        color: t.color,
        opacity: 1,
        name: t.name,
        layer: 'targets',
      })
      return parts
      }))
    }
    for (const r of p.avoidRegions??[])parts.push(...group(`avoidance:${r.id}`,[avoidanceKey([r]),context.center,...(!r.surfacePatch?context.surfaces.map(surface=>[geometryIdentity(surface.pts),geometryIdentity(surface.tris)]):[]),context.colors],()=>[{
        geometry: r.drawingMode==='surface' ? (()=>{const patch=r.surfacePatch??surfacePatch(context.surfaces,r.stamps??r.points??[r.center],r.radius);return surfacePaint(patch,context.center)})() : r.points||r.stamps
          ? combine([
              ...(r.stamps??[]).map(p=>sphere(p,r.radius,8,4)),
              ...(r.points??[r.center]).map((p) => sphere(p, r.radius, 12, 6)),
              ...(r.points??[])
                .slice(1)
                .flatMap((p, i) =>
                  Math.hypot(...sub(p, r.points![i])) > 1e-8 ? [cylinder(r.points![i], p, r.radius, 12)] : [],
                ),
            ])
          : sphere(r.center, r.radius),
        color: r.constraint==='soft'?context.colors.softAvoidance:r.constraint==='ignore'?context.colors.ignored:context.colors.avoidance,
        opacity: r.drawingMode==='surface'?.8:.3,
        name: r.name,
        layer: 'avoidance',
        avoidance: true,
      }]))
    parts.push(...group('comparison',[p.display.gridPreviewHoles,p.chambers,p.grids,p.electrodes,targetKey,p.planning?.maxMiss,context.colors],()=>{
      const parts:ScenePart[]=[]
    for(const preview of p.display.gridPreviewHoles??[]){
      const device=p.electrodes.find(e=>e.id===preview.electrodeId),grid=p.grids.find(g=>g.id===device?.gridId),chamber=p.chambers.find(c=>c.id===grid?.chamberId)
      if(!device||!grid||!chamber||chamber.placementState==='unplaced'||!gridHoles(chamber,grid).some(h=>h[0]===preview.hole[0]&&h[1]===preview.hole[1]))continue
      const a=assessHole(p,chamber,grid,device,preview.hole),path=trajectory(chamber,grid,{...device,hole:preview.hole,depth:a.depth})
      if(Math.hypot(...sub(path.tip,path.entry))<1e-8)continue
      parts.push({geometry:cylinder(path.entry,path.tip,Math.max(.12,device.diameter/2),10),color:!a.wallClear?context.colors.gridBlocked:a.hitsTarget?context.colors.gridTarget:context.colors.gridPreview,opacity:.9,name:`Comparison hole (${preview.hole.join(', ')})${a.hitsTarget?' — target reached':''}${!a.wallClear?' — wall blocked':''}`,layer:'electrodes'})
    }
      return parts
    }))
    for(const opening of p.surfaceOpenings??[])parts.push(...group(`opening:${opening.id}`,[{...opening,patch:undefined},geometryIdentity(opening.patch),currentOpening(p,opening),context.center],()=>[{
      geometry:openingMarker(opening,context.center),
      color:openingColor(opening,currentOpening(p,opening)?opening.surfaceKey:null,null),opacity:.65,name:opening.name,layer:'avoidance',avoidance:true,
    }]))
    if(context.placementPoint)parts.push({geometry:sphere(context.placementPoint,.7,12,6),color:context.colors.selectedPlacement,opacity:1,name:'Selected chamber center',layer:'targets',avoidance:true,placementOverlay:true})
    for(const part of context.placementParts)if(part.geometry.tris.length)parts.push({geometry:part.geometry,color:part.opening?context.colors.placementOpening:part.soft?context.colors.placementSoft:context.colors.placement,opacity:.85,name:part.opening?'Feasible centers — opening near footprint':part.soft?'Sampled feasible centers — soft conflicts':'Sampled feasible chamber centers',layer:'targets',avoidance:true,placementOverlay:true})
    for(const key of this.#entries.keys())if(!used.has(key))this.#entries.delete(key)
    return parts
  }
}

function deviceParts(c:Project["chambers"][number],g:Project["grids"][number],e:Project["electrodes"][number],selectedElectrode:string|null,context:ScenePartContext):ScenePart[]{
  const parts:ScenePart[]=[]
          const collisionGroup = `electrode:${e.id}`
          const t = trajectory(c, g, e)
          const tube = guideTubePath(c, g, e)
          if (tube)
            parts.push({
              geometry: ring(
                poseFromAxes(tube.start,trajectoryAxes(sub(tube.start,tube.end))),
                e.guideTube!.innerDiameter / 2,
                e.guideTube!.outerDiameter / 2,
                e.guideTube!.length,
                24,
              ),
              color: '#98b3d2',
              opacity: 0.8,
              name: `${e.name} guide tube`,
              layer: 'guideTubes',
              collisionGroup,
            })
          const paths = electrodePaths(c, g, e)
          const drawablePaths = paths
            .map((path, i) => ({
              ...path,
              start: e.hardware
                ? add(
                    path.tip,
                    scale(path.direction, -(shankLength(e, i) + (e.hardware.reservedLength ?? 0))),
                  )
                : path.entry,
            }))
            .filter((path) => Math.hypot(...sub(path.tip, path.start)) > 1e-8)
          const shaftGeometry = (enhanced: boolean): MeshGeometry =>
            combine(
              drawablePaths.map((path) =>
                e.hardware?.shape === 'blade'
                  ? blade(
                      path.start,
                      path.tip,
                      gridCompatibility(e).available?gridPose(c,g):c.pose,
                      Math.max(e.hardware.width, enhanced ? 0.2 : 0),
                      Math.max(e.hardware.thickness, enhanced ? 0.1 : 0),
                      e.hardware.rotation,
                    )
                  : cylinder(path.start, path.tip, Math.max(e.diameter / 2, enhanced ? 0.1 : 0), 12),
              ),
            )
          if (drawablePaths.length)
            parts.push({
              geometry: shaftGeometry(false),
              overviewGeometry: context.enhanceElectrodes ? shaftGeometry(true) : undefined,
              color: e.color,
              opacity: 1,
              name: e.name,
              layer: 'electrodes',
              collisionGroup,
            })
          // Dense sites are sampled only for the anatomical overview. Full sites remain in exports/model.
          const sites = paths.flatMap((path) => path.contacts),
            step = Math.max(1, Math.ceil(sites.length / 512))
          const marker = e.hardware
            ? Math.max(0.008, Math.min(0.08, e.contactSpacing / 3))
            : Math.max(0.3, e.diameter)
          parts.push({
            geometry: combine(sites.filter((_, i) => i % step === 0).map((v) => pointMesh(v, marker))),
            overviewGeometry: context.enhanceElectrodes
              ? combine(
                  sites.filter((_, i) => i % step === 0).map((v) => pointMesh(v, Math.max(0.12, marker))),
                )
              : undefined,
            color: '#ffffff',
            opacity: 1,
            name: `${e.name} site overview (${Math.ceil(sites.length / step)} / ${sites.length})`,
            layer: 'contacts',
          })
          if (e.id === selectedElectrode)
            parts.push({
              geometry: pointMesh(t.tip, 0.65),
              color: e.color,
              opacity: 1,
              name: 'Selected tip',
              layer: 'electrodes',
            })
  return parts
}
