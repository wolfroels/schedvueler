export type PopoverPlacement = 'right' | 'left' | 'top' | 'bottom'

export interface AnchorRect {
  left: number
  top: number
  right: number
  bottom: number
}

export interface AnchorOptions {
  /** Preferred side; the opposite is used when it does not fit. Default "right". */
  placement?: PopoverPlacement
  /** Space between anchor and popover in px. Default 8. */
  offset?: number
  /** Space kept from the viewport edge in px. Default 8. */
  margin?: number
}

/** Where to put a popover of a size next to an anchor, staying inside the viewport. */
export function anchorPosition(
  anchor: AnchorRect,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  options: AnchorOptions = {},
): { left: number; top: number; placement: PopoverPlacement } {
  const { placement = 'right', offset = 8, margin = 8 } = options
  const fits: Record<PopoverPlacement, boolean> = {
    right: anchor.right + offset + size.width + margin <= viewport.width,
    left: anchor.left - offset - size.width - margin >= 0,
    bottom: anchor.bottom + offset + size.height + margin <= viewport.height,
    top: anchor.top - offset - size.height - margin >= 0,
  }
  const opposite = { right: 'left', left: 'right', top: 'bottom', bottom: 'top' } as const
  const side = fits[placement] || !fits[opposite[placement]] ? placement : opposite[placement]
  const clamp = (value: number, size: number, max: number) =>
    Math.min(Math.max(value, margin), Math.max(margin, max - size - margin))
  const horizontal = side === 'left' || side === 'right'
  return {
    placement: side,
    left: horizontal
      ? clamp(
          side === 'right' ? anchor.right + offset : anchor.left - offset - size.width,
          size.width,
          viewport.width,
        )
      : clamp(anchor.left, size.width, viewport.width),
    top: horizontal
      ? clamp(anchor.top, size.height, viewport.height)
      : clamp(
          side === 'bottom' ? anchor.bottom + offset : anchor.top - offset - size.height,
          size.height,
          viewport.height,
        ),
  }
}
