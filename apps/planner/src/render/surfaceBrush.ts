import type { SurfaceBrushStroke, Vec3 } from '@brainana/planning-core/model.ts';
/** Replay physical slice strokes on the segmentation only; CT values are never edited.
 * Restore replays the original threshold mask, not synthetic bone or the last component selection.
 */
export function applySurfaceBrush(mask: Uint8Array, dims: number[], lo: Vec3, hi: Vec3, step: number, strokes: SurfaceBrushStroke[]) {
    const original = mask.slice(), [nx, ny] = dims;
    for (const stroke of strokes) {
        const n = stroke.normal, axes = [0, 1, 2].filter(k => k !== n), r = stroke.radius;
        for (let j = 0; j < stroke.points.length; j++) {
            const a = stroke.points[Math.max(0, j - 1)], b = stroke.points[j];
            const min = a.map((v, k) => Math.max(0, Math.floor((Math.min(v, b[k]) - (k === n ? stroke.thicknessMm / 2 : r) - lo[k]) / step)));
            const max = a.map((v, k) => Math.min(dims[k] - 1, Math.floor((Math.max(v, b[k]) + (k === n ? stroke.thicknessMm / 2 : r) - lo[k]) / step)));
            const [u, v] = axes, du = b[u] - a[u], dv = b[v] - a[v], length = du * du + dv * dv;
            for (let z = min[2]; z <= max[2]; z++)
                for (let y = min[1]; y <= max[1]; y++)
                    for (let x = min[0]; x <= max[0]; x++) {
                        const p = [x, y, z].map((q, k) => lo[k] + q * step + Math.min(step, hi[k] - lo[k] - q * step) / 2);
                        const t = length ? Math.max(0, Math.min(1, ((p[u] - a[u]) * du + (p[v] - a[v]) * dv) / length)) : 0;
                        const delta = p[n] - (a[n] + t * (b[n] - a[n]));
                        if (delta < -stroke.thicknessMm / 2 - 1e-6 || delta >= stroke.thicknessMm / 2 - 1e-6)
                            continue;
                        if (Math.hypot(p[u] - a[u] - t * du, p[v] - a[v] - t * dv) > r)
                            continue;
                        const i = x + y * nx + z * nx * ny;
                        mask[i] = stroke.mode === 'erase' ? 0 : original[i];
                    }
        }
    }
}
