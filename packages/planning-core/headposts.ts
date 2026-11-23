import type {Headpost,AvoidRegion,Project,Vec3} from './model.ts'
import {localToWorld} from './geometry.ts'
export const headpostDimensions = [
  ['Post diameter (mm)', 'postDiameter', 0.1, 200],
  ['Post height above baseplate (mm)', 'postHeight', 0.1, 200],
  ['Baseplate footprint diameter (mm)', 'baseDiameter', 0.1, 300],
  ['Baseplate thickness (mm)', 'baseThickness', 0.1, 30],
] as const

export function headpostDimensionRangeProblem(post: Headpost): string | null {
  if (post.mesh) return null
  for (const [label, key, min, max] of headpostDimensions) {
    const value = post[key]
    if (value === undefined || !Number.isFinite(value) || value < min || value > max)
      return `Enter ${label.toLowerCase()} between ${min} and ${max}.`
  }
  return null
}

export function headpostDimensionProblem(post: Headpost): string | null {
  const range = headpostDimensionRangeProblem(post)
  if (range || post.mesh) return range
  if (post.baseDiameter! < post.postDiameter!)
    return `Baseplate footprint diameter must be at least ${post.postDiameter} mm to support this post.`
  return null
}

/** Documented values only; missing dimensions must come from the selected device or its CAD. */
export interface HeadpostReference {
 id:string;name:string;source:string;notes:string;profile?:'trapezoid'
 details?:readonly {label:string;value:string;source:string}[]
 resources?:readonly {label:string;url:string}[]
 dimensions:Partial<Pick<Headpost,'postDiameter'|'postHeight'|'baseDiameter'|'baseThickness'>>
}
export const headpostReferences:readonly HeadpostReference[]=[
 {id:'custom',name:'Custom dimensions',source:'',dimensions:{},notes:'Enter the measured post and baseplate dimensions. The preview is a circular planning envelope, not a detailed manufactured headpost.'},
 {id:'thomas-pin',name:'Thomas PPS pin',source:'https://www.thomasrecording.com/np-primate-products-stereoatxy',dimensions:{postHeight:7},notes:'PPS documentation lists 7, 9 and 13 mm pins. The nominal 7 mm length is filled in; verify the height exposed above your baseplate and enter the measured pin diameter, baseplate footprint and thickness. A circular envelope includes the space between the baseplate legs.'},
 {id:'mark-ii',name:'Adams Mark II (2007)',source:'https://journals.physiology.org/doi/full/10.1152/jn.00102.2007?doi=10.1152%2Fjn.00102.2007',dimensions:{baseThickness:1},notes:'2007 design: 1 mm footplate, four K-arranged feet and a tapered post. The publisher lists the AutoCAD drawing ucsf2008-002a.dwg. Use the drawing for the remaining dimensions or import the corresponding STL. The later 2011 revision is listed separately.'},
 {id:'adams-2011',name:'Adams updated headpost (2011)',source:'https://pmc.ncbi.nlm.nih.gov/articles/PMC3174814/',dimensions:{baseThickness:1.5},notes:'The 2011 recording-chamber paper also updates the headpost footplate to 1.5 mm and mentions other design changes. Enter the remaining dimensions or import the corresponding STL. This is a separate revision; the 2007 drawing is not automatically thickened.'},
 {id:'gmr-dahp-1',name:'Gray Matter DAHP-1',source:'https://www.graymatter-research.com/head-posts',dimensions:{},notes:'Titanium double-asymmetric headpost, orientation DAHP-1. Measure the post and the fitted footprint, including any shortened or bent feet, or import the matching STL. Measurements reported for DAHP-2 are not assigned to this variant.'},
 {id:'gmr-dahp-2',name:'Gray Matter DAHP-2',source:'https://www.graymatter-research.com/head-posts',dimensions:{baseThickness:1.39},notes:'Six-foot titanium design. The 2017 paper reports a 1.39 mm foot thickness, 3 mm screw openings and 5 mm countersink openings for the illustrated implant. Complete post and leg dimensions are not supplied by those values. Enter the remaining measurements from your implant or import its model.',details:[{label:'Screw opening diameter (reported)',value:'3 mm',source:'https://pmc.ncbi.nlm.nih.gov/articles/PMC5814707/#F4'},{label:'Countersink opening diameter (reported)',value:'5 mm',source:'https://pmc.ncbi.nlm.nih.gov/articles/PMC5814707/#F4'}],resources:[{label:'DAHP-2 measurements and fitted feet · Overton 2017',url:'https://pmc.ncbi.nlm.nih.gov/articles/PMC5814707/#F4'}]},
 {id:'gmr-peek',name:'Gray Matter PEEK headpost',source:'https://www.graymatter-research.com/head-posts',dimensions:{},notes:'PEEK headpost with grooves and lower holes for bone-cement fixation, coupled to a steel connecting rod. Enter measured dimensions for a footprint estimate or import its actual geometry.'},
 {id:'crist',name:'Crist headpost',source:'https://www.cristinstrument.com/',dimensions:{},notes:'Select for a measured or manufacturer-supplied Crist headpost model. Enter the specific part or model name above. No universal dimensions are assigned from the manufacturer homepage or the historical device described in the Adams paper.'},
 {id:'ortiz-rios-ha-peek',name:'Ortiz-Rios HA-PEEK (2018)',source:'https://pmc.ncbi.nlm.nih.gov/articles/PMC6203806/',profile:'trapezoid',dimensions:{postHeight:27,postDiameter:Math.hypot(15,11)},notes:'The preview uses the published trapezoidal post profile. The baseplate was fitted for each animal. Enter its footprint and thickness from your design or measurements.',details:[{label:'Post profile',value:'15 mm long · 7 / 11 mm wide',source:'https://pmc.ncbi.nlm.nih.gov/articles/PMC6203806/#F2'}]},
 {id:'esi-modular',name:'ESI modular',source:'https://doi.org/10.1016/j.jneumeth.2023.109899',dimensions:{},notes:'This design has a baseplate fitted to the individual skull. Enter the dimensions of your fitted baseplate and post or import the fitted STL.',resources:[{label:'Download published ESI design models',url:'https://doi.org/10.5281/zenodo.7300042'}]},
]
/** Further reading for implanted headposts; caps and chair holders are excluded. */
export const headpostDesignResources=[
 {title:'Psarou 2023 modular fitted headpost',url:'https://doi.org/10.1016/j.jneumeth.2023.109899',note:'Two-piece macaque headpost with a skull-fitted baseplate. The publication describes shared design models; the actual fitted geometry is not bundled in this app.'},
 {title:'Adams 2007 headpost and supplementary drawing',url:'https://journals.physiology.org/doi/full/10.1152/jn.00102.2007?doi=10.1152%2Fjn.00102.2007',note:'Original Mark II design; the publisher lists ucsf2008-002a.dwg. The app does not bundle or directly import DWG drawings.'},
 {title:'Overton 2017 implant fitting and DAHP-2',url:'https://pmc.ncbi.nlm.nih.gov/articles/PMC5814707/',note:'Describes skull-specific bending and shortening of headpost feet. The actual fitted shape is needed for an accurate imported-model preview.'},
 {title:'Adams 2011 chamber and headpost update',url:'https://pmc.ncbi.nlm.nih.gov/articles/PMC3174814/',note:'Primarily a recording-chamber paper. It also documents the separate 1.5 mm headpost-footplate revision.'},
] as const
export function headpostBounds(h:Headpost):[Vec3,Vec3]{
 if(h.mesh){const lo:Vec3=[Infinity,Infinity,Infinity],hi:Vec3=[-Infinity,-Infinity,-Infinity];for(let i=0;i<h.mesh.pts.length;i+=3)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],h.mesh.pts[i+k]);hi[k]=Math.max(hi[k],h.mesh.pts[i+k])}return [lo,hi]}
 const r=Math.max(h.baseDiameter!,h.postDiameter!)/2;return [[-r,-r,0],[r,r,h.baseThickness!+h.postHeight!]]
}
/** Conservative envelopes deliberately include the space between feet and around imported parts. */
export function headpostAvoidance(p:Project):AvoidRegion[]{return (p.headposts??[]).filter(h=>h.avoid).flatMap(h=>{
 const region=(name:string,points:Vec3[],radius:number):AvoidRegion=>({id:`headpost:${h.id}:${name}`,name:`${h.name} — ${name} (conservative envelope)`,frameId:p.frame.id,center:points[0],points,radius,constraint:'hard'})
 if(h.mesh){const [lo,hi]=headpostBounds(h),center=lo.map((v,k)=>(v+hi[k])/2) as Vec3;return [region('imported model',[localToWorld(h.pose,center)],Math.hypot(...hi.map((v,k)=>(v-lo[k])/2)))]}
 return [region('baseplate',[localToWorld(h.pose,[0,0,0]),localToWorld(h.pose,[0,0,h.baseThickness!])],h.baseDiameter!/2),region('post',[localToWorld(h.pose,[0,0,h.baseThickness!]),localToWorld(h.pose,[0,0,h.baseThickness!+h.postHeight!])],h.postDiameter!/2)]
 })}
