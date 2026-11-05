// Fails when the built library grows past its budget. Run after `npm run build-only`.
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const BUDGETS_KB = { 'dist/index.js': 70, 'dist/schedvueler.css': 11 }

let failed = false
for (const [file, budget] of Object.entries(BUDGETS_KB)) {
  const kb = gzipSync(readFileSync(file)).length / 1024
  const ok = kb <= budget
  failed ||= !ok
  console.log(`${ok ? 'ok ' : 'OVER'} ${file}: ${kb.toFixed(1)} kB gzipped (budget ${budget} kB)`)
}
process.exit(failed ? 1 : 0)
