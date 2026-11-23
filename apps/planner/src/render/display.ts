import type { NVConfigOptions } from '@niivue/niivue'

export const anatomyViewerOptions = (): Partial<NVConfigOptions> => ({
  backColor: [0.055, 0.05, 0.04, 1],
  isColorbar: false,
  dragAndDropEnabled: false,
  isOrientCube: true,
  show3Dcrosshair: false,
  isSliceMM: true,
  meshThicknessOn2D: 1,
  meshXRay: 0,
  clipPlaneColor: [0, 0, 0, 0],
  clipPlaneHotKey: '',
  cycleClipPlaneHotKey: '',
})
export const anatomySurfaceColor = () => new Uint8Array([195, 179, 151, 255])
export const ctSurfaceColor = () => new Uint8Array([220, 220, 200, 255])

export type SceneLayer =
  'stereotax' | 'headposts' | 'chambers' | 'guideTubes' | 'grids' | 'electrodes' | 'contacts' | 'axes' | 'targets' | 'avoidance'
export interface SceneDisplay {
  anatomyOpacity: number
  skullOpacity: number
  chamberOpacity: number
  implantOpacity: number
  stereotaxOpacity: number
  showIntersections: boolean
  showOccludedGeometry: boolean
  enhanceElectrodes: boolean
  layers: Record<SceneLayer, boolean>
}
export const defaultSceneDisplay = (): SceneDisplay => ({
  anatomyOpacity: 0.3,
  skullOpacity: 0.85,
  chamberOpacity: 0.8,
  implantOpacity: 0.8,
  stereotaxOpacity: 0.65,
  showIntersections: false,
  showOccludedGeometry: false,
  enhanceElectrodes: true,
  layers: {
    stereotax: true,
    headposts: true,
    chambers: true,
    guideTubes: true,
    grids: true,
    electrodes: true,
    contacts: true,
    axes: true,
    targets: true,
    avoidance: true,
  },
})
export function layerOpacity(display: SceneDisplay, layer: SceneLayer, baseOpacity: number): number {
  return display.layers[layer]
    ? layer === 'stereotax' ? display.stereotaxOpacity
      : layer === 'targets' || layer === 'avoidance'
      ? baseOpacity
      : layer === 'chambers' || layer === 'axes'
        ? display.chamberOpacity
        : display.implantOpacity
    : 0
}
