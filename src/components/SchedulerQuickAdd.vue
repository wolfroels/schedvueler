<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { Temporal, parseQuickAdd, type QuickAddResult } from '../core'

/** An input for text such as "Lunch friday 12:30 for 1h". Emits what it understood. */
const props = defineProps<{
  /** Your own reader. Default `parseQuickAdd`. */
  parser?: (text: string) => QuickAddResult
  /** The date that "today" means. Default today. */
  today?: Temporal.PlainDate
  locale?: string
  placeholder?: string
}>()

const emit = defineEmits<{ add: [result: QuickAddResult] }>()

defineSlots<{
  'quick-add'?: (props: {
    text: string
    setText(value: string): void
    preview: QuickAddResult | undefined
    submit(): void
  }) => unknown
}>()

const text = shallowRef('')
const read = (value: string) =>
  props.parser
    ? props.parser(value)
    : parseQuickAdd(value, {
        today: props.today ?? Temporal.Now.plainDateISO(),
        locale: props.locale,
      })
const preview = computed(() => (text.value.trim() ? read(text.value) : undefined))

function submit() {
  if (!preview.value) return
  emit('add', preview.value)
  text.value = ''
}
</script>

<template>
  <slot
    name="quick-add"
    :text="text"
    :set-text="(value: string) => (text = value)"
    :preview="preview"
    :submit="submit"
  >
    <form class="orb-quick-add" data-orb-part="quickAdd" @submit.prevent="submit">
      <input
        v-model="text"
        class="orb-quick-add__input"
        type="text"
        :placeholder="placeholder ?? 'Lunch friday 12:30 for 1h'"
        :aria-label="placeholder ?? 'Add an event'"
      />
      <small v-if="preview" class="orb-quick-add__preview">{{ preview.start.toString() }}</small>
    </form>
  </slot>
</template>
