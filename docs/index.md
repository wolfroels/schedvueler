---
layout: home
hero:
  name: orb-scheduler
  text: A scheduler for Vue that stays yours
  tagline: Resource timelines, drag and drop and recurrence, free. Every part can be replaced with a slot or restyled with passthrough.
  actions:
    - theme: brand
      text: Get started
      link: /guide
    - theme: alt
      text: See the views
      link: /views
features:
  - title: Everything people pay for elsewhere
    details: Resource timeline, drag and drop, recurring events, Gantt with dependencies, availability rules.
  - title: Slots and passthrough on every element
    details: Replace what is inside with a slot, or add classes and attributes to anything with `pt`.
  - title: Headless when you want it
    details: The layout, rules and editing logic work without any markup, and the core works without Vue.
  - title: Fast
    details: Row, lane and axis virtualization. A timeline month with 20 000 events navigates in well under 100 ms.
  - title: Keyboard and screen readers
    details: Every drag has a keyboard and a click alternative. Checked with axe on every view, in both themes.
  - title: Time zones done right
    details: Built on Temporal, with wall-clock and exact times, RRULE, DST handling and iCalendar.
---

<SchedulerDemo view="week" />
