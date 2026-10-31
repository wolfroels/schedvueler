<script setup lang="ts">
import { useSchedulerContext } from '../composables/context'
import { useToolbar } from '../composables/useToolbar'
import { RenderSlot } from './RenderSlot'

const ctx = useSchedulerContext()
const toolbar = useToolbar(ctx)
// Reading slotsVersion re-renders the toolbar when the scheduler receives new slot functions.
const slot = (name: string) => {
  void ctx.slotsVersion.value
  return ctx.slots[name]
}
</script>

<template>
  <div class="orb-toolbar" v-bind="ctx.part('toolbar')">
    <div class="orb-toolbar__section orb-toolbar__section--start" v-bind="ctx.part('toolbarStart')">
      <RenderSlot :fn="slot('toolbar-start')" :scope="toolbar">
        <div class="orb-toolbar__nav">
          <RenderSlot
            :fn="slot('nav-prev')"
            :scope="{ prev: toolbar.prev, label: ctx.options.value.messages.previous }"
          >
            <button
              type="button"
              class="orb-button orb-button--icon"
              v-bind="ctx.part('prevButton')"
              :aria-label="ctx.options.value.messages.previous"
              :title="ctx.options.value.messages.previous"
              @click="toolbar.prev"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
            </button>
          </RenderSlot>
          <RenderSlot
            :fn="slot('nav-next')"
            :scope="{ next: toolbar.next, label: ctx.options.value.messages.next }"
          >
            <button
              type="button"
              class="orb-button orb-button--icon"
              v-bind="ctx.part('nextButton')"
              :aria-label="ctx.options.value.messages.next"
              :title="ctx.options.value.messages.next"
              @click="toolbar.next"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
            </button>
          </RenderSlot>
        </div>
        <RenderSlot
          :fn="slot('today-button')"
          :scope="{ today: toolbar.today, label: ctx.options.value.messages.today }"
        >
          <button
            type="button"
            class="orb-button"
            v-bind="ctx.part('todayButton')"
            @click="toolbar.today"
          >
            {{ ctx.options.value.messages.today }}
          </button>
        </RenderSlot>
      </RenderSlot>
    </div>

    <div
      class="orb-toolbar__section orb-toolbar__section--center"
      v-bind="ctx.part('toolbarCenter')"
    >
      <RenderSlot :fn="slot('toolbar-center')" :scope="toolbar">
        <h2 class="orb-toolbar__title" v-bind="ctx.part('title')" aria-live="polite">
          <RenderSlot :fn="slot('title')" :scope="toolbar">{{ toolbar.title }}</RenderSlot>
        </h2>
      </RenderSlot>
    </div>

    <div class="orb-toolbar__section orb-toolbar__section--end" v-bind="ctx.part('toolbarEnd')">
      <RenderSlot :fn="slot('toolbar-end')" :scope="toolbar">
        <RenderSlot :fn="slot('view-switcher')" :scope="toolbar">
          <div
            v-if="toolbar.views.length > 1"
            class="orb-segmented"
            v-bind="ctx.part('viewSwitcher')"
            role="group"
          >
            <template v-for="view in toolbar.views" :key="view.name">
              <RenderSlot :fn="slot('view-button')" :scope="{ view, setView: toolbar.setView }">
                <button
                  type="button"
                  class="orb-segmented__item"
                  :class="{ 'is-active': view.active }"
                  v-bind="ctx.part('viewButton', { view })"
                  :aria-pressed="view.active"
                  @click="toolbar.setView(view.name)"
                >
                  {{ view.label }}
                </button>
              </RenderSlot>
            </template>
          </div>
        </RenderSlot>
      </RenderSlot>
    </div>
  </div>
</template>
