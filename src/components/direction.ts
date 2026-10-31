export function isRtl(el: Element): boolean {
  return getComputedStyle(el).direction === 'rtl'
}

/** The arrow key as days and columns see it: right to left, left means the next column. */
export function visualArrow(key: string, el: Element): string {
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return key
  if (!isRtl(el)) return key
  return key === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft'
}
