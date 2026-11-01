<script setup lang="ts">
/** A list of calendars with a toggle each, for `useCalendars`. */
export interface LegendLayer {
  id: string | number
  label: string
  color?: string
  visible: boolean
  count?: number
}

defineProps<{ layers: readonly LegendLayer[] }>()
const emit = defineEmits<{ toggle: [id: string | number] }>()

defineSlots<{
  legend?: (props: { layers: readonly LegendLayer[]; toggle(id: string | number): void }) => unknown
  'legend-item'?: (props: { layer: LegendLayer; toggle(): void }) => unknown
}>()
</script>

<template>
  <slot name="legend" :layers="layers" :toggle="(id: string | number) => emit('toggle', id)">
    <ul class="orb-legend" data-orb-part="legend">
      <li v-for="layer in layers" :key="layer.id" data-orb-part="legendItem">
        <slot name="legend-item" :layer="layer" :toggle="() => emit('toggle', layer.id)">
          <label
            class="orb-legend__item"
            :style="layer.color ? { '--orb-event-color': layer.color } : undefined"
          >
            <input type="checkbox" :checked="layer.visible" @change="emit('toggle', layer.id)" />
            <span class="orb-legend__swatch" aria-hidden="true" />
            {{ layer.label }}
            <small v-if="layer.count !== undefined">{{ layer.count }}</small>
          </label>
        </slot>
      </li>
    </ul>
  </slot>
</template>
