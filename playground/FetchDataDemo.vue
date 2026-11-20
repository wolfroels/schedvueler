<script setup lang="ts">
import { ref } from 'vue'
import { Scheduler, WeekView, type RangeChangePayload } from '../src'
import { AppointmentsClient, type AppointmentDto } from './api-client'

const client = new AppointmentsClient()
const events = ref<AppointmentDto[]>([])
const loading = ref(false)

const statusColors = { confirmed: '#16a34a', tentative: '#d97706', cancelled: '#9ca3af' }

// `startDate` / `endDate` are plain JS Dates, ready for a generated client. `start` / `end` hold
// the same range as Temporal.PlainDate (end exclusive) if your API takes date strings instead.
async function fetchData({ startDate, endDate }: RangeChangePayload) {
  loading.value = true
  try {
    events.value = await client.getAppointments(startDate, endDate)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Scheduler
    :events="events"
    :accessors="{
      title: (a) => a.subject,
      start: (a) => a.startsAt,
      end: (a) => a.endsAt,
      color: (a) => statusColors[a.status],
    }"
    :loading="loading"
    :week-start="1"
    @range-change="fetchData"
  >
    <WeekView :days="5" day-start-time="08:00" day-end-time="18:00" />
  </Scheduler>
</template>
