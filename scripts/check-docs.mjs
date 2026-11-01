// Fails when a prop, emit or slot in the types is missing from docs/API.md.
import { readFileSync } from 'node:fs'

const types = readFileSync('src/types.ts', 'utf8').replace(/\r\n/g, '\n')
const docs = readFileSync('docs/API.md', 'utf8')

const kebab = (name) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)

function members(start) {
  const from = types.indexOf(start)
  if (from < 0) throw new Error(`Not found: ${start}`)
  const body = types.slice(types.indexOf('\n', from), types.indexOf('\n}\n', from))
  return [...body.matchAll(/^ {2}'?([A-Za-z-]+)'?\??:/gm)].map((m) => m[1])
}

// Props are read as words, emits and slots in backticks.
const missing = [
  ...members('export interface SchedulerOptions<T>')
    .filter((name) => name !== 'events')
    .filter((name) => !docs.includes(`\`${kebab(name)}\``))
    .map((name) => `prop ${kebab(name)}`),
  ...members('export interface SchedulerEmits<T>')
    .filter((name) => !docs.includes(`\`${name}\``))
    .map((name) => `emit ${name}`),
  ...members('export interface SchedulerSlots<T>')
    .filter((name) => name !== 'default' && !docs.includes(`\`${name}\``))
    .map((name) => `slot ${name}`),
]

if (missing.length) {
  console.log(`Not in docs/API.md:\n  ${missing.join('\n  ')}`)
  process.exit(1)
}
console.log('Every prop, emit and slot is documented.')
