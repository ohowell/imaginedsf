import content from 'virtual:content'
import { describe, expect, it } from 'vitest'
import { fromHash, toHash } from './hash.ts'

const [first, second] = Object.keys(content.layers).filter(
  (slug) => !content.basemaps.includes(slug),
)
const otherBasemap = content.basemaps.find(
  (slug) => slug !== content.defaultBasemap,
)!

describe('map state hashes', () => {
  it('reads back what they write', () => {
    const state = {
      basemap: otherBasemap,
      layers: [first, second],
      opacity: { [first]: 0.35 },
      bbox: [-122.5, 37.7, -122.3, 37.8] as [number, number, number, number],
    }
    const hash = toHash(state)
    expect(hash).toBe(
      `#layers=${first}:0.35,${second}&basemap=${otherBasemap}&bbox=-122.5,37.7,-122.3,37.8`,
    )
    expect(fromHash(hash)).toEqual(state)
  })

  it('leave out defaults', () => {
    const state = {
      basemap: content.defaultBasemap,
      layers: [first],
      opacity: { [first]: 1, [second]: 0.5 },
    }
    expect(toHash(state)).toBe(`#layers=${first}`)
    expect(toHash({ ...state, layers: [] })).toBe('')
  })

  it('round the view to about a metre', () => {
    const hash = toHash({
      basemap: content.defaultBasemap,
      layers: [],
      opacity: {},
      bbox: [-122.123456789, 37.1, -122, 37.987654321],
    })
    expect(hash).toBe('#bbox=-122.12346,37.1,-122,37.98765')
  })

  it('skip what makes no sense', () => {
    expect(
      fromHash(
        `#layers=no-such-layer,${content.defaultBasemap},${first}:2,${first}:0.5` +
          '&basemap=no-such-basemap&bbox=-122,37,-123,38',
      ),
    ).toEqual({
      basemap: content.defaultBasemap,
      layers: [first],
      opacity: {},
      bbox: undefined,
    })
    expect(fromHash('#bbox=a,b,c,d').bbox).toBeUndefined()
    expect(fromHash('')).toEqual({
      basemap: content.defaultBasemap,
      layers: [],
      opacity: {},
      bbox: undefined,
    })
  })
})
