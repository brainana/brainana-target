import { add, cross, dot, normalize, scale } from './geometry.ts'
import type { Vec3 } from './model.ts';
import type { TriangleSurface } from './surface-fit.ts';
interface Node {
    lo: Vec3;
    hi: Vec3;
    left?: Node;
    right?: Node;
    faces?: number[];
}
/** Triangle BVH for repeated mounting-support rays. Geometry is immutable during a search. */
export class SurfaceRayIndex {
    private faces: Array<{
        mesh: TriangleSurface;
        t: number;
    }> = [];
    private root: Node;
    constructor(surfaces: TriangleSurface[]) {
        for (const mesh of surfaces)
            for (let t = 0; t < mesh.tris.length; t += 3)
                this.faces.push({ mesh, t });
        // Cache centroids once; partition the index buffer in place rather than sorting
        // every subtree and repeatedly looking up triangle vertices in comparators.
        const centers = new Float64Array(this.faces.length * 3)
        for (let id = 0; id < this.faces.length; id++) {
            const { mesh, t } = this.faces[id]
            for (let k = 0; k < 3; k++) centers[id * 3 + k] = (mesh.pts[mesh.tris[t] * 3 + k] + mesh.pts[mesh.tris[t + 1] * 3 + k] + mesh.pts[mesh.tris[t + 2] * 3 + k]) / 3
        }
        const ids = Uint32Array.from(this.faces, (_, i) => i)
        const partition = (start: number, end: number, middle: number, axis: number): void => {
            let left = start, right = end - 1
            while (left < right) {
                const pivot = centers[ids[(left + right) >>> 1] * 3 + axis]
                let i = left, j = right
                while (i <= j) {
                    while (centers[ids[i] * 3 + axis] < pivot) i++
                    while (centers[ids[j] * 3 + axis] > pivot) j--
                    if (i <= j) { const value = ids[i]; ids[i] = ids[j]; ids[j] = value; i++; j-- }
                }
                if (middle <= j) right = j
                else if (middle >= i) left = i
                else return
            }
        }
        const build = (start: number, end: number): Node => {
            const lo: Vec3 = [Infinity, Infinity, Infinity], hi: Vec3 = [-Infinity, -Infinity, -Infinity]
            for (let i = start; i < end; i++) {
                const { mesh, t } = this.faces[ids[i]]
                for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) {
                    const value = mesh.pts[mesh.tris[t + j] * 3 + k]
                    lo[k] = Math.min(lo[k], value); hi[k] = Math.max(hi[k], value)
                }
            }
            if (end - start <= 16) return { lo, hi, faces: Array.from(ids.subarray(start, end)) }
            const spans = hi.map((value, k) => value - lo[k]), axis = spans.indexOf(Math.max(...spans)), middle = (start + end) >>> 1
            partition(start, end, middle, axis)
            return { lo, hi, left: build(start, middle), right: build(middle, end) }
        }
        this.root = build(0, ids.length)
    }

    intersection(origin: Vec3, direction: Vec3, limit = Infinity): { point: Vec3; normal: Vec3 } | null {
        const normal: Vec3 = [0, 0, 0]
        const distance = this.distance(origin, direction, limit, true, normal)
        return Number.isFinite(distance) ? { point: add(origin, scale(direction, distance)), normal } : null
    }

    distance(origin: Vec3, direction: Vec3, limit = Infinity, mounting = false, normal?: Vec3): number {
        let nearest = limit, found = false;
        const visit = (node: Node) => {
            let a = 0, b = nearest;
            for (let k = 0; k < 3; k++) {
                if (Math.abs(direction[k]) < 1e-12) {
                    if (origin[k] < node.lo[k] - 1e-8 || origin[k] > node.hi[k] + 1e-8)
                        return;
                    continue;
                }
                const x = (node.lo[k] - origin[k]) / direction[k], y = (node.hi[k] - origin[k]) / direction[k];
                a = Math.max(a, Math.min(x, y));
                b = Math.min(b, Math.max(x, y));
                if (a > b + 1e-8)
                    return;
            }
            if (node.left)
                visit(node.left);
            if (node.right)
                visit(node.right);
            for (const id of node.faces ?? []) {
                const { mesh, t } = this.faces[id], p = mesh.pts, ia = mesh.tris[t] * 3, ib = mesh.tris[t + 1] * 3, ic = mesh.tris[t + 2] * 3;
                const ux = p[ib] - p[ia], uy = p[ib + 1] - p[ia + 1], uz = p[ib + 2] - p[ia + 2], vx = p[ic] - p[ia], vy = p[ic + 1] - p[ia + 1], vz = p[ic + 2] - p[ia + 2];
                const px = direction[1] * vz - direction[2] * vy, py = direction[2] * vx - direction[0] * vz, pz = direction[0] * vy - direction[1] * vx, det = ux * px + uy * py + uz * pz;
                if (Math.abs(det) < 1e-10 || mounting && mesh.outerEnvelope && det < 0)
                    continue;
                const tx = origin[0] - p[ia], ty = origin[1] - p[ia + 1], tz = origin[2] - p[ia + 2], u = (tx * px + ty * py + tz * pz) / det;
                if (u < -1e-8 || u > 1 + 1e-8)
                    continue;
                const qx = ty * uz - tz * uy, qy = tz * ux - tx * uz, qz = tx * uy - ty * ux, v = (direction[0] * qx + direction[1] * qy + direction[2] * qz) / det;
                if (v < -1e-8 || u + v > 1 + 1e-8)
                    continue;
                const distance = (vx * qx + vy * qy + vz * qz) / det;
                if (distance >= 0 && distance <= nearest) {
                    nearest = distance;
                    found = true;
                    if (normal) {
                        const face = normalize(cross([ux, uy, uz], [vx, vy, vz]))
                        const sign = dot(face, direction) > 0 ? -1 : 1
                        for (let k = 0; k < 3; k++) normal[k] = sign * face[k]
                    }
                }
            }
        };
        visit(this.root);
        return found ? nearest : Infinity;
    }
    /** Exact furthest vertex projection; bounding boxes skip branches that cannot improve it. */
    maximumProjection(origin:Vec3,direction:Vec3):number {
        let best=-Infinity;
        const upper=(node:Node)=>node.lo.reduce((sum,v,k)=>sum+((direction[k]>=0?node.hi[k]:v)-origin[k])*direction[k],0);
        const visit=(node:Node)=>{
            if(upper(node)<=best)return;
            if(node.faces)for(const id of node.faces){const {mesh,t}=this.faces[id];for(let j=0;j<3;j++){const k=mesh.tris[t+j]*3;best=Math.max(best,(mesh.pts[k]-origin[0])*direction[0]+(mesh.pts[k+1]-origin[1])*direction[1]+(mesh.pts[k+2]-origin[2])*direction[2]);}}
            else for(const child of [node.left!,node.right!].sort((a,b)=>upper(b)-upper(a)))visit(child);
        };
        visit(this.root);return best;
    }

}
