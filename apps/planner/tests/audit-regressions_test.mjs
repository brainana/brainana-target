import {addDirectElectrode} from '@brainana/planning-core/electrode-frame.ts'
import assert from 'node:assert/strict'
import {unzipSync,strFromU8} from 'fflate'
import {addAssembly,createProject} from '@brainana/planning-core/model.ts'
import {gridHoleClearance} from '@brainana/planning-core/geometry.ts'
import {validateProject} from '@brainana/planning-core/validation.ts'
import {connectorPreset} from '@brainana/planning-core/connectors.ts'
import {installConfiguredElectrode} from '../src/hardware/configuration.ts'
import {hardwareCatalog,applyHardwarePreset} from '../src/hardware/catalog.ts'
import {coordinateRows,planReport} from '../src/data/export.ts'
import {geometryBundle} from '../src/data/geometryExport.ts'
import {packProject,unpackProject} from '../src/data/archive.ts'
import {hashBytes} from '../src/data/assets.ts'
import {fitMask} from '../src/evaluation/geometry.ts'

const bytes=new Uint8Array([1,2,3])
const reference={id:'ref_fixture',name:'Reference.nii',role:'anatomy',frameId:'f',sha256:await hashBytes(bytes),sourcePath:null}
const make=()=>{const p=createProject(reference,'Audit',{kind:'standalone',subject:null,scan:null,sourceRoot:null});addAssembly(p,[0,0,15]);return p}
{
 const p=make();p.chambers=[];p.grids=[];p.electrodes=[];p.planningIntent='direct'
 const e=addDirectElectrode(p)
 assert.equal(e.direct.unplaced,true)
 assert.ok(e.depth>=e.contactLength)
 validateProject(p)
}
const setup=p=>{
 const original=structuredClone(p.electrodes[0]),next=structuredClone(original)
 applyHardwarePreset(next,hardwareCatalog.find(h=>h.id==='micro-fma'))
 return [original,next]
}
{
 const p=make();p.electrodes[0].hole=[2,1]
 const [original,next]=setup(p);installConfiguredElectrode(p,original,next)
 assert.equal(p.grids[0].enabled,false);assert.deepEqual(p.electrodes[0].hole,[0,0]);validateProject(p)
 assert.throws(()=>installConfiguredElectrode(p,original,next),/changed while/)
}
{
 const p=make();p.electrodes[0].hole=[2,1]
 p.electrodes.push({...structuredClone(p.electrodes[0]),id:'other',hole:[-1,-1]})
 installConfiguredElectrode(p,...setup(p))
 assert.notEqual(p.grids[0].enabled,false);assert.deepEqual(p.electrodes[0].hole,[0,0]);assert.deepEqual(p.electrodes[1].hole,[-1,-1]);validateProject(p)
}
{
 const p=make()
 p.chambers[0].placementState='unplaced'
 p.electrodes[0].connector=connectorPreset('cereport-128',[20,0,0])
 p.electrodes[0].connector.unplaced=false
 assert.deepEqual(coordinateRows(p).slice(1).map(row=>row[0]),['connector_base'])
 const files=unzipSync(geometryBundle(p,[]))
 assert.ok(Object.keys(files).some(k=>k.startsWith('connector-')))
 assert.ok(!Object.keys(files).some(k=>/^(chamber|grid|electrode|guide-tube)-/.test(k)))
 assert.equal(JSON.parse(strFromU8(files['dimensions-and-coordinates.json'])).chambers[0].placementState,'unplaced')
 assert.match(planReport(p,null),/not placed; no clearance evaluated/)
 const bundle=await unpackProject(await packProject(p,new Map([[reference.id,bytes]])))
 assert.equal(bundle.project.assets[0].id,reference.id)
 p.assets[0].id='../reference';p.frame.referenceAssetId=p.assets[0].id
 await assert.rejects(packProject(p,new Map([[p.assets[0].id,bytes]])),/cannot be written/)
}
{
 const values=new Uint8Array(9**3)
 for(const [x,y,z] of [[0,4,4],[8,4,4],[4,1,1],[4,7,7]])values[x+9*(y+9*z)]=1
 const matrix=[1,0,0,0,0,1,0,0,0,0,1,0,5000,-6000,1200,1]
 const fit=fitMask({dims:[9,9,9],values,matrix,slope:1,intercept:0})
 // The old solver selected X (highest diagonal variance) and got stuck there.
 // The actual largest eigenvalue is along the Y/Z diagonal, exactly orthogonal to X.
 for(const [actual,expected] of [[fit.start,[5004,-5999,1201]],[fit.tip,[5004,-5993,1207]]]){
  const direct=actual.every((v,i)=>Math.abs(v-expected[i])<1e-8)
  const reversed=actual.every((v,i)=>Math.abs(v-([10008,-11992,2408][i]-expected[i]))<1e-8)
  assert.ok(direct||reversed)
 }
 const square=new Uint8Array([1,1,1,1])
 assert.throws(()=>fitMask({dims:[2,2,1],values:square,matrix,slope:1,intercept:0}),/no unique long axis/)
}
{
 const p=make(),[c]=p.chambers,[g]=p.grids,[e]=p.electrodes
 c.innerRadius=5.3;g.holeDiameter=1
 assert.ok(gridHoleClearance(c,g,e,[4,0])>=0)
 assert.ok(gridHoleClearance(c,g,e,[5,0])<0,'A flat drilled channel must not break out through the side of the insert')
}
console.log('Audit regressions: incompatible hardware transition, stale configuration, unplaced exports, independent connector, portable IDs, and principal-axis counterexample passed.')
