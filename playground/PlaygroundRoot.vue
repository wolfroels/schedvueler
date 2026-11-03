<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import App from './App.vue'
import PartsPage from './PartsPage.vue'
import ViewExamplesPage from './ViewExamplesPage.vue'

const hash = ref(location.hash)
const onHashChange = () => (hash.value = location.hash)
window.addEventListener('hashchange', onHashChange)
onBeforeUnmount(() => window.removeEventListener('hashchange', onHashChange))
</script>

<template>
  <PartsPage v-if="hash === '#/parts'" />
  <ViewExamplesPage v-else-if="hash === '#/timeline' || hash === '#/examples'" />
  <App v-else />
</template>
