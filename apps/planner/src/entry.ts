import {h} from '@brainana/ui/dom.ts'
import '@brainana/ui/theme.css'
import './style.css'
import './home.css'
import './evaluation/workspace.css'
import {applyAppearance,readPreferences} from './ui/settings.ts'

const mode=new URLSearchParams(location.search).get('workspace')
const root=document.querySelector<HTMLElement>('#app')!
const home=document.getElementById('startup-home')!
const help=document.getElementById('startup-help')!
const evaluating=mode==='evaluate'
const tutorial=mode==='tutorial'
const loading=h('p',{class:'workspace-loading',role:'status'},[tutorial?'Opening demo tutorial…':'Opening evaluation workspace…'])
if(evaluating||tutorial){applyAppearance(readPreferences());root.replaceChildren(loading)}
const timer=evaluating||tutorial?window.setTimeout(()=>{
 if(loading.isConnected)loading.replaceChildren('The workspace is still starting. ',h('a',{href:'/'},['Back to home']))
},8000):undefined
void (evaluating?import('./evaluation/workspace.ts'):import('./main.ts')).then(()=>loading.remove(),error=>{
 root.classList.remove('evaluation-root')
 help.hidden=false
 root.replaceChildren(home)
 console.error('Workspace startup failed:',error)
}).finally(()=>window.clearTimeout(timer))
