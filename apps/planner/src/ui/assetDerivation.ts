import type {Asset} from '@brainana/planning-core/model.ts'
import {h} from '@brainana/ui/dom.ts'
import {note} from './controls.ts'
/** Keep derived image provenance with the asset, including after portable save/reopen. */
export function assetDerivation(asset:Asset):HTMLElement[] {
 const d=asset.derivation;if(!d)return []
 return [h('aside',{class:'asset-derivation'},[note(d.description),...d.references.map(reference=>h('a',{href:reference.url,target:'_blank',rel:'noopener noreferrer'},[reference.label]))])]
}
