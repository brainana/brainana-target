import assert from 'node:assert/strict'
class Element extends EventTarget {
  style={};dataset={};children=[];attributes=new Map();isConnected=true;offsetWidth=300;offsetHeight=80
  append(child){this.children.push(child);if(typeof child==='object')child.parent=this}
  setAttribute(k,v){this.attributes.set(k,v)}
  removeAttribute(k){this.attributes.delete(k)}
  closest(){return null}
  querySelectorAll(){return []}
  querySelector(){return null}
  getAttribute(k){return this.attributes.get(k)??null}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);this.isConnected=false}
  getBoundingClientRect(){return {left:620,right:980,top:100,bottom:140}}
}
const doc=new EventTarget();doc.body=new Element();doc.documentElement=new Element();doc.createElement=()=>new Element()
globalThis.document=doc;globalThis.innerWidth=1000;globalThis.innerHeight=600
const realTimer=globalThis.setTimeout,realClear=globalThis.clearTimeout
let pending=null
globalThis.setTimeout=fn=>{pending=fn;return 1};globalThis.clearTimeout=()=>{pending=null}
const flush=()=>{const fn=pending;pending=null;fn?.()}
try {
  const {hoverHelp}=await import('../src/ui/hoverHelp.ts')
  const control=new Element();hoverHelp(control,'Help')
  control.dispatchEvent(new Event('pointerenter'));assert.equal(doc.body.children.length,0,'Help is delayed')
  flush();assert.equal(doc.body.children.length,1)
  const tip=doc.body.children[0],r=control.getBoundingClientRect()
  assert.ok(Number.parseFloat(tip.style.left)+tip.offsetWidth<r.left,'Near the right edge, help stays left of the slider')
  doc.dispatchEvent(new Event('pointerdown'));assert.equal(doc.body.children.length,0,'Pointer press hides help')
  control.dispatchEvent(new Event('focusin'));flush();assert.equal(doc.body.children.length,0,'Mouse focus must not reopen help during drag')
  control.dispatchEvent(new Event('pointerenter'));flush();assert.equal(doc.body.children.length,0,'Hover during drag stays hidden')
  doc.dispatchEvent(new Event('pointerup'))
  control.dispatchEvent(new Event('focusin'));flush();assert.equal(doc.body.children.length,1,'Keyboard focus retains help')
  doc.dispatchEvent(new Event('input'));assert.equal(doc.body.children.length,0,'Keyboard slider adjustment hides help')
  console.log('Tooltip delay, non-overlap placement, pointer drag suppression and keyboard adjustment passed (DOM geometry mocked).')
} finally {globalThis.setTimeout=realTimer;globalThis.clearTimeout=realClear}

// Dynamically created controls receive useful help without an explicit per-panel hook.
{
 globalThis.MouseEvent=class extends Event{};globalThis.Node=Element
 const {installControlHelp}=await import('../src/ui/hoverHelp.ts')
 const {controlExplanation}=await import('../src/ui/controlHelp.ts')
 let callback=null
 globalThis.setTimeout=fn=>{callback=fn;return 1};globalThis.clearTimeout=()=>{callback=null}
 try{
  installControlHelp()
  const dynamic=new Element();dynamic.tagName='BUTTON';dynamic.textContent='Export dimensions and STL meshes'
  dynamic.closest=function(selector){if(selector==='[data-hover-help]')return this.dataset.hoverHelp?this:null;if(selector.startsWith('button,'))return this;return null}
  const enter=new Event('pointerover');Object.defineProperty(enter,'target',{value:dynamic});doc.dispatchEvent(enter)
  callback?.();assert.equal(doc.body.children.length,1);assert.ok(doc.body.children[0].children.some(s=>typeof s==='string'&&s.includes('STL')))
  doc.dispatchEvent(new Event('pointerdown'));assert.equal(doc.body.children.length,0)
  const focus=new Event('focusin');Object.defineProperty(focus,'target',{value:dynamic});doc.dispatchEvent(focus);callback?.();assert.equal(doc.body.children.length,0,'Delegated help stays hidden during interaction')
  doc.dispatchEvent(new Event('pointerup'))
  assert.match(controlExplanation(dynamic),/manufacturing tolerances/)
  console.log('Dynamic export controls receive explanatory hover help and respect interaction suppression.')
 }finally{globalThis.setTimeout=realTimer;globalThis.clearTimeout=realClear}
}
