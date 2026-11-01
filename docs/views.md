# Views

Every example here is live: drag, resize and select.

## Week and day

```vue
<WeekView />
<WeekView name="workweek" work-week />
<DayView />
<DayView name="three" :days="3" />
```

<SchedulerDemo view="week" />

## Month

```vue
<MonthView />
<MonthView name="two-weeks" :weeks="2" />
<MultiMonthView :months="3" />
```

<SchedulerDemo view="month" :height="620" />

## Year

`display` is `dots`, `heatmap` or `planner`, which has one row per month with event bars.

```vue
<YearView display="heatmap" />
<YearView display="planner" />
```

<SchedulerDemo view="year" :height="620" :view-props="{ display: 'planner' }" />

## Agenda

```vue
<AgendaView period="month" />
```

<SchedulerDemo view="agenda" :height="420" />

## Timeline

One row per resource, with rows and the axis virtualized.

```vue
<TimelineView period="week" :slot-duration="60" :header-tiers="['month']" minimap load />
```

<SchedulerDemo view="timeline" :height="360" :view-props="{ period: 'week', slotDuration: 60, slotWidth: 48, headerTiers: ['month'], minimap: true }" />

## Resource columns

```vue
<DayView name="crews" :resources="['crew-a', 'crew-b']" />
```

<SchedulerDemo view="day" :height="520" :view-props="{ resources: ['crew-a', 'crew-b', 'crane'] }" />

## Gantt

One row per event, with `progress`, milestones and arrows from `dependsOn`.

```vue
<GanttView />
```

<SchedulerDemo view="gantt" :height="360" />

## Your own

See [Custom views](/custom-views).
