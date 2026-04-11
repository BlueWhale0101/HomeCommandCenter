
# Home Command Center v2.6.1

## Overview

v2.6.1 is the second Phase D build for the Command Center. It keeps the v2.6.0 priority engine, then adds a lightweight cooldown and suppression layer so the top derived signal stays useful without bouncing around too quickly.

This build was patched from the provided v2.6.0 full file set baseline.

## What changed

### 1. Derived-signal cooldown
The highest-priority derived signal now gets a short hold window after it becomes visible:

- warning-level derived signals hold for about 10 minutes
- notice/info derived signals hold for about 15 minutes

If another derived signal appears during that hold window but is only slightly stronger, the current visible derived signal stays in place. This makes the system feel calmer and less twitchy.

### 2. `All clear` suppression
`All clear` is now deliberately quieter. After a meaningful derived signal has surfaced, `All clear` is suppressed for a while instead of immediately replacing it the moment conditions dip below a threshold.

This avoids the awkward pattern where the system flips from a warning/notice to `All clear` too fast.

### 3. No change to DB or IO behavior
The cooldown memory is stored locally in browser storage only. There are:

- no new queries
- no polling changes
- no schema changes
- no backend writes for the memory layer

## What did not change

- signal scoring still uses the v2.6.0 priority model
- only one derived signal is still shown at a time
- DB-backed and existing synthetic signals still render normally
- Garden Board remains untouched

## Files updated

- `app.js`
- `index.html`
- `sw.js`
- `README.md`

## Version updates

- `APP_VERSION = '2.6.1'`
- `<meta name="app-version" content="2.6.1">`
- `CACHE_VERSION = '2.6.1'`

## Suggested test pass

### Cooldown feel
- create two nearby derived conditions, such as a heavy day plus mild stale freshness
- confirm the visible derived signal does not keep swapping back and forth quickly

### Stronger signal takeover
- while a milder derived signal is visible, create a clearly stronger condition such as multiple overdue tasks
- confirm the stronger signal can still take over

### All clear calmness
- clear a warning/notice condition
- confirm `All clear` does not instantly replace it in a jarring way

### Regression check
- existing signal snooze/dismiss still works
- Needs Attention ordering still feels sensible
- Don’t Forget remains distinct from Needs Attention

## Phase D status

This build makes the new intelligence layer calmer. The next likely Phase D step is restrained contextual escalation or suggestion-style summaries, but only if testing shows they add value without increasing noise.
