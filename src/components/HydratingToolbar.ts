import { defineAsyncComponent } from 'vue'
import SchedulerToolbar from './SchedulerToolbar.vue'

// The views come after the toolbar and register while hydrating. Hydrating the toolbar a tick later
// lets them, so it renders the same title and view buttons as on the server.
export const HydratingToolbar = defineAsyncComponent({
  loader: () => Promise.resolve(SchedulerToolbar),
  hydrate: (hydrate) => {
    void Promise.resolve().then(hydrate)
  },
})
