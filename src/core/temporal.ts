// Single import point for Temporal. The polyfill defers to the native implementation when the
// runtime ships one, so this costs nothing on browsers that already support Temporal.
export { Temporal } from 'temporal-polyfill'
