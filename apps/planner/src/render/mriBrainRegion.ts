import type { Vec3 } from '@brainana/planning-core/model.ts'
import type { ScalarImage } from './mriDarkBand.ts'
import type { MRISurfaceSettings } from './mriSurface.ts'
const cache=new WeakMap<ScalarImage,{key:string;region:ScalarImage}>()
/** Connected bright tissue around an explicit brain seed. This is a reviewable starting region, not skull stripping. */
export function estimateBrainRegion(image:ScalarImage,settings:MRISurfaceSettings):ScalarImage {
  const input=settings.brainEstimate
  if(!input)throw Error('Choose a point inside the brain and set a brain-tissue cutoff first.')
  const [lo,hi]=settings.bounds,step=settings.spacingMm,key=JSON.stringify([input,settings.bounds,step])
  const saved=cache.get(image);if(saved?.key===key)return saved.region
  const dims=lo.map((v,k)=>Math.ceil((hi[k]-v)/step)),count=dims.reduce((a,b)=>a*b,1)
  if(!Number.isFinite(step)||step<.05||!Number.isFinite(input.threshold)||!Number.isSafeInteger(count)||count<=0||count>24000000)throw Error('Brain-region estimate needs valid crop/detail settings with at most 24 million samples. Crop more tightly or choose coarser detail.')
  const cell=(p:Vec3)=>p.map((v,k)=>Math.floor((v-lo[k])/step))
  const seed=cell(input.seed)
  if(seed.some((v,k)=>!Number.isFinite(v)||v<0||v>=dims[k]))throw Error('The brain seed is outside the crop. Click inside brain tissue in an MRI slice.')
  const mask=new Uint8Array(count),point:Vec3=[0,0,0]
  for(let z=0;z<dims[2];z++)for(let y=0;y<dims[1];y++)for(let x=0;x<dims[0];x++){
    point[0]=lo[0]+x*step+Math.min(step,hi[0]-lo[0]-x*step)/2
    point[1]=lo[1]+y*step+Math.min(step,hi[1]-lo[1]-y*step)/2
    point[2]=lo[2]+z*step+Math.min(step,hi[2]-lo[2]-z*step)/2
    const value=image.sample(point,true);mask[x+y*dims[0]+z*dims[0]*dims[1]]=Number(Number.isFinite(value)&&value>=input.threshold)
  }
  const start=seed[0]+seed[1]*dims[0]+seed[2]*dims[0]*dims[1]
  if(!mask[start])throw Error('The brain seed is below the tissue cutoff. Lower the cutoff or click brighter brain tissue.')
  const queue=new Int32Array(count);let head=0,tail=1;queue[0]=start;mask[start]=2
  const visit=(i:number)=>{if(mask[i]===1){mask[i]=2;queue[tail++]=i}}
  while(head<tail){const i=queue[head++],x=i%dims[0],y=Math.floor(i/dims[0])%dims[1],z=Math.floor(i/(dims[0]*dims[1]));if(x)visit(i-1);if(x+1<dims[0])visit(i+1);if(y)visit(i-dims[0]);if(y+1<dims[1])visit(i+dims[0]);if(z)visit(i-dims[0]*dims[1]);if(z+1<dims[2])visit(i+dims[0]*dims[1])}
  for(let i=0;i<count;i++)mask[i]=Number(mask[i]===2)
  const region:ScalarImage={sample:p=>{const v=cell(p);return v.some((n,k)=>n<0||n>=dims[k]||!Number.isFinite(n))?0:mask[v[0]+v[1]*dims[0]+v[2]*dims[0]*dims[1]]}}
  cache.set(image,{key,region});return region
}
