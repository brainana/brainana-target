import {h} from '@brainana/ui/dom.ts'
import {NVMeshLoaders} from '@niivue/niivue'
import {newId,type Headpost,type Project,type Vec3} from '@brainana/planning-core/model.ts'
import {headpostReferences,headpostBounds,headpostDesignResources,headpostDimensionProblem,headpostDimensionRangeProblem,headpostDimensions as dimensions} from '@brainana/planning-core/headposts.ts'
import {geometryIdentity} from '../render/avoidanceKey.ts'
import type {PlannerFeature,FeatureContext} from './contracts.ts'
import {button,note,section,chooseFile,errorDialog,readout,selectField} from '../ui/controls.ts'
import {withActivity} from '../ui/activity.ts'
import {headpostPreview} from '../ui/headpostPreview.ts'
interface Draft {
 name:string;reference:string;dimensions:string[];position:string[];existing:boolean;avoid:boolean
 mesh?:Headpost['mesh'];sourceName?:string
}
interface Session {projectKey:string;postId?:string;baseline:string;draft:Draft}
const headpostIdentity=({mesh,...post}:Headpost)=>[post,geometryIdentity(mesh)]
const drafts=new WeakMap<FeatureContext['store'],Session>()
const selected=new WeakMap<FeatureContext['store'],string>()
/** Do not serialize large CAD buffers when checking whether a panel needs rebuilding. */
export function headpostPanelIdentity(p:Project):string {
 return JSON.stringify([p.id,p.frame.id,p.headposts?.map(headpostIdentity)])
}
function editor(ctx:FeatureContext,original?:Headpost):HTMLElement{
 const p=ctx.project!,root=h('form',{class:'headpost-editor'})
 const feedback=h('p',{class:'note',role:'status',ariaLive:'polite'})
 let showPlacement=false,picking=false,placementRequest=0
 const baseline=JSON.stringify(original&&headpostIdentity(original)),projectKey=JSON.stringify([p.id,p.frame.id])
 let session=drafts.get(ctx.store)
 if(!session||session.projectKey!==projectKey||session.postId!==original?.id||session.baseline!==baseline){
  session={projectKey,postId:original?.id,baseline,draft:{name:original?.name??'Headpost',reference:original?.reference??'custom',dimensions:dimensions.map(([,key])=>original?.[key]===undefined?'':String(original[key])),position:(original?[...original.pose.origin,...original.pose.angles]:[...ctx.crosshair(),0,0,0]).map(String),existing:original?.existing??false,avoid:original?.avoid??true,mesh:original?.mesh,sourceName:original?.sourceName}}
  drafts.set(ctx.store,session)
 }
 const draft=session.draft
 root.dataset.projectId=p.id;root.dataset.headpostIdentity=headpostPanelIdentity(p)
 const name=h('input',{type:'text',required:true,value:draft.name,ariaLabel:'Headpost name'})
 const reference=h('select',{ariaLabel:'Headpost reference'},headpostReferences.map(r=>h('option',{value:r.id},[r.name])))
 reference.value=draft.reference
 const referenceNote=note(''),link=h('a',{target:'_blank',rel:'noopener noreferrer'},['Open design / dimension reference'])
 const inputs=dimensions.map(([label,,min,max],i)=>h('input',{type:'number',required:true,min:String(min),max:String(max),step:'any',value:draft.dimensions[i],ariaLabel:label,placeholder:'Enter measured value'}))
 const positions=['R / right (mm)','A / anterior (mm)','S / superior (mm)','Rotation X (°)','Rotation Y (°)','Rotation Z (°)'].map((label,i)=>h('input',{type:'number',required:true,min:'-10000',max:'10000',step:'any',value:draft.position[i],ariaLabel:`Headpost ${label}`}))
 const existing=h('input',{type:'checkbox',checked:draft.existing,ariaLabel:'Headpost is already implanted'})
 const avoid=h('input',{type:'checkbox',checked:draft.avoid,ariaLabel:'Avoid headpost during chamber and electrode placement'})
 const diameterLabel=h('span')
 const positionInfo=note(''),modelNote=note(''),publishedDetails=h('div',{class:'headpost-reference-details'}),modelDimensions=h('div'),dimensionFields=h('div',{class:'headpost-dimensions'},inputs.map((input,i)=>h('label',{class:'field'},[i===0?diameterLabel:dimensions[i][0],input])))
 const dimensionFeedback = h('p', { class: 'note', ariaLive: 'polite', hidden: true })
 const preview=headpostPreview(),save=h('button',{type:'submit',class:'primary'},[original?'Save headpost changes':'Save headpost'])
 const postFromDraft=():Headpost=>({id:original?.id??'headpost-draft',name:draft.name.trim(),frameId:p.frame.id,pose:{origin:draft.position.slice(0,3).map(Number) as Vec3,angles:draft.position.slice(3).map(Number) as Vec3},avoid:draft.avoid,existing:draft.existing,reference:draft.reference,...(draft.mesh?{mesh:draft.mesh,sourceName:draft.sourceName}:{postDiameter:Number(draft.dimensions[0]),postHeight:Number(draft.dimensions[1]),baseDiameter:Number(draft.dimensions[2]),baseThickness:Number(draft.dimensions[3])})})
 const previewDraft=()=>{
  const post=postFromDraft()
  const rangeProblem=headpostDimensionRangeProblem(post)
  const dimensionProblem=headpostDimensionProblem(post)
  const footprintProblem=!rangeProblem && !!dimensionProblem
  dimensionFeedback.hidden=!footprintProblem
  dimensionFeedback.textContent=footprintProblem?dimensionProblem!:''
  inputs[2].setAttribute('aria-invalid', String(footprintProblem))
  const poseReady=draft.position.every(value=>value.trim()!==''&&Number.isFinite(Number(value))&&Math.abs(Number(value))<=10000)
  preview.update(rangeProblem?null:post,footprintProblem?'Preview of entered dimensions. Correct the baseplate measurement before saving.':undefined)
  if(showPlacement)ctx.previewHeadpost?.(!dimensionProblem&&poseReady?post:null)
 }
 const updateReference=()=>{
  const ref=headpostReferences.find(r=>r.id===draft.reference)??headpostReferences[0]
  const postDiameterLabel=ref.profile?'Post envelope diameter (mm)':dimensions[0][0]
  inputs[0].ariaLabel=postDiameterLabel
  diameterLabel.textContent=postDiameterLabel
  referenceNote.textContent=ref.notes;link.href=ref.source;link.hidden=!ref.source
  publishedDetails.replaceChildren(...(ref.details??[]).map(detail=>h('div',{},[readout(detail.label,detail.value),h('a',{href:detail.source,target:'_blank',rel:'noopener noreferrer'},['Measurement source'])])),...(ref.resources??[]).map(resource=>h('a',{href:resource.url,target:'_blank',rel:'noopener noreferrer'},[resource.label])))
  const imported=!!draft.mesh
  dimensionFields.hidden=imported
  inputs.forEach(input=>{input.required=!imported;input.disabled=imported})
  useDimensions.hidden=!imported
  if(imported){
    const [lo,hi]=headpostBounds(postFromDraft())
    modelDimensions.replaceChildren(...['width','depth','height'].map((label,k)=>readout(`Model ${label} (mm)`,(hi[k]-lo[k]).toFixed(2))))
  }else modelDimensions.replaceChildren()
  modelNote.textContent=imported?`Imported model: ${draft.sourceName}. Overall dimensions are measured from the STL; they are not a cylindrical approximation.`:'Published dimensions fill in where available. Enter any missing measurements to show a planning envelope. Import an STL if you need the detailed shape of the fitted implant.'
  positionInfo.textContent=imported?'The STL must already line up with the image in RAS millimetres. These position and rotation fields apply an additional transform.':'Position refers to the centre of the baseplate underside. Choose a location to preview it in the anatomical views, then save the headpost.'
  previewDraft()
 }
 reference.addEventListener('change',()=>{
  draft.reference=reference.value
  const ref=headpostReferences.find(r=>r.id===draft.reference)!
  draft.dimensions=dimensions.map(([,key])=>ref.dimensions[key]===undefined?'':String(ref.dimensions[key]))
  inputs.forEach((input,i)=>{input.value=draft.dimensions[i]});updateReference()
 })
 const retain=(input:HTMLInputElement,change:()=>void)=>{input.addEventListener('input',change);input.addEventListener('change',change)}
 retain(name,()=>{draft.name=name.value})
 inputs.forEach((input,i)=>retain(input,()=>{draft.dimensions[i]=input.value;previewDraft()}))
 positions.forEach((input,i)=>retain(input,()=>{draft.position[i]=input.value;if(showPlacement)previewDraft()}))
 existing.addEventListener('change',()=>{draft.existing=existing.checked});avoid.addEventListener('change',()=>{draft.avoid=avoid.checked})
 const position=(origin:Vec3,angles:Vec3)=>{draft.position=[...origin,...angles].map(String);positions.forEach((input,i)=>{input.value=draft.position[i]})}
 const setPicking=(active:boolean)=>{
  picking=active
  save.disabled=active
  pickLocation.textContent=active?'Cancel skull pick':'Choose headpost location on skull'
  pickLocation.setAttribute('aria-pressed',String(active))
  if(!active)ctx.scene.setSurfaceFitHandler?.(null)
 }
 const useCrosshair=button('Use crosshair as headpost base',()=>{
  placementRequest++
  if(picking)setPicking(false)
  ctx.scene.setHeadpostSlide?.(null)
  save.disabled=false
  ctx.crosshair().forEach((value,i)=>{draft.position[i]=positions[i].value=String(value)})
  showPlacement=true
  previewDraft()
  feedback.textContent=headpostDimensionProblem(postFromDraft())
   ? 'Crosshair location set. Complete the dimensions to see the preview.'
   : 'Headpost preview at the crosshair. Save headpost to keep this location.'
 })
 const pickLocation=button('Choose headpost location on skull',()=>{
  const request=++placementRequest
  if(picking){setPicking(false);feedback.textContent='Skull pick canceled.';return}
  const scene=ctx.scene
  if(!scene.setSurfaceFitHandler||!scene.fitHeadpostAt){feedback.textContent='Use the crosshair to set the headpost location.';return}
  if(draft.mesh){feedback.textContent='Use the transform fields to position an aligned STL.';return}
  const problem=headpostDimensionProblem(postFromDraft())
  if(problem){feedback.textContent=problem;return}
  const surface=ctx.scene.mountingSurface
  if(!surface.surfaces.length){feedback.textContent='Finalize a planning surface or use the crosshair to place the headpost.';return}
  const source=surface.source==='skull'?'skull':'brain surface'
  ctx.scene.setHeadpostSlide?.(null)
  setPicking(true)
  feedback.textContent='Preparing the surface picker…'
  const isCurrent=()=>root.isConnected&&request===placementRequest
  const fail=(error:unknown)=>{
   if(!isCurrent())return
   setPicking(false)
   feedback.textContent=error instanceof Error?error.message:String(error)
  }
  void withActivity('Preparing headpost location selection…',()=>{
   if(!isCurrent())return
   feedback.textContent=`Click the ${source} in 3D to preview the headpost.`
   scene.setSurfaceFitHandler?.((point,normal)=>{
    if(!isCurrent())return
    setPicking(false)
    save.disabled=true
    feedback.textContent='Aligning the headpost preview…'
    void withActivity('Aligning the headpost preview…',()=>{
     if(!isCurrent())return
     save.disabled=false
     const post=postFromDraft()
     const problem=headpostDimensionProblem(post)
     if(problem){feedback.textContent=problem;return}
     const pose=scene.fitHeadpostAt!(point,normal,post)
     position(pose.origin,pose.angles)
     showPlacement=true
     previewDraft()
     feedback.textContent='Headpost preview aligned to the surface. Save headpost to keep this location.'
    }).catch(fail)
   },()=>{feedback.textContent=`That click missed the ${source}. Click the surface in 3D, or use the crosshair.`})
  }).catch(fail)
 })
 pickLocation.setAttribute('aria-pressed','false')
 const useDimensions=button('Use dimensions instead',()=>{
  draft.mesh=undefined;draft.sourceName=undefined;updateReference()
 })
 root.append(section(original?'Edit headpost':'Define your headpost',[
  h('label',{class:'field'},['Headpost name',name]),h('label',{class:'field'},['Design / dimensions',reference]),referenceNote,link,publishedDetails,dimensionFields,dimensionFeedback,modelDimensions,
  button('Import headpost STL…',()=>chooseFile('.stl',async file=>withActivity('Reading headpost model…',async()=>{
    const parsed=NVMeshLoaders.readSTL(await file.arrayBuffer())
    if(!parsed.positions?.length||!parsed.indices?.length)throw new Error('The STL contains no usable triangles.')
    if(parsed.indices.length>600000)throw new Error('Reduce the headpost model to 200,000 triangles or fewer before importing.')
    if(parsed.positions.some(v=>!Number.isFinite(v)))throw new Error('The STL contains invalid coordinates.')
    draft.mesh={pts:Array.from(parsed.positions),tris:Array.from(parsed.indices)};draft.sourceName=file.name;position([0,0,0],[0,0,0]);updateReference()
   }),errorDialog)),modelNote,
  useDimensions]),
  section('3D headpost preview',[preview.element]),
  section('Position and placement',[
   positionInfo,
   ...positions.map(input=>h('label',{class:'field'},[input.ariaLabel!.replace('Headpost ',''),input])),h('label',{},[existing,'Already implanted']),h('label',{},[avoid,'Avoid during chamber / electrode placement']),
   note('Avoidance includes the whole baseplate footprint and space between feet. An imported model uses a bounding sphere. Review this envelope if it excludes too much space.'),
   useCrosshair,pickLocation,feedback,save]),h('details',{class:'headpost-design-resources'},[h('summary',{},['Headpost references and further information']),...headpostDesignResources.map(resource=>section(resource.title,[note(resource.note),h('a',{href:resource.url,target:'_blank',rel:'noopener noreferrer'},['Open source'])]))]))
 root.addEventListener('submit',e=>{
  e.preventDefault();if(!root.reportValidity()||save.disabled)return
  // Capture current fields as well as input events, including browser autofill.
  draft.name=name.value;draft.reference=reference.value;draft.dimensions=inputs.map(i=>i.value);draft.position=positions.map(i=>i.value);draft.existing=existing.checked;draft.avoid=avoid.checked
  try{
   if(!draft.name.trim())throw new Error('Enter a headpost name.')
   const post={...postFromDraft(),id:original?.id??newId()}
   const problem=headpostDimensionProblem(post)
   if(problem){feedback.textContent=problem;return}
   const saved=ctx.edit(d=>{d.headposts??=[];const i=d.headposts.findIndex(h=>h.id===post.id);if(i<0)d.headposts.push(post);else d.headposts[i]=post})
   if(saved===false)return
   selected.set(ctx.store,post.id)
   if(drafts.get(ctx.store)===session)drafts.delete(ctx.store)
   placementRequest++
   if(picking)setPicking(false)
   ctx.refresh()
  }catch(e){feedback.textContent=e instanceof Error?e.message:String(e)}
 })
 updateReference();return root
}
function slideControl(ctx:FeatureContext,post:Headpost):HTMLElement {
 const active=ctx.scene.headpostSlideId===post.id
 const slide=button(active?'Cancel headpost slide':'Slide headpost on surface',()=>{
  if(active){ctx.scene.setHeadpostSlide?.(null);ctx.refresh();return}
  void withActivity('Preparing surface for headpost movement…',()=>{
   const current=ctx.store.project
   const saved=current?.headposts?.find(item=>item.id===post.id)
   if(!slide.isConnected||current?.id!==ctx.project?.id||!saved||JSON.stringify(headpostIdentity(saved))!==JSON.stringify(headpostIdentity(post)))return
   ctx.scene.setHeadpostSlide?.(post,pose=>{
    const session=drafts.get(ctx.store)
    if(session?.postId===post.id){
     session.baseline=JSON.stringify(headpostIdentity({...post,pose}))
     session.draft.position=[...pose.origin,...pose.angles].map(String)
    }
    ctx.edit(project=>{
     const current=project.headposts?.find(item=>item.id===post.id)
     if(current)current.pose=pose
    })
   })
   ctx.refresh()
  }).catch(errorDialog)
 })
 slide.setAttribute('aria-pressed',String(active))
 return h('div',{class:'headpost-slide'},[
  slide,
  ...(active?[note('Drag the headpost in 3D. It follows the local surface angle. Release to save the new position. Drag elsewhere to rotate the view.')]:[]),
 ])
}
export const headpostsFeature:PlannerFeature={id:'headposts',label:'Headpost',glyph:'H',description:'Define a headpost, then plan its position and space needed around it',render:ctx=>{
 if(!ctx.project)return note('Load an MRI or CT before defining a headpost.')
 const posts=ctx.project.headposts??[],original=posts.find(h=>h.id===selected.get(ctx.store))??posts[0]
 return h('div',{},[note('Define or import your headpost before planning nearby chambers. An existing headpost visible in CT still needs its dimensions or an aligned model recorded here.'),
  ...(posts.length>1?[selectField('Existing headpost component',original!.id,posts.map(post=>({value:post.id,label:post.name})),id=>{selected.set(ctx.store,id);ctx.refresh()})]:[]),
  ...(original?[section('Saved headpost',[readout('Name',original.name),button('Locate headpost',()=>ctx.scene.moveCrosshair(original.pose.origin)),...(!original.existing&&!original.mesh&&ctx.scene.setHeadpostSlide&&ctx.scene.mountingSurface.surfaces.length?[slideControl(ctx,original)]:[]),button('Remove headpost',()=>{ctx.edit(d=>{d.headposts=d.headposts?.filter(h=>h.id!==original.id)});drafts.delete(ctx.store);ctx.refresh()})])]:[]),editor(ctx,original)])
}}
