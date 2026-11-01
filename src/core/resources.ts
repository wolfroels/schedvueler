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
}

export interface ResourceAccessors<R> {
  id(resource: R): ResourceId
  title(resource: R): string | undefined
  parentId(resource: R): ResourceId | null | undefined
  color(resource: R): string | undefined
  businessHours(resource: R): BusinessHours | undefined
}

export const defaultResourceAccessors: ResourceAccessors<SchedulerResource> = {
  id: (r) => r.id,
  title: (r) => r.title,
  parentId: (r) => r.parentId,
  color: (r) => r.color,
  businessHours: (r) => r.businessHours,
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
