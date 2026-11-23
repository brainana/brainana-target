/** Six-connected components using in-place visit states and a stack of horizontal runs. */
export function selectMaskComponents(
  mask: Uint8Array, dims: number[], keep: 'all' | 'largest', seed?: number,
  progress?: (message: string) => void,
): { components: number; retained: number } {
  const [nx, ny] = dims, plane = nx * ny
  let stack = new Float64Array(8192), top = 0
  const flood = (start: number, from: number, to: number): number => {
    let count = 0
    const claim = (index: number): number => {
      const row = Math.floor(index / nx) * nx
      let left = index, right = index
      while (left > row && mask[left - 1] === from) left--
      while (right + 1 < row + nx && mask[right + 1] === from) right++
      mask.fill(to, left, right + 1)
      count += right - left + 1
      if (top + 2 > stack.length) {
        const grown = new Float64Array(stack.length * 2)
        grown.set(stack)
        stack = grown
      }
      stack[top++] = left
      stack[top++] = right
      return right
    }
    const scan = (left: number, right: number) => {
      for (let index = left; index <= right; index++)
        if (mask[index] === from) index = claim(index)
    }
    claim(start)
    let nextProgress = 1000000
    while (top > 0) {
      const right = stack[--top], left = stack[--top]
      const y = Math.floor(left / nx) % ny
      if (y > 0) scan(left - nx, right - nx)
      if (y + 1 < ny) scan(left + nx, right + nx)
      if (left >= plane) scan(left - plane, right - plane)
      if (left + plane < mask.length) scan(left + plane, right + plane)
      if (count >= nextProgress) {
        progress?.(`Selecting connected CT bone · ${count.toLocaleString()} voxels visited…`)
        nextProgress = count + 1000000
      }
    }
    return count
  }
  let components = 0, largestSize = 0, largestSeed = -1, retained = 0
  if (seed !== undefined) {
    if (!mask[seed]) throw new Error('The selected point is not counted as bone with the current threshold. Click a bright part of the skull in a CT slice, then choose Select skull at crosshair.')
    retained = flood(seed, 1, 3)
    components++
  }
  for (let index = 0; index < mask.length; index++) {
    if (mask[index] !== 1) continue
    const size = flood(index, 1, 2)
    components++
    if (size > largestSize) { largestSize = size; largestSeed = index }
    if (seed === undefined && keep === 'all') retained += size
  }
  if (seed === undefined && keep === 'largest' && largestSeed >= 0)
    retained = flood(largestSeed, 2, 3)
  const selectedState = seed !== undefined || keep === 'largest' ? 3 : 2
  for (let index = 0; index < mask.length; index++) mask[index] = Number(mask[index] === selectedState)
  return { components, retained }
}
