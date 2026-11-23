import assert from 'node:assert/strict'
import {createProject,addAssembly} from '@brainana/planning-core/model.ts'
import {ProjectStore} from '../src/state/store.ts'
import {beginPlacementTask,cancelPlacementTask,invalidatePlacementTask} from '../src/state/placementTasks.ts'
const project=createProject({id:'a',name:'MRI',role:'anatomy',modality:'mri',frameId:'frame',sha256:'a'.repeat(64),sourcePath:null},'Tasks',{kind:'standalone',subject:null,scan:null,sourceRoot:null})
addAssembly(project,[0,0,20])
project.avoidRegions=[{id:'patch',name:'Avoid',frameId:'frame',center:[0,0,0],radius:2,drawingMode:'surface',surfacePatch:{pts:[0,0,0,1,0,0,0,1,0],tris:[0,1,2]}}]
const store=new ProjectStore();store.replace(project)
const first=beginPlacementTask(store,store.project)
store.edit(p=>{p.name='Renamed';p.display.atlasVisible=!p.display.atlasVisible})
invalidatePlacementTask(store,store.project)
assert.equal(first.current(store.project),true,'Display and project-name edits must not invalidate an expensive placement calculation')
const second=beginPlacementTask(store,store.project)
assert.equal(first.signal.aborted,true,'A newer request cancels the older worker')
assert.equal(first.current(store.project),false)
first.finish();assert.equal(second.current(store.project),true,'Finishing an older request cannot cancel its successor')
store.edit(p=>{p.chambers[0].height+=1});invalidatePlacementTask(store,store.project)
assert.equal(second.signal.aborted,true);assert.equal(second.current(store.project),false)
const third=beginPlacementTask(store,store.project);store.clear();invalidatePlacementTask(store,null)
assert.equal(third.signal.aborted,true,'Clearing/changing projects cancels placement')
store.replace(project);const fourth=beginPlacementTask(store,store.project);cancelPlacementTask(store);assert.equal(fourth.signal.aborted,true)
console.log('Placement lifecycle: latest request wins, old completion cannot cancel a successor, geometry/project changes cancel work, display edits preserve work, and explicit cancellation passed.')
