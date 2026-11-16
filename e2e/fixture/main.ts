import { createApp } from 'vue'
import ExtrasPage from './ExtrasPage.vue'
import FixtureApp from './FixtureApp.vue'
import SsrPage from './SsrPage.vue'
// <SchedulerEventEditor>'s styles are optional and imported on their own.
import '../../src/styles/editor.css'

const page = new URLSearchParams(location.search).get('page')
createApp(page === 'extras' ? ExtrasPage : page === 'ssr' ? SsrPage : FixtureApp).mount('#app')
