import { openingColor } from './openingAppearance.ts';
import { classifiedSurfaceContours } from '../render/surfaceContours.ts';
import { boundaryLabel, boundaryColors, type BoundaryVoxels } from '../render/boundaryVoxels.ts';
import { h } from '@brainana/ui/dom.ts';
import type { Vec3, SurfaceBrushStroke, SurfaceOpening } from '@brainana/planning-core/model.ts';
import type { VolumeSampler } from '../render/volume.ts';
import type { MeshGeometry } from '../render/primitives.ts';
import { ctDefaults } from '../render/ctDefaults.ts';
export interface ReviewBrushTools {
    state: () => {
        mode: 'navigate' | 'erase' | 'restore';
        threshold?: number;
        diameter: number;
        thicknessMm: number;
        strokes: SurfaceBrushStroke[];
        openings: SurfaceOpening[];
        key: string;
        selectedOpening?: string|null;
    };
    onSelectOpening?: (id:string) => void;
    onStroke: (stroke: SurfaceBrushStroke) => void;
}
/** Map a letterboxed square canvas image to world coordinates, independent of pane size. */
export function reviewPointer(rect: {
    left: number;
    top: number;
    width: number;
    height: number;
}, x: number, y: number, bounds: [
    Vec3,
    Vec3
], selected: Vec3, normal: number, right: number, up: number): Vec3 | null {
    const side = Math.min(rect.width, rect.height), left = rect.left + (rect.width - side) / 2, top = rect.top + (rect.height - side) / 2;
    if (!side || x < left || x > left + side || y < top || y > top + side)
        return null;
    const span = Math.max(bounds[1][right] - bounds[0][right], bounds[1][up] - bounds[0][up]), point = [...selected] as Vec3;
    point[normal] = selected[normal];
    point[right] = (bounds[0][right] + bounds[1][right]) / 2 + ((x - left) / side - .5) * span;
    point[up] = (bounds[0][up] + bounds[1][up]) / 2 + (.5 - (y - top) / side) * span;
    return point;
}
/** Original CT + exact draft contour + physical correction strokes and opening annotations. */
export function surfaceReview(volume: VolumeSampler, bounds: [
    Vec3,
    Vec3
], point: Vec3, onPick: (p: Vec3) => void, tools?: ReviewBrushTools, modality: 'CT' | 'MRI' = 'CT') {
    let mesh: MeshGeometry | null = null, selected = [...point] as Vec3, revision = 0;
    let voxels: BoundaryVoxels | undefined, reconstructedFaces: Uint8Array | undefined;
    let display = { fillVoxels: false, highlightReconstruction: true, opacity: .55 };
    type Panel = {
        canvas: HTMLCanvasElement;
        slider: HTMLInputElement;
        normal: 0 | 1 | 2;
        right: number;
        up: number;
        image?: ImageData;
        intensities?: Float32Array;
        threshold?: number;
        slice?: number;
        contours: number[];
        reconstructed: number[];
        filledImage?: ImageData;
        revision: number;
        hover: Vec3 | null;
    };
    const panels: Panel[] = [], root = h('div', { class: 'surface-ct-review' }), window = ctDefaults(volume.image);
    let dragging: {
        id: number;
        panel: Panel;
        stroke: SurfaceBrushStroke;
    } | null = null;
    const draw = (only?: Panel) => {
        for (const panel of only ? [only] : panels) {
            const { canvas, slider, normal, right, up } = panel, context = canvas.getContext?.('2d');
            slider.value = String(selected[normal]);
            if (!context)
                continue;
            const size = canvas.width, span = Math.max(bounds[1][right] - bounds[0][right], bounds[1][up] - bounds[0][up]), mid = bounds[0].map((v, k) => (v + bounds[1][k]) / 2);
            const screen = (p: number[]) => [(p[right] - mid[right]) / span * size + size / 2, size / 2 - (p[up] - mid[up]) / span * size];
            if (!panel.image || panel.slice !== selected[normal]) {
                const pixels = context.createImageData(size, size);
                panel.intensities = new Float32Array(size * size);
                for (let y = 0; y < size; y++)
                    for (let x = 0; x < size; x++) {
                        const p = [...selected] as Vec3;
                        p[right] = mid[right] + (x / size - .5) * span;
                        p[up] = mid[up] + (.5 - y / size) * span;
                        const value = volume.sample(p), v = Number.isFinite(value) ? Math.round(Math.max(0, Math.min(1, (value - window.lo) / (window.hi - window.lo))) * 255) : 0, i = (x + y * size) * 4;
                        panel.intensities[x + y * size] = value;
                        pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = v;
                        pixels.data[i + 3] = 255;
                    }
                panel.image = pixels;
                panel.slice = selected[normal];
                panel.revision = -1;
            }
            const threshold = tools?.state().threshold;
            if (panel.revision !== revision || panel.threshold !== threshold) {
                const sections = mesh ? classifiedSurfaceContours(mesh, normal, selected[normal], display.highlightReconstruction ? reconstructedFaces : undefined) : { detected: [], reconstructed: [] };
                panel.contours = sections.detected; panel.reconstructed = sections.reconstructed;
                panel.filledImage = undefined;
                if (threshold !== undefined && panel.intensities) {
                    const filled = context.createImageData(size, size);
                    filled.data.set(panel.image.data);
                    for (let i = 0; i < panel.intensities.length; i++) {
                        if (!Number.isFinite(panel.intensities[i]) || panel.intensities[i] < threshold) continue;
                        for (let k = 0; k < 3; k++)
                            filled.data[4 * i + k] = Math.round(filled.data[4 * i + k] * .65 + [255, 211, 70][k] * .35);
                    }
                    panel.filledImage = filled;
                }
                panel.threshold = threshold;
                if (display.fillVoxels && voxels) {
                    const filled = context.createImageData(size, size), point = [...selected] as Vec3;
                    filled.data.set(panel.image.data);
                    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
                        point[right] = mid[right] + (x / size - .5) * span;
                        point[up] = mid[up] + (.5 - y / size) * span;
                        const label = boundaryLabel(voxels, point);
                        if (!label) continue;
                        const color = display.highlightReconstruction && label === 2 ? boundaryColors.reconstructed : boundaryColors.detected, index = (x + y * size) * 4;
                        for (let k = 0; k < 3; k++) filled.data[index + k] = Math.round(filled.data[index + k] * (1 - display.opacity) + color[k] * display.opacity);
                    }
                    panel.filledImage = filled;
                }
                panel.revision = revision;
            }
            context.putImageData(panel.filledImage ?? panel.image, 0, 0);
            context.globalAlpha = 1;
            context.lineWidth = 1.5;
            for (const [segments, color] of [[panel.contours, '#3fe8d5'], [panel.reconstructed, '#ffb749']] as const) {
                context.strokeStyle = color;
                context.beginPath();
                for (let i = 0; i < segments.length; i += 6) {
                    const a = screen(segments.slice(i, i + 3)), b = screen(segments.slice(i + 3, i + 6));
                    context.moveTo(a[0], a[1]); context.lineTo(b[0], b[1]);
                }
                context.stroke();
            }
            const state = tools?.state();
            for (const stroke of [...(state?.strokes ?? []), ...(dragging?.panel === panel ? [dragging.stroke] : [])]) {
                if (stroke.normal !== normal || Math.abs(stroke.points[0][normal] - selected[normal]) > stroke.thicknessMm / 2)
                    continue;
                context.strokeStyle = stroke.mode === 'erase' ? '#f25565' : '#73da89';
                context.globalAlpha = .4;
                context.lineWidth = 2 * stroke.radius / span * size;
                context.lineCap = 'round';
                context.lineJoin = 'round';
                context.beginPath();
                stroke.points.forEach((p, i) => { const q = screen(p); if (!i)
                    context.moveTo(q[0] - .01, q[1]); context.lineTo(q[0], q[1]); });
                context.stroke();
            }
            context.globalAlpha = 1;
            context.lineWidth = 1.5;
            state?.openings.forEach((opening, index) => {
                const distance = Math.abs(opening.center[normal] - selected[normal]);
                if (distance > opening.radius)
                    return;
                const p = screen(opening.center), r = Math.sqrt(opening.radius ** 2 - distance ** 2) / span * size;
                context.strokeStyle = openingColor(opening,state.key,state.selectedOpening??null);
                context.lineWidth = opening.id===state.selectedOpening?3:1.5;
                context.fillStyle = context.strokeStyle;
                context.beginPath();
                context.arc?.(p[0], p[1], Math.max(2, r), 0, Math.PI * 2);
                context.stroke();
                context.fillText?.(String(index + 1), p[0] + r + 2, p[1]);
            });
            context.lineWidth=1.5;
            const cross = screen(selected);
            context.strokeStyle = '#ffb649';
            context.beginPath();
            context.moveTo(cross[0] - 5, cross[1]);
            context.lineTo(cross[0] + 5, cross[1]);
            context.moveTo(cross[0], cross[1] - 5);
            context.lineTo(cross[0], cross[1] + 5);
            context.stroke();
            if (panel.hover && state && state.mode !== 'navigate') {
                const p = screen(panel.hover);
                context.strokeStyle = '#ffffff';
                context.beginPath();
                context.arc?.(p[0], p[1], state.diameter / 2 / span * size, 0, 2 * Math.PI);
                context.stroke();
            }
        }
    };
    for (const [normal, right, up, title] of [[2, 0, 1, 'Axial · R/A'], [1, 0, 2, 'Coronal · R/S'], [0, 1, 2, 'Sagittal · A/S']] as const) {
        const canvas = h('canvas', { width: 256, height: 256, ariaLabel: `${modality} surface review ${title}` }), slider = h('input', { type: 'range', min: String(bounds[0][normal]), max: String(bounds[1][normal]), step: 'any', value: String(point[normal]), ariaLabel: `${title} slice` });
        const panel: Panel = { canvas, slider, normal, right, up, contours: [], reconstructed: [], revision: -1, hover: null };
        panels.push(panel);
        const pick = (e: MouseEvent) => reviewPointer(canvas.getBoundingClientRect(), e.clientX, e.clientY, bounds, selected, normal, right, up);
        slider.addEventListener('input', () => { if (dragging)
            return; selected[normal] = Number(slider.value); onPick([...selected]); draw(); });
        canvas.onclick = e => { if (tools?.state().mode && tools.state().mode !== 'navigate')
            return; const p = pick(e); if (p) {
            const state=tools?.state();
            const opening=state?.openings.filter(o=>Math.abs(o.center[normal]-p[normal])<=o.radius).map(o=>({o,d:Math.hypot(o.center[right]-p[right],o.center[up]-p[up])})).filter(({o,d})=>d<=Math.sqrt(Math.max(0,o.radius**2-(o.center[normal]-p[normal])**2))).sort((a,b)=>a.d-b.d)[0]?.o;
            selected = opening ? [...opening.center] : p;
            onPick([...selected]);
            if(opening)tools?.onSelectOpening?.(opening.id);
            draw();
        } };
        canvas.addEventListener('pointerdown', e => {
            const state = tools?.state(), p = pick(e);
            if (e.button !== 0 || dragging || !p || !state || state.mode === 'navigate')
                return;
            dragging = { id: e.pointerId, panel, stroke: { mode: state.mode, normal, thicknessMm: state.thicknessMm, radius: state.diameter / 2, points: [p] } };
            canvas.setPointerCapture(e.pointerId);
            e.preventDefault();
            draw(panel);
        });
        canvas.addEventListener('pointermove', e => {
            const p = pick(e);
            panel.hover = p;
            if (dragging?.id === e.pointerId && p) {
                const previous = dragging.stroke.points.at(-1)!;
                if (Math.hypot(...p.map((v, k) => v - previous[k])) > .1)
                    dragging.stroke.points.push(p);
            }
            if (tools?.state().mode !== 'navigate')
                draw(panel);
        });
        canvas.addEventListener('pointerup', e => {
            if (dragging?.id !== e.pointerId)
                return;
            const stroke = dragging.stroke;
            dragging = null;
            if (root.isConnected)
                tools?.onStroke(stroke);
            draw();
        });
        canvas.addEventListener('pointercancel', () => { dragging = null; draw(); });
        canvas.addEventListener('pointerleave', () => { panel.hover = null; if (!dragging)
            draw(panel); });
        root.append(h('div', {}, [h('span', {}, [title]), h('div', { class: 'surface-review-canvas-wrap' }, [canvas]), slider]));
    }
    const panes=Array.from(root.children),weights=[1,1,1]
    const layout=()=>{root.style.gridTemplateRows=weights.map(w=>`minmax(0,${w}fr)`).join(' 8px ')}
    root.replaceChildren()
    panes.forEach((pane,index)=>{
        root.append(pane)
        if(index===2)return
        const divider=h('div',{class:'surface-slice-divider',role:'separator',tabIndex:0,ariaLabel:`Resize ${modality} slices ${index+1} and ${index+2}`})
        divider.setAttribute('aria-orientation','horizontal');divider.title='Drag to resize slices. Arrow keys adjust; double-click resets.'
        let drag:{id:number;y:number;first:number;second:number}|null=null
        const adjust=(delta:number,first=weights[index],second=weights[index+1])=>{const total=first+second;weights[index]=Math.max(.2,Math.min(total-.2,first+delta));weights[index+1]=total-weights[index];layout()}
        divider.addEventListener('pointerdown',e=>{if(e.button!==0)return;drag={id:e.pointerId,y:e.clientY,first:weights[index],second:weights[index+1]};divider.setPointerCapture(e.pointerId);e.preventDefault()})
        divider.addEventListener('pointermove',e=>{if(drag?.id!==e.pointerId)return;const height=root.getBoundingClientRect().height-16;if(height>0)adjust(3*(e.clientY-drag.y)/height,drag.first,drag.second)})
        for(const type of ['pointerup','pointercancel','lostpointercapture'])divider.addEventListener(type,()=>{drag=null})
        divider.addEventListener('dblclick',()=>{weights.fill(1);layout()})
        divider.addEventListener('keydown',e=>{if(e.key!=='ArrowUp'&&e.key!=='ArrowDown')return;e.preventDefault();adjust(e.key==='ArrowDown'?.1:-.1)})
        root.append(divider)
    });layout()
    return { element: root, locate: (p: Vec3) => { selected = [...p]; draw(); }, refresh: () => draw(),
        setDisplay: (patch: Partial<typeof display>) => { display = { ...display, ...patch }; revision++; draw(); },
        update: (geometry: MeshGeometry | null, boundary?: BoundaryVoxels, reconstructed?: Uint8Array) => { mesh = geometry; voxels = boundary; reconstructedFaces = reconstructed; revision++; draw(); } };
}
