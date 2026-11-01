<script setup lang="ts">
import { onBeforeUnmount, shallowRef, watch, type ComputedRef } from 'vue'

/** Shows the last change for a moment, with a way to undo it. Give it what `useHistory` returns. */
const props = withDefaults(
  defineProps<{
    history: { undo(): unknown; undoLabel: ComputedRef<string | undefined> }
    /** Milliseconds it stays. Default 6000. */
    timeout?: number
    /** The text of the button. */
    undoText?: string
  }>(),
  { timeout: 6000, undoText: 'Undo' },
)

defineSlots<{
  'undo-toast'?: (props: { label: string; undo(): void; dismiss(): void }) => unknown
}>()

const label = shallowRef<string>()
let timer: ReturnType<typeof setTimeout> | undefined

function dismiss() {
  clearTimeout(timer)
  label.value = undefined
}

function undo() {
  dismiss()
  props.history.undo()
}

watch(
  () => props.history.undoLabel.value,
  (value) => {
    clearTimeout(timer)
    label.value = value
    if (value) timer = setTimeout(dismiss, props.timeout)
  },
)
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div v-if="label" class="orb-undo-toast" data-orb-part="undoToast" role="status">
    <slot name="undo-toast" :label="label" :undo="undo" :dismiss="dismiss">
      <span>{{ label }}</span>
      <button type="button" class="orb-button" @click="undo">{{ undoText }}</button>
    </slot>
  </div>
</template>
