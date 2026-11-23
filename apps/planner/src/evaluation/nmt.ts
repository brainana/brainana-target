export type NmtKind='anatomy'|'pial'|'white'|'mask'|'brainmask'|'curv'|'sulc'
export function nmtEntryKind(path:string):NmtKind|null{
 const name=path.split('/').at(-1)!
 if(/^tpl-NMT2Sym_res-05_brainmask\.nii(?:\.gz)?$/i.test(name))return 'brainmask'
 if(/^[lr]h\.curv$/i.test(name))return 'curv'
 if(/^[lr]h\.sulc$/i.test(name))return 'sulc'
 if(/^tpl-NMT2Sym_res-05_T1w\.nii(?:\.gz)?$/i.test(name))return 'anatomy'
 if(/^[lr]h\.pial\.surf\.gii$/i.test(name))return 'pial'
 if(/^[lr]h\.white\.surf\.gii$/i.test(name))return 'white'
 if(/^sub-.*_space-NMT2Sym_.*(?:probe|track|electrode).*_mask\.nii(?:\.gz)?$/i.test(name))return 'mask'
 return null
}
export interface NmtFile {name:string;kind:NmtKind;bytes:Uint8Array}
export function readNmtEntries(entries:Record<string,Uint8Array>):NmtFile[]{
 const out=Object.entries(entries).flatMap(([path,bytes])=>{const kind=nmtEntryKind(path);return kind?[{name:path.split('/').at(-1)!,kind,bytes}]:[]})
 if(out.filter(f=>f.kind==='anatomy').length!==1)throw new Error('The archive must contain exactly one NMT2Sym reference MRI.')
 return out
}
