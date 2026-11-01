import type { BusinessHours } from './availability'
import type { ResourceId } from './types'

/** Default resource shape. Any other shape works too, with matching resource accessors. */
export interface SchedulerResource {
  id: ResourceId
  title?: string
  /** Groups this resource under another one (a tree in the timeline). */
  parentId?: ResourceId | null
  /** Accent color for the resource's events without a color of their own. Children inherit it. */
  color?: string
  /** Opening hours of this resource, instead of the scheduler's. */
  businessHours?: BusinessHours
  /** Has children that are not loaded yet: expanding it emits `resource-expand`. */
  lazy?: boolean
}

export interface ResourceAccessors<R> {
  id(resource: R): ResourceId
  title(resource: R): string | undefined
  parentId(resource: R): ResourceId | null | undefined
  color(resource: R): string | undefined
  businessHours(resource: R): BusinessHours | undefined
  lazy(resource: R): boolean | undefined
}

export const defaultResourceAccessors: ResourceAccessors<SchedulerResource> = {
  id: (r) => r.id,
  title: (r) => r.title,
  parentId: (r) => r.parentId,
  color: (r) => r.color,
  businessHours: (r) => r.businessHours,
  lazy: (r) => r.lazy,
}

export function createResourceAccessors<R>(
  overrides: Partial<ResourceAccessors<R>> = {},
): ResourceAccessors<R> {
  return { ...(defaultResourceAccessors as unknown as ResourceAccessors<R>), ...overrides }
}

/** A resource with its place in the tree. */
export interface ResourceNode<R = SchedulerResource> {
  readonly id: ResourceId
  readonly title: string
  readonly color: string | undefined
  readonly businessHours: BusinessHours | undefined
  /** Has children that are not loaded yet. */
  readonly lazy: boolean
  /** The user's original resource object. */
  readonly resource: R
  readonly parentId: ResourceId | undefined
  /** 0 for top-level resources. */
  readonly depth: number
  readonly childIds: readonly ResourceId[]
}

/**
 * Resources in display order: depth first, children right after their parent, otherwise in input
 * order. Resources whose parent is missing (or that form a cycle) become top-level.
 */
export function buildResourceTree<R>(
  resources: readonly R[],
  accessors: ResourceAccessors<R>,
  order?: (a: R, b: R) => number,
): ResourceNode<R>[] {
  const byId = new Map<ResourceId, R>()
  for (const r of resources) {
    const id = accessors.id(r)
    if (!byId.has(id)) byId.set(id, r)
  }
  const children = new Map<ResourceId | undefined, R[]>()
  for (const [id, r] of byId) {
    let parent = accessors.parentId(r) ?? undefined
    // Walk up to make sure the parent chain ends at a root; otherwise treat as a root.
    const seen = new Set<ResourceId>([id])
    for (let p = parent; p !== undefined;) {
      const pr = byId.get(p)
      if (!pr || seen.has(p)) {
        parent = undefined
        break
      }
      seen.add(p)
      p = accessors.parentId(pr) ?? undefined
    }
    const list = children.get(parent)
    if (list) list.push(r)
    else children.set(parent, [r])
  }

  if (order) for (const list of children.values()) list.sort(order)

  const out: ResourceNode<R>[] = []
  const visit = (
    r: R,
    depth: number,
    parentId: ResourceId | undefined,
    parentColor: string | undefined,
  ) => {
    const id = accessors.id(r)
    const kids = children.get(id) ?? []
    const color = accessors.color(r) ?? parentColor
    out.push(
      Object.freeze({
        id,
        title: accessors.title(r) ?? String(id),
        color,
        businessHours: accessors.businessHours(r),
        lazy: !kids.length && !!accessors.lazy(r),
        resource: r,
        parentId,
        depth,
        childIds: kids.map((k) => accessors.id(k)),
      }),
    )
    for (const k of kids) visit(k, depth + 1, id, color)
  }
  for (const r of children.get(undefined) ?? []) visit(r, 0, undefined, undefined)
  return out
}

/** Nodes that are shown when the nodes in `collapsed` hide their descendants. */
export function visibleResources<R>(
  nodes: readonly ResourceNode<R>[],
  collapsed: ReadonlySet<ResourceId>,
): ResourceNode<R>[] {
  if (!collapsed.size) return nodes.slice()
  const out: ResourceNode<R>[] = []
  let hideBelow = Infinity
  for (const node of nodes) {
    if (node.depth > hideBelow) continue
    hideBelow = collapsed.has(node.id) && node.childIds.length ? node.depth : Infinity
    out.push(node)
  }
  return out
}

/** Nodes that match, along with their parents, so they stay in their tree. */
export function filterResourceTree<R>(
  nodes: readonly ResourceNode<R>[],
  matches: (node: ResourceNode<R>) => boolean,
): ResourceNode<R>[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const keep = new Set<ResourceId>()
  for (const node of nodes) {
    if (!matches(node)) continue
    for (let n: ResourceNode<R> | undefined = node; n && !keep.has(n.id);) {
      keep.add(n.id)
      n = n.parentId === undefined ? undefined : byId.get(n.parentId)
    }
  }
  return nodes.filter((n) => keep.has(n.id))
}

/** The list after moving one resource before or after another, for `resource-reorder`. */
export function reorderResources<R>(
  list: readonly R[],
  id: (resource: R) => ResourceId,
  moved: ResourceId,
  target: ResourceId,
  position: 'before' | 'after',
): readonly R[] {
  if (moved === target) return list
  const item = list.find((r) => id(r) === moved)
  if (item === undefined) return list
  const rest = list.filter((r) => id(r) !== moved)
  const index = rest.findIndex((r) => id(r) === target)
  if (index < 0) return list
  rest.splice(position === 'before' ? index : index + 1, 0, item)
  return rest
}

/**
 * Resource ids after moving an event on several resources by the rows from `from` to `to`:
 * all of them shift together. It stays where it is when one would fall off the list.
 */
export function shiftResourceIds(
  ids: readonly ResourceId[],
  from: ResourceId | undefined,
  to: ResourceId | undefined,
  order: readonly ResourceId[],
): readonly ResourceId[] {
  if (from === undefined || to === undefined || from === to) return ids
  const delta = order.indexOf(to) - order.indexOf(from)
  const shifted = ids.map((id) => order[order.indexOf(id) + delta])
  return shifted.every((id) => id !== undefined) ? (shifted as ResourceId[]) : ids
}

/** Nodes without children, e.g. for time-grid resource columns. */
export function leafResources<R>(nodes: readonly ResourceNode<R>[]): ResourceNode<R>[] {
  return nodes.filter((n) => !n.childIds.length)
}

/** Occurrences (or anything with `resourceIds`) per resource id. Items appear under every id. */
export function groupByResource<O extends { resourceIds: readonly ResourceId[] }>(
  items: readonly O[],
): Map<ResourceId, O[]> {
  const map = new Map<ResourceId, O[]>()
  for (const item of items) {
    for (const id of item.resourceIds) {
      const list = map.get(id)
      if (list) list.push(item)
      else map.set(id, [item])
    }
  }
  return map
}

/** Resource ids after moving an event from resource `from` to `to` (e.g. by dragging a row). */
export function moveResourceIds(
  ids: readonly ResourceId[],
  from: ResourceId | undefined,
  to: ResourceId | undefined,
): readonly ResourceId[] {
  if (from === undefined || to === undefined || from === to) return ids
  const out = ids.includes(from) ? ids.map((id) => (id === from ? to : id)) : [to]
  return [...new Set(out)]
}

export function sameResourceIds(a: readonly ResourceId[], b: readonly ResourceId[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i])
}
