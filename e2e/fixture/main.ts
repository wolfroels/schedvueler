import { createApp } from 'vue'
import ExtrasPage from './ExtrasPage.vue'
import FixtureApp from './FixtureApp.vue'
import SsrPage from './SsrPage.vue'

const page = new URLSearchParams(location.search).get('page')
createApp(page === 'extras' ? ExtrasPage : page === 'ssr' ? SsrPage : FixtureApp).mount('#app')
