import assert from 'node:assert/strict'
import { TutorialPlayer } from '../src/tutorial/player.ts'
import { lessonProject, permittedPracticeEdit } from '../src/tutorial/checkpoints.ts'
import { createProject } from '@brainana/planning-core/model.ts'

const tasks=[],states=[]
const player=new TutorialPlayer((index,request)=>new Promise((resolve,reject)=>tasks.push({index,request,resolve,reject})),state=>states.push({...state}))
const first=player.seek(1),second=player.seek(2)
assert.equal(tasks[0].request.signal.aborted,true)
tasks[1].resolve();await second;tasks[0].resolve();await first
assert.equal(player.state.index,2);assert.equal(player.state.phase,'watch','A late completion cannot overwrite the requested step')
const practice=player.seek(7,true);tasks.at(-1).resolve();await practice
assert.equal(player.state.phase,'practice');player.practiced();assert.equal(player.state.practiced,true)
const practiceRevision=player.revision
const reset=player.seek(7,true);tasks.at(-1).resolve();await reset;assert.equal(player.state.practiced,false)
assert.notEqual(player.revision,practiceRevision,'Practice feedback from before Reset can be discarded')
const finish=player.next(),finishing=tasks.at(-1),rewind=player.seek(0)
tasks.at(-1).resolve();await rewind;finishing.resolve();await finish
assert.equal(player.state.index,0);assert.equal(player.state.phase,'watch','A superseded Finish cannot mark a different step complete')
const fail=player.seek(2);tasks.at(-1).reject(Error('Missing example'));await fail;assert.equal(player.state.phase,'error');assert.match(player.state.error,/Missing/)
const retry=player.seek(0,true);tasks.at(-1).resolve();await retry;assert.equal(player.state.phase,'watch','Practice is offered only on the authored exercise')
const finalStep=player.seek(7);tasks.at(-1).resolve();await finalStep
const done=player.next();tasks.at(-1).resolve();await done;assert.equal(player.state.phase,'finished')
const leave=player.seek(1);player.dispose();assert.equal(tasks.at(-1).request.signal.aborted,true);tasks.at(-1).resolve();await leave

const p=createProject({id:'mri',frameId:'frame',role:'anatomy',name:'MRI.nii.gz',sha256:'0'.repeat(64),bytes:10},'Example')
p.assets[0].imageDisplay={min:0,max:100,opacity:1,colormap:'gray',visible:true}
p.assets.push({id:'ct',frameId:'frame',role:'ct',name:'CT.nii.gz',sha256:'1'.repeat(64),bytes:10,imageDisplay:{min:350,max:650,opacity:.5,colormap:'gray',visible:true}})
const before=structuredClone(p),checkpoint=lessonProject(p,'ct',5)
assert.deepEqual(p,before);assert.deepEqual(checkpoint.display.anatomyOverlayIds,['ct']);assert.deepEqual(lessonProject(p,'ct',0).display.anatomyOverlayIds,[])
const candidate=structuredClone(checkpoint);candidate.assets[1].imageDisplay.opacity=.2
assert.equal(permittedPracticeEdit(checkpoint,candidate,'ct','opacity'),true)
assert.equal(permittedPracticeEdit(checkpoint,candidate,'ct','none'),false)
for(const value of [NaN,Infinity,-.1,1.1]){const bad=structuredClone(candidate);bad.assets[1].imageDisplay.opacity=value;assert.equal(permittedPracticeEdit(checkpoint,bad,'ct','opacity'),false)}
for(const mutate of [p=>p.assets[1].imageDisplay.min=0,p=>p.display.anatomyOverlayIds=[],p=>p.name='Changed',p=>p.targets.push({id:'new-target'})]){
 const bad=structuredClone(candidate);mutate(bad);assert.equal(permittedPracticeEdit(checkpoint,bad,'ct','opacity'),false,'Only opacity can cross the practice mutation boundary')
}
console.log('Demo tutorial: cancellation, rapid seeking, practice/reset, finish races, errors/retry, immutable checkpoints and edits limited to each exercise passed.')
