import type { Vec3 } from '@brainana/planning-core/model.ts';
import { smoothSurface, type SurfaceSmoothing } from './smoothSurface.ts';
/** Outer radial envelope of a selected bone component. Rays enter from outside;
 * no inner shell, crop caps, or invented faces across missing bone are returned.
 * The intracranial center makes the star-shaped approximation explicit/reproducible.
 */
export function outerSkull(mask: Uint8Array, dims: number[], lo: Vec3, hi: Vec3, step: number, center: Vec3, progress?: (message: string) => void, smoothing?: SurfaceSmoothing) {
    const [nx, ny, nz] = dims;
    if (center.some((v, k) => !Number.isFinite(v) || v <= lo[k] || v >= hi[k]))
        throw new Error("Place the surface reference point inside the brain, within the cropped image. Click there in a CT slice, then choose Set inner reference from crosshair.");
    const cell = (p: number[]) => p.map((v, k) => Math.floor((v - lo[k]) / step));
    const at = (p: number[]) => { const [x, y, z] = cell(p); return x >= 0 && y >= 0 && z >= 0 && x < nx && y < ny && z < nz ? mask[x + y * nx + z * nx * ny] : 0; };
    if (at(center))
        throw new Error("The surface reference point is on skull bone. Move it inside the brain, away from the skull.");
    let radius = 0;
    for (let z = 0; z < nz; z++)
        for (let y = 0; y < ny; y++)
            for (let x = 0; x < nx; x++)
                if (mask[x + y * nx + z * nx * ny])
                    radius = Math.max(radius, Math.hypot(lo[0] + (x + .5) * step - center[0], lo[1] + (y + .5) * step - center[1], lo[2] + (z + .5) * step - center[2]));
    const rings = Math.max(12, Math.ceil(Math.PI * radius / step)), segments = 2 * rings, count = 2 + (rings - 1) * segments;
    if (!Number.isSafeInteger(count)) throw new Error('The selected spacing does not define a valid outer-surface sampling grid.');
    const points: number[] = [], radiuses: number[] = [], valid: number[] = [], triangles: number[] = [];
    let missingRays = 0, croppedRays = 0, discontinuousFaces = 0;
    const ray = (d: number[]) => {
        let end = Infinity;
        for (let k = 0; k < 3; k++)
            if (Math.abs(d[k]) > 1e-12)
                end = Math.min(end, ((d[k] > 0 ? hi[k] : lo[k]) - center[k]) / d[k]);
        let found = NaN;
        for (let r = end - step * .01; r > 0; r -= step * .5) {
            const p = d.map((v, k) => center[k] + v * r);
            if (!at(p))
                continue;
            const c = cell(p);
            if (c.some((v, k) => v === 0 || v === dims[k] - 1)) {
                croppedRays++;
                break;
            }
            // Locate the selected mask's outer edge more accurately than the ray step.
            let a = r, b = Math.min(end, r + step * .5);
            for (let i = 0; i < 8; i++) {
                const m = (a + b) / 2;
                if (at(d.map((v, k) => center[k] + v * m)))
                    a = m;
                else
                    b = m;
            }
            found = (a + b) / 2;
            break;
        }
        if (!Number.isFinite(found))
            missingRays++;
        radiuses.push(found);
        valid.push(Number.isFinite(found) ? 1 : 0);
        points.push(...d.map((v, k) => center[k] + v * (Number.isFinite(found) ? found : 0)));
    };
    ray([0, 0, 1]);
    for (let r = 1; r < rings; r++) {
        if (r % 8 === 0) progress?.(`Projecting outer CT skull · ${Math.round(100*r/rings)}%…`);
        const theta = Math.PI * r / rings;
        for (let s = 0; s < segments; s++) {
            const phi = 2 * Math.PI * s / segments;
            ray([Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(phi), Math.cos(theta)]);
        }
    }
    ray([0, 0, -1]);
    const face = (a: number, b: number, c: number) => {
        if (!valid[a] || !valid[b] || !valid[c])
            return;
        const rs = [radiuses[a], radiuses[b], radiuses[c]];
        if (Math.max(...rs) - Math.min(...rs) > Math.max(4 * step, Math.min(...rs) * .1)) {
            discontinuousFaces++;
            return;
        }
        triangles.push(a, b, c);
    };
    const row = (r: number, s: number) => 1 + (r - 1) * segments + (s % segments);
    for (let s = 0; s < segments; s++)
        face(0, row(1, s), row(1, s + 1));
    for (let r = 1; r < rings - 1; r++)
        for (let s = 0; s < segments; s++) {
            face(row(r, s), row(r + 1, s), row(r + 1, s + 1));
            face(row(r, s), row(r + 1, s + 1), row(r, s + 1));
        }
    for (let s = 0; s < segments; s++)
        face(count - 1, row(rings - 1, s + 1), row(rings - 1, s));
    if (triangles.length < 36)
        throw new Error("Too little skull surface was found. Check the bone threshold, the selected skull area and the crop. The surface reference point should be inside the brain.");
    // Remove unused vertices: unsupported rays must never become placement samples.
    const remap = new Int32Array(count).fill(-1), pts: number[] = [], tris = new Uint32Array(triangles.length);
    for (let t = 0; t < triangles.length; t++) {
        const old = triangles[t];
        if (remap[old] < 0) {
            remap[old] = pts.length / 3;
            pts.push(points[old * 3], points[old * 3 + 1], points[old * 3 + 2]);
        }
        tris[t] = remap[old];
    }
    const mesh = smoothSurface({ pts: new Float32Array(pts), tris }, lo, hi, step, progress, smoothing);
    return { ...mesh, outerReport: { center: [...center] as Vec3, rays: count, missingRays, croppedRays, discontinuousFaces, coverage: triangles.length / 3 / (2 * segments * (rings - 1)) } };
}
