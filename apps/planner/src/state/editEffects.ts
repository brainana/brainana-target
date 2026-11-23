import type { Asset, Project } from '@brainana/planning-core/model.ts'
/** Rim fits depend on geometry/segmentation, not opacity, colormap or visibility. */
export function invalidateChangedSurfaceFits(project: Project, previousAssets: Asset[]): void {
  const signature = (a: Asset) => JSON.stringify([a.sha256, a.imageDisplay?.skull?.threshold, a.imageDisplay?.skull?.bounds, a.imageDisplay?.skull?.useForPlanning, a.imageDisplay?.skull?.spacingMm, a.imageDisplay?.skull?.components, a.imageDisplay?.skull?.representation, a.imageDisplay?.skull?.center, a.imageDisplay?.skull?.componentSeed, a.imageDisplay?.skull?.edits])
  const previous = new Map(previousAssets.map(a => [a.id, signature(a)]))
  for (const chamber of project.chambers) {
    if (chamber.baseFit && project.planningSurfaceIds && chamber.baseFit.assetIds.some(id => !project.planningSurfaceIds!.includes(id))) delete chamber.baseFit
    if (chamber.baseFit?.assetIds.some(id => {
      const asset = project.assets.find(a => a.id === id)
      return !asset || previous.get(id) !== signature(asset)
    })) delete chamber.baseFit
  }
}
