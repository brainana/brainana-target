import { h } from '@brainana/ui/dom.ts'
import type { Electrode } from '@brainana/planning-core/model.ts'
import { shankOffsets, shankLength, shaftDiameter, localSites } from '@brainana/planning-core/hardware.ts'
/** Device-only view: independent of image zoom and never used for constraint geometry. */
export function hardwareSchematic(e: Electrode, selectShank: (i: number) => void): HTMLElement {
  const canvas = h('canvas', {
    width: 760,
    height: 520,
    ariaLabel: 'Electrode geometry: side, footprint and recording sites',
    role: 'img',
  })
  canvas.style.width = '100%'
  canvas.style.background = '#0d0d0a'
  const ctx = canvas.getContext('2d')!,
    offsets = shankOffsets(e),
    selected = e.hardware?.selectedShank ?? 0
  const text = (value: string, x: number, y: number, color = '#b8af9a'): void => {
    ctx.fillStyle = color
    ctx.font = '18px sans-serif'
    ctx.fillText(value, x, y)
  }
  text('SHAFTS · SIDE', 20, 28)
  text('FOOTPRINT · CLICK A SHAFT', 350, 28)
  const longest = Math.max(...offsets.map((_, i) => shankLength(e, i) + (e.hardware?.reservedLength ?? 0))),
    sy = 270 / longest
  const xs = offsets.map((o) => o[0]),
    spanX = Math.max(...xs) - Math.min(...xs)
  offsets.forEach((o, i) => {
    const x = 165 + o[0] * Math.min(60, 220 / Math.max(spanX, 0.1))
    ctx.strokeStyle = i === selected ? '#e6a13a' : e.color
    ctx.lineWidth = i === selected ? 5 : 2
    ctx.beginPath()
    ctx.moveTo(x, 45)
    ctx.lineTo(x, 45 + (shankLength(e, i) + (e.hardware?.reservedLength ?? 0)) * sy)
    ctx.stroke()
  })
  if (e.guideTube) {
    const tube = e.guideTube,
      physical = shankLength(e, selected) + (e.hardware?.reservedLength ?? 0)
    const y1 = 45 + (physical - e.depth + tube.tipDepth - tube.length) * sy,
      y2 = 45 + (physical - e.depth + tube.tipDepth) * sy
    const half = Math.max(6, tube.outerDiameter * 30)
    ctx.strokeStyle = '#98b3d2'
    ctx.lineWidth = 2
    ctx.strokeRect(165 - half, y1, half * 2, y2 - y1)
    text(
      `Guide tube Ø${tube.outerDiameter.toFixed(2)} / ID ${tube.innerDiameter.toFixed(2)} mm`,
      20,
      391,
      '#98b3d2',
    )
  }
  text(`${longest.toFixed(2)} mm longest shaft`, 20, 343)
  text('Width exaggerated in side view', 20, 368)
  const extent =
    Math.max(0.2, ...offsets.map((o) => Math.max(Math.abs(o[0]), Math.abs(o[1])))) +
    Math.max(shaftDiameter(e), e.guideTube?.outerDiameter ?? 0) / 2
  const sf = 115 / extent
  const centers = offsets.map((o) => [550 + o[0] * sf, 175 - o[1] * sf])
  centers.forEach(([x, y], i) => {
    ctx.fillStyle = i === selected ? '#e6a13a' : e.color
    if (e.hardware?.shape === 'blade') {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate((-e.hardware.rotation * Math.PI) / 180)
      ctx.fillRect(
        (-e.hardware.width * sf) / 2,
        (-e.hardware.thickness * sf) / 2,
        e.hardware.width * sf,
        e.hardware.thickness * sf,
      )
      ctx.restore()
    } else {
      ctx.beginPath()
      ctx.arc(x, y, Math.max(1, (e.diameter * sf) / 2), 0, Math.PI * 2)
      ctx.fill()
    }
    if (centers.length > 1 && centers.length <= 100) {
      ctx.fillStyle = '#b8af9a'
      ctx.font = '11px sans-serif'
      ctx.fillText(String(i + 1), x + 5, y - 6)
    }
    if (i === selected) {
      ctx.strokeStyle = '#e6a13a'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(x, y, Math.max(8, (shaftDiameter(e) * sf) / 2 + 5), 0, Math.PI * 2)
      ctx.stroke()
    }
  })
  if (e.guideTube && e.guideTube.tipDepth - e.guideTube.length <= 0) {
    ctx.strokeStyle = '#98b3d2'
    ctx.lineWidth = 2
    for (const diameter of [e.guideTube.innerDiameter, e.guideTube.outerDiameter]) {
      ctx.beginPath()
      ctx.arc(550, 175, (diameter * sf) / 2, 0, 2 * Math.PI)
      ctx.stroke()
    }
  }
  const bar = Math.max(0.01, Number((extent / 2).toPrecision(1)))
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(450, 315)
  ctx.lineTo(450 + bar * sf, 315)
  ctx.stroke()
  text(`${bar} mm`, 450, 343)
  text(`Targeting tip of shaft ${selected + 1} / ${offsets.length}`, 350, 368, '#e6a13a')
  text('SITE DETAIL · FIRST 32 SITES ON SELECTED SHAFT', 20, 411)
  const points = localSites(e, selected).slice(0, 32),
    backs = points.map((p) => p[2]),
    xsSites = points.map((p) => p[0]),
    minBack = Math.min(...backs),
    spanBack = Math.max(0.001, Math.max(...backs) - minBack),
    minX = Math.min(...xsSites),
    spanSiteX = Math.max(0.001, Math.max(...xsSites) - minX)
  for (const point of points) {
    const x = 35 + ((point[2] - minBack) / spanBack) * 650,
      y = 437 + ((point[0] - minX) / spanSiteX) * 40
    ctx.fillStyle = point[1] < offsets[selected][1] ? '#67d9d1' : '#fff'
    ctx.fillRect(x, y, 5, 5)
  }
  text(
    e.hardware?.sitePositions
      ? `${e.contactCount} sites / shaft · explicit site layout · ${e.contactLength * 1000} µm site size`
      : `${e.contactCount} sites / shaft · ${e.contactSpacing * 1000} µm row pitch · ${e.contactLength * 1000} µm site size`,
    20,
    511,
  )
  canvas.addEventListener('click', (event) => {
    const rect = canvas.getBoundingClientRect(),
      x = ((event.clientX - rect.left) * 760) / rect.width,
      y = ((event.clientY - rect.top) * 520) / rect.height
    if (x < 330 || y > 305) return
    let nearest = 0,
      distance = Infinity
    centers.forEach(([cx, cy], i) => {
      const d = Math.hypot(x - cx, y - cy)
      if (d < distance) {
        distance = d
        nearest = i
      }
    })
    selectShank(nearest)
  })
  // Keep generation explicit and bounded: dense probes do not create one DOM node per site.
  const figure = h('figure', { class: 'hardware-schematic' }, [
    canvas,
    h('figcaption', { class: 'note' }, [
      "The top view uses the entered spacing and layout. The side view widens thin shafts so you can see them. Contact detail preserves relative spacing; teal marks contacts on the opposite face. Electrode numbers identify items in this plan, not recording-system channels.",
    ]),
  ])
  figure.style.margin = '12px 0'
  return figure
}
