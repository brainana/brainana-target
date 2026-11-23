import { Niivue, NVMesh, NVImage, SLICE_TYPE } from '@niivue/niivue'
import { installAnatomyCompositing } from '../src/render/anatomyCompositing.ts'
import { skullPreview } from '../src/render/ctSkull.ts'
const canvas = document.querySelector('canvas')!
const viewer = new Niivue({ backColor: [0,0,0,1], isColorbar:false, isOrientCube:false, dragAndDropEnabled:false })
await viewer.attachToCanvas(canvas,false)
viewer.setSliceType(SLICE_TYPE.RENDER)
const dims=[80,80,80],values=new Uint8Array(80**3)
for(let z=0;z<80;z++)for(let y=0;y<80;y++)for(let x=0;x<80;x++){
 const px=x*.2-8,py=y*.2-8,pz=z*.2-8,r=Math.hypot(px,py*.8,pz*1.2)
 values[x+y*80+z*6400]=r<3.8 ? 120 : r>4.7&&r<5.2&&px<1?90:0
}
const image=await NVImage.loadFromUrl({url:NVImage.createNiftiArray(dims,[.2,.2,.2],[.2,0,0,-8,0,.2,0,-8,0,0,.2,-8,0,0,0,1],2,values),name:'MRI.nii'})
image.cal_min=0;image.cal_max=150;image.opacity=.3
viewer.addVolume(image)
const volumeDraw=viewer.drawImage3D.bind(viewer)
let includeVolume=false
viewer.drawImage3D=(...args)=>{if(includeVolume)volumeDraw(...args)}
const geometry = skullPreview({ sample: p => {
 const radius=Math.hypot(p[0],p[1]*.8,p[2]*1.2)
 return radius>4&&radius<4.6 ? 200 : 0
}},100,[[-6,-7,-5],[6,7,5]],{spacingMm:.07,representation:'smooth',components:'largest'})
const mesh = new NVMesh(geometry.pts,geometry.tris,'skull',new Uint8Array([230,70,20,255]),1,true,viewer.gl)
viewer.addMesh(mesh)
viewer.setRenderAzimuthElevation(120,25)
const read = () => {
 viewer.drawScene()
 const pixels=new Uint8Array(canvas.width*canvas.height*4)
 viewer.gl.readPixels(0,0,canvas.width,canvas.height,viewer.gl.RGBA,viewer.gl.UNSIGNED_BYTE,pixels)
 return pixels
}
const baseline = [1,.85,.3].map(opacity=>{mesh.opacity=opacity;return read()})
installAnatomyCompositing(viewer,()=>[mesh])
const results=[1,.85,.3].map((opacity,index)=>{
 mesh.opacity=opacity
 const actual=read(),before=baseline[index]
 let covered=0,missing=0,changed=0
 for(let i=0;i<before.length;i+=4){
  if(before[i]+before[i+1]+before[i+2]>24){covered++;if(actual[i]+actual[i+1]+actual[i+2]<12)missing++}
  if(Math.abs(before[i]-actual[i])>30)changed++
 }
 return {opacity,covered,missing,changed,missingFraction:missing/covered}
})
mesh.opacity=1
const skullOnly=read()
includeVolume=true
const combined=[0,.3,1].map(opacity=>{
 image.opacity=opacity;viewer.updateGLVolume()
 const actual=read()
 let skullPixels=0,obscured=0,outsideVolume=0
 for(let i=0;i<actual.length;i+=4){
  if(skullOnly[i]-skullOnly[i+1]>50){skullPixels++;if(actual[i]-actual[i+1]<30)obscured++}
  if(skullOnly[i]+skullOnly[i+1]+skullOnly[i+2]<5&&actual[i]+actual[i+1]+actual[i+2]>15)outsideVolume++
 }
 return {opacity,skullPixels,obscured,outsideVolume,obscuredFraction:obscured/skullPixels}
})
// A green object inside the MRI must remain visible through translucent tissue,
// and disappear behind fully opaque tissue when the skull is hidden.
const {sphere}=await import('../src/render/primitives.ts')
const part=sphere([0,0,0],.8)
const hardware=new NVMesh(part.pts,part.tris,'hardware',new Uint8Array([20,240,20,255]),1,true,viewer.gl)
viewer.addMesh(hardware);mesh.opacity=0
const hardwareResults=[0,.3,1].map(opacity=>{
 image.opacity=opacity;viewer.updateGLVolume()
 const pixels=read();let green=0
 for(let i=0;i<pixels.length;i+=4)if(pixels[i+1]-Math.max(pixels[i],pixels[i+2])>40)green++
 return {opacity,green}
})
Object.assign(window,{comparison:{results,combined,hardwareResults,triangles:geometry.tris.length/3,antialias:viewer.gl.getContextAttributes()?.antialias,errors:viewer.gl.getError()}})
