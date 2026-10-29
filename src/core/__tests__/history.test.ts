import { describe, expect, it } from 'vitest'
import { createHistory } from '../history'

describe('createHistory', () => {
  it('undoes and redoes with labels', () => {
    const h = createHistory([1])
    expect(h.canUndo).toBe(false)
    h.push([1, 2], 'add 2')
    h.push([1, 2, 3], 'add 3')
    expect(h.undoLabel).toBe('add 3')
    expect(h.undo()).toEqual([1, 2])
    expect(h.redoLabel).toBe('add 3')
    expect(h.undoLabel).toBe('add 2')
    expect(h.undo()).toEqual([1])
    expect(h.undo()).toBeUndefined()
    expect(h.redo()).toEqual([1, 2])
    expect(h.redo()).toEqual([1, 2, 3])
    expect(h.canRedo).toBe(false)
  })

  it('drops the redo stack on a new change and ignores no-op pushes', () => {
    const a = [1]
    const h = createHistory(a)
    h.push(a)
    expect(h.canUndo).toBe(false)
    h.push([2], 'x')
    h.undo()
    h.push([3], 'y')
    expect(h.canRedo).toBe(false)
    expect(h.undo()).toEqual([1])
  })

  it('keeps at most `limit` steps', () => {
    const h = createHistory(0, { limit: 2 })
    for (let i = 1; i <= 5; i++) h.push(i)
    expect(h.undo()).toBe(4)
    expect(h.undo()).toBe(3)
    expect(h.undo()).toBeUndefined()
    expect(h.present).toBe(3)
  })

  it('resets', () => {
    const h = createHistory('a')
    h.push('b')
    h.reset()
    expect(h.present).toBe('b')
    expect(h.canUndo).toBe(false)
    h.reset('z')
    expect(h.present).toBe('z')
  })
})
