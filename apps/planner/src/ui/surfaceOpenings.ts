import {beginActivity} from './activity.ts'
import { openingConstraint } from '@brainana/planning-core/surface-openings.ts';
import { avoidanceChoices } from './avoidanceChoices.ts';
import { h } from '@brainana/ui/dom.ts';
import { newId, type SurfaceOpening, type Vec3 } from '@brainana/planning-core/model.ts';
import { apertureInRange, type OpeningMeasurement } from '../render/openingGeometry.ts';
import { detectOpenings, type OpeningCandidate } from '../render/detectOpenings.ts';
import type { MeshGeometry } from '../render/primitives.ts';
import { button, note, numberField, section, readout, selectField } from './controls.ts';
export function surfaceOpeningTools(options: {
    assetId: string;
    sha256: string;
    frameId: string;
    bounds: () => [
        Vec3,
        Vec3
    ];
    spacing: () => number;
    key: () => string | null;
    geometry: () => MeshGeometry | null;
    items: () => SurfaceOpening[];
    setItems: (items: SurfaceOpening[]) => void;
    onSelection?: (id:string|null)=>void;
    measure?: (candidate:OpeningCandidate) => (OpeningCandidate & {measurement:OpeningMeasurement}) | null;
    crosshair: () => Vec3;
    locate: (point: Vec3) => void;
}) {
    let min = 2, max = 10, manualDiameter = 2, upperHalfOnly = false, selectedId: string | null = null, publishedSelection:string|null=null;
    const list = h('div', { class: 'surface-opening-list' }), status = note("Detection looks for small, roughly round skull openings. Some may be natural openings or gaps caused by the image settings rather than screw holes. Check each result before using it as an area to avoid."), history: SurfaceOpening[][] = [];
    const changed = (items: SurfaceOpening[]) => { history.push(structuredClone(options.items())); if (history.length > 30)
        history.shift(); options.setItems(items); render(); };
    const change = (id: string, fn: (item: SurfaceOpening) => void) => { const items = structuredClone(options.items()); const item = items.find(o => o.id === id); if (item)
        fn(item); changed(items); };
    const select = (id:string) => {
        selectedId=id; render();
        const row=Array.from(list.children).find(el=>el.getAttribute('data-opening-id')===id) as HTMLElement|undefined;
        row?.scrollIntoView({block:'nearest',behavior:'smooth'});row?.focus({preventScroll:true});
    };
    const render = () => {
        const key = options.key();
        if(selectedId&&!options.items().some(o=>o.id===selectedId))selectedId=null;
        detect.disabled = !key || !options.geometry();
        add.disabled = !key;
        undo.disabled = !history.length;
        if(publishedSelection!==selectedId){publishedSelection=selectedId;options.onSelection?.(selectedId)}
        list.replaceChildren(...options.items().map((item, index) => {
            const current = !!key && item.surfaceKey === key;
            const avoid=selectField(`Avoid opening ${index+1}`,openingConstraint(item),avoidanceChoices,value=>change(item.id,o=>{o.constraint=value as SurfaceOpening['constraint'];o.avoid=value!=='ignore';o.reviewed=true}));
            const input=avoid.querySelector('select')!;input.disabled=!current;input.setAttribute('aria-label',`Avoid opening ${index+1}`);
            const reReview = button('Re-review on current surface', () => { if (options.key())
                change(item.id, o => { o.surfaceKey = options.key()!; o.reviewed = true; o.avoid = false; o.constraint='ignore'; delete o.measurement; }); });
            reReview.disabled = !key;
            const row=h('div', { class: `surface-opening-row${item.id===selectedId?' selected-opening':''}`, tabIndex: -1 }, [
                h('strong', {}, [`${index + 1}. ${item.name}`]),
                note(!current ? 'Surface changed · inactive until re-reviewed' : item.reviewed ? (openingConstraint(item)==='hard'?'Reviewed · hard constraint':openingConstraint(item)==='soft'?'Reviewed · soft preference':'Reviewed · ignored for placement') : 'Candidate · not used for placement'),
                ...(item.measurement?[readout('Estimated opening diameter',`${item.measurement.diameter.toFixed(2)} mm · ${item.measurement.source.toUpperCase()}`),readout('Minimum / maximum width',`${item.measurement.minimumWidth.toFixed(2)} / ${item.measurement.maximumWidth.toFixed(2)} mm`),note(`CT voxel (3D pixel) size: ${item.measurement.resolutionMm.toFixed(2)} mm. Using smaller measurement steps cannot add detail that is missing from the original CT.`)]:[note("This older or manually added marker shows an area to avoid, not a measured hole size. Run Detect candidates to measure openings in the current CT.")]),
                note(item.patch?'Display: opening shape measured from CT.': 'Display: a circle approximates this opening. Detect again to show its measured shape.'),
                numberField(`Opening ${index + 1} exclusion diameter (mm)`, item.radius * 2, value => change(item.id, o => { o.radius = value / 2; }), { min: .1, max: 100, step: .1 }),
                avoid,
                h('div', { class: 'button-row' }, [
                    button('Locate', () => {options.locate([...item.center]);select(item.id)}),
                    ...(!current ? [reReview] : []),
                    button('Remove marker', () => changed(options.items().filter(o => o.id !== item.id))),
                ]),
            ]);
            row.setAttribute('data-opening-id',item.id);return row;
        }));
    };
    const detect = button('Detect candidate openings', () => {
        void (async () => {
            const key = options.key(), mesh = options.geometry();
            if (!key || !mesh)
                return;
            selectedId=null;render();
            detect.disabled = true;
            status.textContent = 'Detecting small boundary loops…';
            const done=beginActivity('Detecting skull openings…');
            await new Promise<void>(resolve => typeof requestAnimationFrame==='function'?requestAnimationFrame(()=>setTimeout(resolve,0)):setTimeout(resolve,0));
            try {
                if(min>max)throw new Error('Minimum opening diameter must not exceed the maximum.');
                const boundaries = detectOpenings(mesh, options.bounds(), options.spacing(), .1, Math.min(100,max+4*options.spacing()), upperHalfOnly);
                const measured = boundaries.map(c=>options.measure?options.measure(c):({...c,measurement:{diameter:c.diameter,minimumWidth:c.minimumWidth,maximumWidth:c.maximumWidth,resolutionMm:options.spacing(),source:'mesh' as const}}));
                const found=measured.filter((c):c is NonNullable<typeof c>=>!!c&&c.radius>=.05&&c.radius<=50&&apertureInRange(c,min,max));
                if (!root.isConnected || options.key() !== key)
                    return;
                const items = structuredClone(options.items().filter(o=>o.origin!=='detected'));
                const replaced=options.items().length-items.length,retained=items.length;
                let added = 0;
                for (const candidate of found) {
                    if (items.length >= 2000)
                        break;
                    if (items.some(o => Math.hypot(...o.center.map((v, k) => v - candidate.center[k])) < Math.max(o.radius, candidate.radius)))
                        continue;
                    items.push({ id: newId(), name: `Candidate skull opening ${items.length + 1}`, frameId: options.frameId, assetId: options.assetId, assetSha256: options.sha256, surfaceKey: key, center: candidate.center, radius: candidate.radius, origin: 'detected', reviewed: false, avoid: false, measurement:candidate.measurement,normal:candidate.normal,...('patch' in candidate?{patch:candidate.patch as SurfaceOpening['patch']}:{}) });
                    added++;
                }
                changed(items);
                status.textContent = `${boundaries.length} mesh boundaries checked; ${found.length} meet measurement and size checks; ${added} new markers added; ${replaced} previous automatic markers replaced; ${retained} manual markers retained. ${options.measure?'CT confirmation rejects mesh-only gaps. ':''}Minimum diameter also requires the minimum width to meet that value. Manual markers are always retained. Undo opening edit restores the previous list.`;
            }
            catch (error) {
                status.textContent = String(error);
            }
            finally {
                done();
                render();
            }
        })();
    });
    const addAt = (point:Vec3, candidate?:{center:Vec3;radius:number;measurement?:OpeningMeasurement;normal?:Vec3;patch?:SurfaceOpening['patch']}) => {
        const key = options.key(), mesh = options.geometry();
        if (!key || !mesh)
            return;
        if (options.items().length >= 2000) {
            status.textContent = 'Opening marker limit reached. Remove unused markers before adding more.';
            return;
        }
        point = candidate?.center ?? point;
        if (options.items().some(o => Math.hypot(...o.center.map((v, k) => v - point[k])) < o.radius * .5)) {
            select(options.items().find(o => Math.hypot(...o.center.map((v,k)=>v-point[k])) < o.radius*.5)!.id);
            status.textContent = 'Selected the opening marker already at this location.';
            return;
        }
        ;
        let distance = Infinity;
        for (let i = 0; i < mesh.pts.length; i += 3)
            distance = Math.min(distance, Math.hypot(...point.map((v, k) => v - mesh.pts[i + k])));
        if (distance > (candidate?.radius ?? manualDiameter / 2) + 3 * options.spacing()) {
            status.textContent = 'Move the crosshair onto the surface opening in a CT slice before adding a marker.';
            return;
        }
        const id=newId();
        changed([...options.items(), { id, name: `Manual skull opening ${options.items().length + 1}`, frameId: options.frameId, assetId: options.assetId, assetSha256: options.sha256, surfaceKey: key, center: [...point], radius: candidate?.radius ?? manualDiameter / 2, origin: 'manual', reviewed: true, avoid: false, ...(candidate?.measurement?{measurement:candidate.measurement,normal:candidate.normal,...('patch' in candidate?{patch:candidate.patch as SurfaceOpening['patch']}:{})}:{}) }]);
        select(id);options.locate([...point]);
    };
    const add = button('Add missed opening at crosshair',()=>addAt(options.crosshair()));
    const filter=h('input',{type:'checkbox',ariaLabel:'Ignore lower half of skull during detection'});
    filter.addEventListener('change',()=>{upperHalfOnly=filter.checked});
    const undo = button('Undo opening edit', () => { const previous = history.pop(); if (previous) {
        options.setItems(previous);
        render();
    } });
    const root = section('Skull openings · optional', [
        note("Marking an opening does not fill it with bone. Choose Hard to always avoid it, Soft to avoid it when possible, or Ignore to leave it out of placement calculations. Review each marker and choose Finalize surface to save it. You can also change these priorities in Position. Markers must match the current finalized surface to be used."),
        h('label',{},[filter,' Ignore lower half of skull during detection']),
        note("Estimated diameter describes a circle with the same area as the opening. The opening must also be at least the minimum width you choose. The area to avoid can be larger so it covers the whole opening. Detection checks the original CT at the current bone threshold; a gap made with the brush is not automatically counted as a real hole."),
        note("Only look for openings in the upper half of the skull model. The halfway point is based on the skull, not the full scan. This filter affects the next detection run; it does not remove markers already shown."),
        note("Click a marker in 3D or in a CT slice to select it and show its details. Right-click, or two-finger click, in 3D to add a missed opening. The app tries to trace the nearby hole; if it cannot, it uses your manual diameter. Check the result before using it for avoidance."),
        numberField('Minimum candidate diameter (mm)', min, v => { min = v; }, { min: .1, max: 100, step: .1 }), numberField('Maximum candidate diameter (mm)', max, v => { max = v; }, { min: .1, max: 100, step: .1 }),
        note("Detect replaces earlier automatically detected markers, including ones you already reviewed. Manually added markers stay. Use Undo to restore the previous list. Choose Finalize surface to save the new list."),detect,
        numberField('Manual opening diameter (mm)', manualDiameter, v => { manualDiameter = v; }, { min: .1, max: 100, step: .1 }), add, undo, status, list,
    ]);
    render();
    return { element: root, refresh: render, select, addAt, manualRadius:()=>manualDiameter/2, selected:()=>selectedId };
}
