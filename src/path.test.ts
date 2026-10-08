import content from 'virtual:content'
import { describe, expect, it } from 'vitest'
import { fromPath, toPath } from './path.ts'

const layer = Object.values(content.layers).find((item) => item.description)!
const group = Object.values(content.groups).find((item) => item.description)!
const undescribed = Object.values(content.layers).find(
  (item) => !item.description,
)!

describe('paths', () => {
  it('read back what they write', () => {
    for (const opened of [
      { about: layer.slug },
      { about: group.slug },
      { page: 'introduction' as const },
      {},
    ]) {
      expect(fromPath(toPath(opened))).toEqual(opened)
    }
  })

  it('name layers and groups like their content files', () => {
    expect(toPath({ about: layer.slug })).toBe(`/layers/${layer.slug}/`)
    expect(toPath({ about: group.slug })).toBe(`/groups/${group.slug}/`)
    expect(fromPath(`/layers/${layer.slug}`)).toEqual({ about: layer.slug })
  })

  it('leave out items without a description', () => {
    expect(toPath({ about: undescribed.slug })).toBe('/')
    expect(fromPath(`/layers/${undescribed.slug}/`)).toEqual({})
  })

  it('open nothing for other paths', () => {
    for (const path of [
      '/',
      '/maps-and-plans',
      `/groups/${layer.slug}/`,
      `/layers/${layer.slug}/extra`,
      '/layers/constructor/',
      '/narratives/some-narrative',
      '/introduction/extra',
      '/share',
      '/toString',
      '/constructor',
    ]) {
      expect(fromPath(path)).toEqual({})
    }
  })
})

describe('old site paths', () => {
  const old = Object.values(content.layers).find((item) => item.wordpressId)!
  const oldGroup = Object.values(content.groups).find(
    (item) => item.wordpressId,
  )!

  it('open descriptions by WordPress ID', () => {
    expect(fromPath(`/description/${old.wordpressId}`)).toEqual({
      about: old.slug,
    })
    expect(fromPath(`/description/${oldGroup.wordpressId}/`)).toEqual({
      about: oldGroup.slug,
    })
    expect(fromPath('/description/999999')).toEqual({})
  })

  it('open pages', () => {
    expect(fromPath('/introduction')).toEqual({ page: 'introduction' })
    expect(fromPath('/credits/')).toEqual({ page: 'credits' })
  })
})
