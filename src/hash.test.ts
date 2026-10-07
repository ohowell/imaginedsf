import content from 'virtual:content'
import { describe, expect, it } from 'vitest'
import { fromHash, fromOldPath, toHash } from './hash.ts'

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

describe('old site links', () => {
  const idOf = (slug: string) =>
    (content.layers[slug] ?? content.groups[slug]).wordpressId!
  const oldHash = (
    enabled: Record<number, boolean>,
    opacity: Record<number, number> = {},
    bounds: unknown = [
      [37.81, -122.48],
      [37.76, -122.39],
    ],
  ) => `#${btoa(JSON.stringify({ mapState: { enabled, opacity, bounds } }))}`

  // Two layers listed straight under eras, in sidebar order, and a group.
  const listed = content.eras.flatMap((era) =>
    era.children.filter((slug) => slug in content.layers),
  )
  const [upper, lower] = listed
  const group = Object.values(content.groups)[0]
  const grouped = group.children[0]
  const [topBasemap, bottomBasemap] = content.basemaps

  it('read layers, opacity, basemap and view', () => {
    expect(
      fromHash(
        oldHash(
          {
            [idOf(upper)]: true,
            [idOf(lower)]: true,
            [idOf(topBasemap)]: false,
            [idOf(bottomBasemap)]: true,
          },
          { [idOf(upper)]: 0.4, [idOf(lower)]: 1 },
        ),
      ),
    ).toEqual({
      basemap: bottomBasemap,
      // The old site drew the first listed on top.
      layers: [lower, upper],
      opacity: { [upper]: 0.4 },
      bbox: [-122.48, 37.76, -122.39, 37.81],
    })
  })

  it('use the top basemap when several were on', () => {
    const state = fromHash(
      oldHash({ [idOf(bottomBasemap)]: true, [idOf(topBasemap)]: true }),
    )
    expect(state.basemap).toBe(topBasemap)
  })

  it('leave out layers in groups that were off', () => {
    const layer = { [idOf(grouped)]: true }
    expect(
      fromHash(oldHash({ ...layer, [idOf(group.slug)]: false })).layers,
    ).toEqual([])
    expect(
      fromHash(oldHash({ ...layer, [idOf(group.slug)]: true })).layers,
    ).toEqual([grouped])
  })

  it('skip what makes no sense', () => {
    const state = fromHash(
      oldHash({ 999999: true, [idOf(upper)]: true }, { [idOf(upper)]: 5 }, [
        [37.8, 'west'],
      ]),
    )
    expect(state).toEqual({
      basemap: content.defaultBasemap,
      layers: [upper],
      opacity: {},
      bbox: undefined,
    })
    expect(fromHash('#eyJub3QganNvbg')).toEqual(fromHash(''))
  })
})

describe('old site paths', () => {
  const layer = Object.values(content.layers)[0]
  const group = Object.values(content.groups)[0]

  it('open descriptions by WordPress ID', () => {
    expect(fromOldPath(`/description/${layer.wordpressId}`)).toEqual({
      about: layer.slug,
    })
    expect(fromOldPath(`/description/${group.wordpressId}/`)).toEqual({
      about: group.slug,
    })
    expect(fromOldPath('/description/999999')).toEqual({})
  })

  it('open pages', () => {
    expect(fromOldPath('/introduction')).toEqual({ page: 'introduction' })
    expect(fromOldPath('/credits/')).toEqual({ page: 'credits' })
  })

  it('open nothing for other paths', () => {
    for (const path of [
      '/',
      '/maps-and-plans',
      '/narratives/some-narrative',
      '/introduction/extra',
      '/share',
    ]) {
      expect(fromOldPath(path)).toEqual({})
    }
  })
})
