<script setup lang="ts">
import { useSchedulerContext } from '../composables/context'
import { useToolbar } from '../composables/useToolbar'
import { RenderSlot } from './RenderSlot'

const ctx = useSchedulerContext()
const toolbar = useToolbar(ctx)
// Reading slotsVersion re-renders the toolbar when the scheduler receives new slot functions.
const slot = (name: 'toolbar-start' | 'toolbar-center' | 'toolbar-end' | 'title') => {
  void ctx.slotsVersion.value
  return ctx.slots[name]
}
</script>

<template>
  <div class="orb-toolbar">
    <div class="orb-toolbar__section orb-toolbar__section--start">
      <RenderSlot :fn="slot('toolbar-start')" :scope="toolbar">
        <div class="orb-toolbar__nav">
          <button
            type="button"
            class="orb-button orb-button--icon"
            :aria-label="ctx.options.value.messages.previous"
            :title="ctx.options.value.messages.previous"
            @click="toolbar.prev"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
          </button>
          <button
            type="button"
            class="orb-button orb-button--icon"
            :aria-label="ctx.options.value.messages.next"
            :title="ctx.options.value.messages.next"
            @click="toolbar.next"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
          </button>
        </div>
        <button type="button" class="orb-button" @click="toolbar.today">
          {{ ctx.options.value.messages.today }}
        </button>
      </RenderSlot>
    </div>

    <div class="orb-toolbar__section orb-toolbar__section--center">
      <RenderSlot :fn="slot('toolbar-center')" :scope="toolbar">
        <h2 class="orb-toolbar__title" aria-live="polite">
          <RenderSlot :fn="slot('title')" :scope="toolbar">{{ toolbar.title }}</RenderSlot>
        </h2>
      </RenderSlot>
    </div>

    <div class="orb-toolbar__section orb-toolbar__section--end">
      <RenderSlot :fn="slot('toolbar-end')" :scope="toolbar">
        <div v-if="toolbar.views.length > 1" class="orb-segmented" role="group">
          <button
            v-for="view in toolbar.views"
            :key="view.name"
            type="button"
            class="orb-segmented__item"
            :class="{ 'is-active': view.active }"
            :aria-pressed="view.active"
            @click="toolbar.setView(view.name)"
          >
            {{ view.label }}
          </button>
        </div>
      </RenderSlot>
    </div>
  </div>
</template>
