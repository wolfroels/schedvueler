// Reads the theme tokens straight from the stylesheets, so the theme page never drifts from them.
import schedulerCss from '../src/styles/scheduler.css?raw'

export type ThemeMode = 'light' | 'dark'

export interface ThemeVar {
  name: string
  light: string
  dark: string
}

export interface ThemeGroup {
  title: string
  vars: ThemeVar[]
}

/** The body of the first rule whose selector is exactly `selector` (top level only). */
function ruleBody(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) return ''
  let depth = 0
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}' && --depth === 0) return css.slice(css.indexOf('{', start) + 1, i)
  }
  return ''
}

interface Decl {
  group?: string
  name: string
  value: string
}

/**
 * Custom property declarations in a rule body, in order. A one-line comment directly above a
 * declaration that is short and lower case (`/* colors *\/`) starts a new group.
 */
function declarations(body: string): Decl[] {
  const out: Decl[] = []
  const re = /\/\*([\s\S]*?)\*\/|(--orb-[a-z0-9-]+)\s*:\s*([^;]+);/g
  let group: string | undefined
  for (let m = re.exec(body); m; m = re.exec(body)) {
    if (m[1] !== undefined) {
      const text = m[1].trim()
      if (!text.includes('\n') && text.length <= 24 && /^[a-z ]+$/.test(text)) group = text
      continue
    }
    out.push({ group, name: m[2]!, value: m[3]!.replace(/\s+/g, ' ').replace(/\( /g, '(').trim() })
    group = undefined
  }
  return out
}

const THEME = ':is(.schedvueler, .orb-editor)'

/** Tokens that are read with a fallback deep in the stylesheet rather than declared up top. */
const EXTRA: ThemeGroup = {
  title: 'more',
  vars: [
    ['--orb-color-conflict', '#dc2626'],
    ['--orb-color-zone-band', '#16a34a'],
    ['--orb-selection-bg', 'color-mix(in srgb, var(--orb-color-accent) 16%, transparent)'],
    ['--orb-selection-border', 'color-mix(in srgb, var(--orb-color-accent) 55%, transparent)'],
    ['--orb-invalid-color', '#dc2626'],
    ['--orb-mirror-shadow', '0 6px 16px -4px rgb(15 23 42 / 0.35)'],
    ['--orb-transition-duration', '180ms'],
    ['--orb-event-sticky-title', '0.25rem'],
    ['--orb-agenda-time-width', '5.5rem'],
  ].map(([name, value]) => ({ name: name!, light: value!, dark: value! })),
}

function build(): ThemeGroup[] {
  const light = declarations(ruleBody(schedulerCss, THEME))
  const dark = new Map(
    declarations(ruleBody(schedulerCss, `${THEME}[data-theme='dark']`)).map((d) => [
      d.name,
      d.value,
    ]),
  )

  const groups: ThemeGroup[] = []
  for (const d of light) {
    if (d.group || !groups.length) groups.push({ title: d.group ?? 'theme', vars: [] })
    groups.at(-1)!.vars.push({ name: d.name, light: d.value, dark: dark.get(d.name) ?? d.value })
  }
  groups.push(EXTRA)
  return groups
}

export const THEME_GROUPS = build()

/** Tokens that hold a color, so the page can offer a picker next to the text field. */
export function isColorVar(name: string) {
  return /^--orb-(color-|event-color$|event-text-base$|event-bg-base$|background-event-color$|selection-|invalid-color$)/.test(
    name,
  )
}

export function selectorFor(mode: ThemeMode) {
  return mode === 'dark' ? `${THEME}[data-theme='dark']` : THEME
}
