import { measureBoundary, apertureInRange, type Aperture } from './openingGeometry.ts'
import type { Vec3 } from '@brainana/planning-core/model.ts';
import type { MeshGeometry } from './primitives.ts';
export type OpeningCandidate = Aperture
/** Closed, manifold boundary loops are candidate openings, not diagnoses of screw holes.
 * Large/base openings, crop borders, branches and elongated slits are excluded.
 */
export function detectOpenings(mesh: MeshGeometry, bounds: [
    Vec3,
    Vec3
], spacing: number, minDiameter = .5, maxDiameter = 10, upperHalfOnly = false): OpeningCandidate[] {
    if (!(minDiameter > 0 && maxDiameter >= minDiameter))
        throw new Error('Minimum opening diameter must be positive and no larger than the maximum.');
    const edges = new Map<number, {
        a: number;
        b: number;
        count: number;
    }>(), vertices = mesh.pts.length / 3;
    for (let t = 0; t < mesh.tris.length; t += 3)
        for (let j = 0; j < 3; j++) {
            const a = mesh.tris[t + j], b = mesh.tris[t + (j + 1) % 3], key = Math.min(a, b) * vertices + Math.max(a, b), edge = edges.get(key);
            if (edge)
                edge.count++;
            else
                edges.set(key, { a, b, count: 1 });
        }
    const neighbors = new Map<number, number[]>();
    for (const { a, b, count } of edges.values())
        if (count === 1) {
            neighbors.set(a, [...(neighbors.get(a) ?? []), b]);
            neighbors.set(b, [...(neighbors.get(b) ?? []), a]);
        }
    const visited = new Set<number>(), result: OpeningCandidate[] = [];
    for (const seed of neighbors.keys()) {
        if (visited.has(seed))
            continue;
        const component: number[] = [], stack = [seed];
        let manifold = true;
        while (stack.length) {
            const v = stack.pop()!;
            if (visited.has(v))
                continue;
            visited.add(v);
            component.push(v);
            const ns = neighbors.get(v)!;
            if (ns.length !== 2)
                manifold = false;
            for (const n of ns)
                if (!visited.has(n))
                    stack.push(n);
        }
        if (!manifold || component.length < 6)
            continue;
        const loop = [seed];
        let previous = -1, current = seed;
        do {
            const next = neighbors.get(current)!.find(v => v !== previous)!;
            previous = current;
            current = next;
            if (current !== seed)
                loop.push(current);
        } while (current !== seed && loop.length <= component.length);
        if (current !== seed || loop.length !== component.length)
            continue;
        const ps = loop.map(i => Array.from(mesh.pts.slice(i * 3, i * 3 + 3)) as Vec3);
        if (ps.some(p => p.some((v, k) => v - bounds[0][k] < spacing * 2 || bounds[1][k] - v < spacing * 2)))
            continue;
        const candidate=measureBoundary(ps);
        if(!candidate||candidate.circularity<.25||!apertureInRange(candidate,minDiameter,maxDiameter))continue;
        const {center,radius,normal}=candidate;
        const len = Math.hypot(...normal), deviation = Math.max(...ps.map(p => Math.abs(p.reduce((s, v, k) => s + (v - center[k]) * normal[k] / len, 0))));
        if (deviation > radius * .6)
            continue;
        result.push(candidate);
    }
    // Use the extracted skull extent in physical superior/inferior coordinates, never the scan FOV.
    let low=Infinity,high=-Infinity;
    for(let i=2;i<mesh.pts.length;i+=3){low=Math.min(low,mesh.pts[i]);high=Math.max(high,mesh.pts[i]);}
    return result.filter(c=>!upperHalfOnly||c.center[2]>=(low+high)/2).sort((a, b) => a.center[2] - b.center[2] || a.center[0] - b.center[0]);
}
