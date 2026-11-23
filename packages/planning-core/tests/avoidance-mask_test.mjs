import assert from 'node:assert/strict'
import { avoidanceMask } from '../avoidance-mask.ts'
import { regionClearance } from '../optimization.ts'
import { planePoint } from '../reslice.ts'
import { trajectoryAxes } from '../geometry.ts'
const region = (points, radius) => ({
  id: 'avoid',
  name: 'Avoid',
  frameId: 'frame',
  center: points[0],
  points,
  radius,
})
const regions = [
  region(
    [
      [-5, -3, -1],
      [5, 3, 1],
    ],
    1.5,
  ),
  region([[3, -4, 0]], 2),
  region(
    [
      [-8, 5, 10],
      [8, 5, 10],
    ],
    1,
  ),
  region(
    [
      [0, 0, -20],
      [0, 0, 20],
    ],
    0.6,
  ),
]
for (const normal of [
  [0, 0, 1],
  [1, 2, 3],
]) {
  const [right, up] = trajectoryAxes(normal)
  const plane = { center: [1, -1, 0.25], right, up, widthMm: 20, heightMm: 12 }
  const mask = avoidanceMask(plane, 40, 24, regions)
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < 40; x++) {
      const point = planePoint(plane, x, y, 40, 24)
      const expected = regions.some((r) => regionClearance(point, point, 0, r) <= 0)
      assert.equal(!!mask[x + y * 40], expected, `pixel ${x},${y}`)
    }
}
console.log(
  '  ok - bounded avoidance rasterization matches exact sphere/capsule geometry on rotated and anisotropic planes',
)
assert.ok(
  avoidanceMask({ center: [0, 0, 0], right: [1, 0, 0], up: [0, 1, 0], widthMm: 20, heightMm: 20 }, 32, 32, [
    region(
      [
        [0, 0, 50],
        [1, 0, 50],
      ],
      1,
    ),
  ]).every((x) => x === 0),
)
console.log('  ok - off-plane strokes are culled without producing false avoidance pixels')
