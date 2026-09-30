import {
  getCogMetadata,
  setColorFunction,
} from '@geomatico/maplibre-cog-protocol'

type ColorFunction = NonNullable<Parameters<typeof setColorFunction>[1]>

/**
 * Prepares a COG for display. Some of Stanford's scans store 0–255 values in
 * 16 bits, marking missing pixels with 256, which the protocol would draw
 * almost black, so those are drawn as 8-bit colors instead.
 */
export async function prepareCog(url: string) {
  const { bitsPerSample = [], noData } = await getCogMetadata(url)
  if (bitsPerSample.every((bits) => bits <= 8)) return
  setColorFunction(url, eightBitColors(bitsPerSample, noData))
}

// Bands are gray, or red, green and blue, then an optional alpha band.
function eightBitColors(
  bitsPerSample: number[],
  noData: number | undefined,
): ColorFunction {
  const bands = bitsPerSample.length
  const hasAlpha = bands === 2 || bands === 4
  const colorBands = hasAlpha ? bands - 1 : bands
  const alphaShift = hasAlpha ? Math.max(0, bitsPerSample[bands - 1] - 8) : 0
  // Called for every pixel, so it avoids allocating.
  return (pixel, color) => {
    let missing = noData !== undefined
    for (let band = 0; missing && band < colorBands; band++) {
      missing = pixel[band] === noData
    }
    if (missing) {
      color.fill(0)
      return
    }
    // The clamped array stores values above 255 as 255.
    color[0] = pixel[0]
    color[1] = pixel[colorBands === 1 ? 0 : 1]
    color[2] = pixel[colorBands === 1 ? 0 : 2]
    color[3] = hasAlpha ? pixel[bands - 1] >> alphaShift : 255
  }
}
