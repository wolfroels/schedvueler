<script setup lang="ts">
import { computed, onServerPrefetch, ref } from 'vue'
import { useSchedulerContext } from '../composables/context'
import { useToolbar } from '../composables/useToolbar'
import { RenderSlot } from './RenderSlot'

const ctx = useSchedulerContext()
const toolbar = useToolbar(ctx)
// The views come after the toolbar and register while rendering. Waiting a tick on the server lets
// them do so first, so the title and view buttons are in the HTML. `<Scheduler>` does the same when
// hydrating.
onServerPrefetch(() => Promise.resolve())
// Reading slotsVersion re-renders the toolbar when the scheduler receives new slot functions.
const slot = (name: string) => {
  void ctx.slotsVersion.value
  return ctx.slots[name]
}

const limit = computed(() => ctx.options.value.raw.maxViewButtons ?? Infinity)
const buttons = computed(() => toolbar.value.views.slice(0, limit.value))
const overflow = computed(() => toolbar.value.views.slice(limit.value))

const picker = ref<HTMLInputElement>()
function openPicker() {
  const input = picker.value
  if (!input) return
  try {
    input.showPicker()
  } catch {
    input.focus()
  }
}
function onPick(e: Event) {
  const { value } = e.target as HTMLInputElement
  if (value) ctx.goTo(value)
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
              :disabled="!ctx.canStep(-1)"
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
              :disabled="!ctx.canStep(1)"
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
          <button
            v-if="ctx.options.value.raw.titleDatePicker"
            type="button"
            class="orb-toolbar__title-button"
            v-bind="ctx.part('titlePicker')"
            @click="openPicker"
          >
            <RenderSlot :fn="slot('title')" :scope="toolbar">{{ toolbar.title }}</RenderSlot>
          </button>
          <RenderSlot v-else :fn="slot('title')" :scope="toolbar">{{ toolbar.title }}</RenderSlot>
          <input
            v-if="ctx.options.value.raw.titleDatePicker"
            ref="picker"
            class="orb-toolbar__picker"
            type="date"
            tabindex="-1"
            aria-hidden="true"
            :value="ctx.date.value.toString()"
            :min="ctx.options.value.raw.minDate"
            :max="ctx.options.value.raw.maxDate"
            @change="onPick"
          />
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
            <template v-for="view in buttons" :key="view.name">
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
            <select
              v-if="overflow.length"
              class="orb-toolbar__view-menu"
              v-bind="ctx.part('viewMenu')"
              :aria-label="ctx.options.value.messages.moreViews"
              :value="overflow.find((v) => v.active)?.name ?? ''"
              @change="toolbar.setView(($event.target as HTMLSelectElement).value)"
            >
              <option value="" disabled>{{ ctx.options.value.messages.moreViews }}</option>
              <option v-for="view in overflow" :key="view.name" :value="view.name">
                {{ view.label }}
              </option>
            </select>
          </div>
        </RenderSlot>
      </RenderSlot>
    </div>
  </div>
</template>
