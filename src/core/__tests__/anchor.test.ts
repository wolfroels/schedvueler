import { describe, expect, it } from 'vitest'
import { anchorPosition } from '../anchor'

const VIEW = { width: 1000, height: 800 }
const SIZE = { width: 200, height: 100 }
const rect = (left: number, top: number) => ({ left, top, right: left + 50, bottom: top + 20 })

describe('anchorPosition', () => {
  it('uses the preferred side when it fits', () => {
    expect(anchorPosition(rect(100, 100), SIZE, VIEW)).toEqual({
      placement: 'right',
      left: 158,
      top: 100,
    })
  })

  it('flips when only the other side fits', () => {
    expect(anchorPosition(rect(900, 100), SIZE, VIEW).placement).toBe('left')
    expect(anchorPosition(rect(100, 10), SIZE, VIEW, { placement: 'top' }).placement).toBe('bottom')
  })

  it('stays inside the viewport', () => {
    const { top } = anchorPosition(rect(100, 780), SIZE, VIEW)
    expect(top).toBe(692)
  })
})
