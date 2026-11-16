# Changelog

Notable changes per version. Versions follow [semver](https://semver.org); before 1.0, a minor version can contain breaking changes.

## Unreleased

This file records notable changes so far.

- `animate` is on by default. Set it to `false` for a static scheduler.
- Fixed: with `animate`, the dragged copy of an event no longer eases after each snap and trails the pointer, and a dropped event no longer glides from its old place a second time.
- `animate` now also slides a new period in from the side it lies on, eases views, popovers, the draft bar and the undo toast in, fades selections in and lifts the dragged event. Hover and selection colours ease in for everyone. Motion follows `--orb-ease`, `--orb-duration-fast` and `--orb-duration-enter`, and is off when the user prefers reduced motion.
- Fixed: on a timeline with a slot row or extra heading rows, the headings no longer spill over the first lane, where they blocked dragging.
- Fixed: the picture-in-picture button no longer causes a hydration mismatch.
- New `picture-in-picture` option (default on where supported): a toolbar button pops the scheduler out into a Document Picture-in-Picture window. Set it to `false` to hide the button.
- Fixed: on a timeline, clicking a slot or drag-selecting now snaps from `dayStartTime` instead of midnight. With a slot size that does not divide the day start (420-minute half days from 06:00), a click used to give 06:00-07:00 or 07:00-14:00 instead of 06:00-13:00 or 13:00-20:00.

Things that behave differently from before this list started:

- All-day and month event bars are 1.5rem high, up from 1.375rem, so that they are large enough to tap.
- `event-drop` and `event-resize` carry `others`; `event-delete` carries `others` and `element`.
- Time grids have `role="grid"`, with days as rows.
- `calendar` also applies to the multi-month and year views and the mini calendar; a year can have 13 months.
- `eventStackThreshold: 1` means the same as 2, as one event is no stack.
- Inside `<Scheduler>`, the built-in toolbar hydrates a tick after the views, and renders a tick later on first use.
