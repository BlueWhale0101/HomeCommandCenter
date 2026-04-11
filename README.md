# Home Command Center v2.6.0

## Overview

v2.6.0 is the first Phase D build for the Command Center. It adds a lightweight, fully client-side priority engine for signal ordering so the system does a better job choosing what matters most right now without adding IO, schema changes, or backend complexity.

This build was patched from the provided v2.5.2 full file set baseline.

## What changed

### 1. Signal priority scoring
A new `scoreSignalPriority()` helper gives each visible signal a deterministic priority score. The score is intentionally simple and explainable. It favors:

- warning severity over notice/info
- task-linked and task-located signals over ambient low-value reminders
- stale-data warnings when freshness is truly at risk
- older / larger overdue pressure over milder load reminders
- `All clear` only when nothing more important is visible

### 2. Smarter derived-signal winner selection
Phase C showed only one derived signal at a time using fixed precedence. In 2.6.0 that choice is now score-based. This means:

- stronger overdue pressure can outrank a generic stale notice
- a truly stale display warning can still outrank weaker task reminders
- very full day beats a milder heavy-day state
- in-motion pressure becomes more prominent when overdue work already exists

### 3. Better Needs Attention ordering
The visible signal list is now sorted by the same scoring model, not severity-only alphabetical order. This keeps the most important signal at the top more reliably.

## What did not change

- no new queries
- no polling changes
- no schema changes
- no new panels
- no Garden Board changes

## Files updated

- `app.js`
- `index.html`
- `sw.js`
- `README.md`

## Version updates

- `APP_VERSION = '2.6.0'`
- `<meta name="app-version" content="2.6.0">`
- `CACHE_VERSION = '2.6.0'`

## Suggested test pass

### Signal ordering
- one stale freshness condition plus one overdue task → the more important one should surface first
- several overdue tasks → overdue pressure should rise above milder reminders
- 10+ today tasks and no overdue → `Very full day` should outrank low-value notices
- 5+ in-motion tasks with overdue work also present → in-motion pressure should become more competitive

### Calmness
- only one derived signal should still appear at a time
- `All clear` should only appear when nothing more important is active
- existing synthetic and DB-backed signals should still render and snooze/dismiss as before

## Phase D status

This is the foundation build for Phase D. The next likely step is cooldown/suppression logic so the highest-priority signal stays useful without becoming repetitive.
