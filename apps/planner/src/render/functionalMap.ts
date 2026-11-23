import { NVImage, NVMeshLoaders, type Niivue } from '@niivue/niivue'
import type { Asset } from '@brainana/planning-core/model.ts'
import { bytesView } from '../data/buffers.ts'

type Display = NonNullable<Asset['imageDisplay']>
export interface FunctionalData {
  values: ArrayLike<number>
  frameSize: number
  frames: number
  slope: number
  intercept: number
}

export function functionalVolumeData(image: NVImage): FunctionalData {
  const header = image.hdr
  if (!header || !image.img || header.dims.slice(5).some(n => n > 1)
    || ![2, 4, 8, 16, 64, 256, 512, 768].includes(header.datatypeCode))
    throw new Error('Choose a scalar 3D or 4D functional image.')
  const frameSize = header.dims[1] * header.dims[2] * header.dims[3]
  const frames = Math.max(1, header.dims[4] || 1)
  if (frameSize <= 0 || image.img.length !== frameSize * frames) throw new Error('Incomplete functional image frames.')
  return { values: image.img, frameSize, frames, slope: header.scl_slope || 1, intercept: header.scl_slope ? header.scl_inter : 0 }
}

export async function functionalSurfaceData(bytes: Uint8Array, vertices: number): Promise<FunctionalData> {
  const { scalars } = await NVMeshLoaders.readGII(bytesView(bytes).slice().buffer, vertices)
  if (!scalars?.length || scalars.length % vertices !== 0)
    throw new Error('The GIfTI values do not match the selected surface vertex count.')
  return { values: scalars, frameSize: vertices, frames: scalars.length / vertices, slope: 1, intercept: 0 }
}

export function functionalRange(data: FunctionalData, frame: number): [number, number] {
  let min = Infinity, max = -Infinity
  const start = frame * data.frameSize
  for (let i = start; i < start + data.frameSize; i++) {
    const value = data.values[i] * data.slope + data.intercept
    if (Number.isFinite(value)) {
      min = Math.min(min, value)
      max = Math.max(max, value)
    }
  }
  return Number.isFinite(min) ? [min, Math.max(min + 0.001, max)] : [0, 1]
}

export function functionalBins(data: FunctionalData, settings: Display): Uint8Array {
  const { valueFrame = 0, thresholdFrame, cutoff = 0, includeZero = false } = settings.functional ?? {}
  if (valueFrame >= data.frames || (thresholdFrame !== undefined && thresholdFrame >= data.frames))
    throw new Error('The selected functional sub-brick is outside the file.')
  const bins = new Uint8Array(data.frameSize)
  const valueStart = valueFrame * data.frameSize
  const thresholdStart = (thresholdFrame ?? valueFrame) * data.frameSize
  const scale = 254 / (settings.max - settings.min)
  for (let i = 0; i < bins.length; i++) {
    const value = data.values[valueStart + i] * data.slope + data.intercept
    const statistic = data.values[thresholdStart + i] * data.slope + data.intercept
    if (Number.isFinite(value) && (includeZero || value !== 0)
      && (thresholdFrame === undefined || (Number.isFinite(statistic) && statistic >= cutoff)))
      bins[i] = 1 + Math.round(Math.max(0, Math.min(254, (value - settings.min) * scale)))
  }
  return bins
}

export function functionalLabelVolume(source: NVImage, settings: Display, viewer: Niivue): NVImage {
  const bins = functionalBins(functionalVolumeData(source), settings)
  const image = new NVImage()
  const hdr = source.hdr!
  image.hdr = Object.assign(Object.create(Object.getPrototypeOf(hdr)), hdr, { dims: [3, ...hdr.dims.slice(1, 4), 1, 1, 1, 1],
    datatypeCode: 2, numBitsPerVoxel: 8, intent_code: 1002, scl_slope: 1, scl_inter: 0 })
  image.img = bins
  image.name = source.name
  image.nFrame4D = 1
  image.frame4D = 0
  image.calculateRAS()
  image.cal_min = 0
  image.cal_max = 255
  const lut = viewer.colormap(settings.colormap)
  const I = Array.from({ length: 256 }, (_, i) => i)
  image.setColormapLabel({
    I, R: I.map(i => lut[i * 4]), G: I.map(i => lut[i * 4 + 1]), B: I.map(i => lut[i * 4 + 2]),
    A: I.map(i => i === 0 ? 0 : 255), labels: I.map(String),
  })
  return image
}
