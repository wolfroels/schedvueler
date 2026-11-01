# Changelog

Notable changes per version. Versions follow [semver](https://semver.org); before 1.0, a minor version can contain breaking changes.

## Unreleased

Everything so far. See [ROADMAP.md](ROADMAP.md) for what is done.

Things that behave differently from before this list started:

- All-day and month event bars are 1.5rem high, up from 1.375rem, so that they are large enough to tap.
- `event-drop` and `event-resize` carry `others`; `event-delete` carries `others` and `element`.
- Time grids have `role="grid"`, with days as rows.
