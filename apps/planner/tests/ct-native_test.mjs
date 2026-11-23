import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { skullPreview } from '../src/render/ctSkull.ts'
import { selectMaskComponents } from '../src/render/maskComponents.ts'

// Independent six-neighbor reference catches run-frontier wrapping and selected-component errors.
function reference(input,dims,mode,selected) {
 const [nx,ny,nz]=dims,mask=input.slice(),components=[]
 for(let i=0;i<mask.length;i++)if(mask[i]){
  const queue=[i];mask[i]=0
  for(let head=0;head<queue.length;head++){
   const index=queue[head],x=index%nx,y=Math.floor(index/nx)%ny,z=Math.floor(index/(nx*ny))
   for(const next of [x>0?index-1:-1,x+1<nx?index+1:-1,y>0?index-nx:-1,y+1<ny?index+nx:-1,z>0?index-nx*ny:-1,z+1<nz?index+nx*ny:-1])
    if(next>=0&&mask[next]){mask[next]=0;queue.push(next)}
  }
  components.push(queue)
 }
 const chosen=selected!==undefined?components.filter(group=>group.includes(selected)):mode==='all'?components:components.slice().sort((a,b)=>b.length-a.length).slice(0,1)
 for(const group of chosen)for(const index of group)mask[index]=1
 return {mask,components:components.length,retained:chosen.reduce((sum,group)=>sum+group.length,0)}
}
let state=23
for(let test=0;test<100;test++){
 const dims=[3+test%7,4+(test*3)%5,2+(test*2)%7]
 const input=Uint8Array.from({length:dims.reduce((a,b)=>a*b,1)},()=>{state=(1664525*state+1013904223)>>>0;return Number(state/2**32>.67)})
 for(const mode of ['all','largest'])for(const seed of [undefined,input.findIndex(Boolean)]){
  if(seed===-1)continue
  const mask=input.slice(),actual=selectMaskComponents(mask,dims,mode,seed),expected=reference(input,dims,mode,seed)
  assert.deepEqual(mask,expected.mask)
  assert.equal(actual.components,expected.components)
  assert.equal(actual.retained,expected.retained)
 }
}
console.log('Run-based component selection matches an independent six-connected flood fill across 400 random mode/seed cases.')

const spacing=Number(process.env.CT_TEST_SPACING??.05)
const bounds=[[-12.5,-18,-10],[12.5,18,10]]
const dims=bounds[0].map((v,k)=>Math.ceil((bounds[1][k]-v)/spacing))
const sampleCount=dims.reduce((a,b)=>a*b,1)
let last=0
const progress=label=>{
 const now=performance.now()
 if(now-last>1500){console.log(label);last=now}
}
const began=performance.now()
const mesh=skullPreview({sample:p=>{
 const r=p[0]*p[0]/(11.5**2)+p[1]*p[1]/(16.5**2)+p[2]*p[2]/(9.2**2)
 return r>=.84&&r<=1&&!(p[2]>5&&p[0]*p[0]+p[1]*p[1]<1.44)?1000:0
}},300,bounds,{spacingMm:spacing,representation:'smooth',components:'largest'},progress)
assert.equal(mesh.report.spacingMm,spacing)
assert.ok(mesh.tris.length>0)
assert.ok(mesh.pts.every(Number.isFinite))
if(spacing===.05){
 assert.equal(sampleCount,144000000)
 assert.ok(mesh.tris.length/3>2400000,'The full detailed mesh must exceed the previous triangle cutoff')
}
let badHoleFaces=0
for(let i=0;i<mesh.tris.length;i+=3){
 const a=mesh.tris[i]*3,b=mesh.tris[i+1]*3,c=mesh.tris[i+2]*3
 const x=(mesh.pts[a]+mesh.pts[b]+mesh.pts[c])/3,y=(mesh.pts[a+1]+mesh.pts[b+1]+mesh.pts[c+1])/3,z=(mesh.pts[a+2]+mesh.pts[b+2]+mesh.pts[c+2])/3
 if(z>5.5&&x*x+y*y<1)badHoleFaces++
}
assert.equal(badHoleFaces,0,'The native sampling must leave the known opening empty')
console.log(JSON.stringify({spacing,sampleCount,vertices:mesh.pts.length/3,triangles:mesh.tris.length/3,seconds:(performance.now()-began)/1000,rssMiB:process.memoryUsage().rss/1048576,knownOpeningPreserved:true}))
