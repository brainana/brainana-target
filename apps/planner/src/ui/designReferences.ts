import { h } from '@brainana/ui/dom.ts'
import { note } from './controls.ts'
export type DesignCategory = 'electrodes' | 'chambers'
export const designReferences: Record<DesignCategory, readonly {title:string;description:string;links:readonly {label:string;url:string}[]}[]> = {
 chambers: [
  {title:'McAndrew et al. · Individualized recording chambers (2012)',description:'Macaque chambers fitted to an individual skull using aligned MRI and CT. This is a design method, not a universal chamber size.',links:[{label:'Paper and figures',url:'https://pmc.ncbi.nlm.nih.gov/articles/PMC3348412/'}]},
  {title:'Adams et al. · Titanium recording chamber (2011)',description:'Acrylic-free titanium recording chamber for behaving monkeys. Use the dimensions and geometry of your actual chamber.',links:[{label:'Paper',url:'https://pmc.ncbi.nlm.nih.gov/articles/PMC3174814/'}]},
  {title:'Psarou et al. · Modular customized implants (2023)',description:'Skull-fitted macaque headpost and connector-chamber designs. Connector chambers house connections; they are not interchangeable with electrode-access chambers.',links:[{label:'Paper',url:'https://doi.org/10.1016/j.jneumeth.2023.109899'}]},
 ],
 electrodes: [
  {title:'Open Ephys · ShuttleDrive',description:'Mouse microwire/tetrode drive with individually adjustable electrodes. The drive body is not an electrode contact layout. Specify the actual wire arrangement and dimensions for planning.',links:[{label:'Overview and publication',url:'https://open-ephys.org/shuttledrive'},{label:'Design files and documentation',url:'https://github.com/open-ephys/shuttle-drive'}]},
  {title:'Open Ephys / 3Dneuro · R2 System',description:'Rodent silicon-probe implants: R2drive S, R2drive L and fixed R2rail. These position a separately selected probe; they do not define its recording sites.',links:[{label:'Design overview',url:'https://open-ephys.org/r2system'},{label:'Documentation',url:'https://3dneuro.github.io/r2-docs/index.html'},{label:'Design repository linked by Open Ephys',url:'https://github.com/buzsakilab/3d_print_designs'},{label:'Vöröslakos et al. (2021)',url:'https://doi.org/10.7554/eLife.65859'}]},
  {title:'Open Ephys · flexDrive (legacy)',description:'Discontinued mouse microwire drive, replaced by ShuttleDrive. Retained as a reference for existing implants.',links:[{label:'Design and publication',url:'https://open-ephys.org/flexdrive'}]},
  {title:'Open Ephys · Twister3 electrode preparation',description:'Tool and documentation for making twisted-wire electrodes. This is preparation equipment, not an implanted headpost or chamber.',links:[{label:'Electrode preparation and manuscript',url:'https://open-ephys.org/twister3'},{label:'Design files',url:'https://github.com/jonnew/twister3'}]},
 ],
}
/** Reference browsing never substitutes unverified dimensions or modifies the project. */
export function designReferencePanel(category:DesignCategory):HTMLElement {
 return h('details',{class:'design-references'},[
  h('summary',{},['Design references and further information']),
  note('These links describe published designs. Linked CAD files are not bundled or applied automatically. Electrode presets retain their own manufacturer sources.'),
  ...designReferences[category].map(item=>h('section',{class:'control-section'},[
   h('h4',{},[item.title]),note(item.description),...item.links.map(link=>h('p',{},[h('a',{href:link.url,target:'_blank',rel:'noopener noreferrer'},[link.label])])),
  ])),
 ])
}
