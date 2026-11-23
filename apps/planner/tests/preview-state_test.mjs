import assert from 'node:assert/strict'
import {createProject,addAssembly} from '../../../packages/planning-core/model.ts'
import {PlacementPreviewState} from '../src/state/placementPreview.ts'
import {controlExplanation} from '../src/ui/controlHelp.ts'
const p=createProject({id:'a',name:'mri.nii',role:'anatomy',frameId:'f',sha256:'a'.repeat(64),sourcePath:null},'Preview',{kind:'standalone',subject:null,scan:null,sourceRoot:null});addAssembly(p,[0,0,0]);p.chambers[0].placementState='unplaced'
const preview=structuredClone(p);delete preview.chambers[0].placementState;preview.chambers[0].pose.origin=[24,8,12];preview.grids[0].tiltAngle=15
const state=new PlacementPreviewState();state.begin(p,preview)
for(const tab of ['positioning','grid','targets','images','grid','review']){const shown=state.synchronize(p);assert.deepEqual(shown.chambers[0].pose.origin,[24,8,12],`${tab} keeps the preview`);assert.equal(shown.grids[0].tiltAngle,15);assert.notEqual(shown.chambers[0].placementState,'unplaced')}
const display=structuredClone(p);display.display.atlasVisible=true;display.assets[0].imageDisplay={min:0,max:100,opacity:.5,colormap:'gray',visible:true};display.name='Renamed'
assert.deepEqual(state.synchronize(display).assets[0].imageDisplay,display.assets[0].imageDisplay);assert.equal(state.synchronize(display).name,'Renamed');assert.equal(p.chambers[0].placementState,'unplaced','Preview does not apply itself')
const changed=structuredClone(p);changed.grids[0].spacing+=1;assert.equal(state.synchronize(changed),null,'Real planning changes invalidate the preview')
state.begin(p,preview);state.clear();assert.equal(state.synchronize(p),null)
state.begin(p,preview);assert.equal(state.synchronize(null),null)
const control=name=>({tagName:'BUTTON',textContent:name,title:'',getAttribute:()=>null,closest:()=>null})
assert.match(controlExplanation(control('Export dimensions and STL meshes')),/STL/);assert.match(controlExplanation(control('Save project')),/Unapplied placement previews are not saved/);assert.match(controlExplanation(control('Export coordinate table')),/CSV/);assert.match(controlExplanation(control('Export HTML report')),/report/)
assert.match(controlExplanation(control('Cancel preview')),/return to the applied plan/)
const disabled=control('Unclear');disabled.title='Choose an electrode first.';assert.equal(controlExplanation(disabled),'Choose an electrode first.')
console.log('Unapplied preview survives tab/view changes, keeps displayed grid geometry, preserves saved unplaced state, and invalidates on planning edits. Export/action help describes actual contents and disabled reasons.')
