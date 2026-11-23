import type { Asset } from './model.ts';
export type SkullSurfaceConfig = NonNullable<NonNullable<Asset['imageDisplay']>['skull']>;
/** Geometry identity shared by worker cache, opening review, and rim invalidation. */
export function skullSurfaceKey(s: SkullSurfaceConfig): string {
    const values: unknown[] = [s.threshold, s.bounds, s.spacingMm, s.components, s.representation, s.center, s.componentSeed];
    if (s.smoothing !== undefined) values.push(s.smoothing);
    if (s.edits?.length)
        values.push(s.edits);
    return JSON.stringify(values);
}
/** Compact deterministic geometry fingerprint for annotations (not a security digest). */
export function openingSurfaceKey(s: SkullSurfaceConfig): string {
    const json = skullSurfaceKey(s);
    let a = 2166136261, b = 2246822507;
    for (let i = 0; i < json.length; i++) {
        a = Math.imul(a ^ json.charCodeAt(i), 16777619);
        b = Math.imul(b ^ json.charCodeAt(i), 3266489909);
    }
    return `opening-v1:${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`;
}
