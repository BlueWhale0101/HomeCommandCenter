
# Home Command Center v2.6.2

## Overview

v2.6.2 is the third Phase D build for the Command Center. It keeps the priority engine and cooldown layer from 2.6.0–2.6.1, then adds a small contextual-intelligence pass so the top derived signal is not just important, but more informative.

This build was patched from the provided v2.6.0/2.6.1 full file set baseline.

## What changed

### 1. Combined backlog-pressure signal
A new derived signal can now surface when overdue work and in-motion work are both elevated at the same time:

- title: `Work is starting to back up`
- trigger: at least 2 overdue tasks and 4 in-motion tasks
- purpose: detect spreading work, not just isolated overdue load

This gives the system a better way to describe real pressure states than showing a generic overdue or in-motion message alone.

### 2. Owner-aware pressure descriptions
Existing task-pressure signals are now more contextual in their descriptions. When one owner clearly dominates a pressure state, the signal will say so in a restrained way, for example:

- `Mostly Wes's items.`
- `Mostly Skye's items.`

This does **not** add new owner-ranking UI or change task ownership logic. It only improves the wording of the existing derived signals.

### 3. Cooldown winner selection is now shared
The derived-signal chooser is now explicit instead of being embedded inline in the task-signal builder. This keeps the 2.6.1 calmness behavior while making it easier to add smarter derived signals without reintroducing flicker.

## What did not change

- no new queries
- no polling changes
- no schema changes
- no backend writes for intelligence logic
- only one derived signal is still shown at a time
- Garden Board remains untouched

## Files updated

- `app.js`
- `index.html`
- `sw.js`
- `README.md`

## Version updates

- `APP_VERSION = '2.6.2'`
- `<meta name="app-version" content="2.6.2">`
- `CACHE_VERSION = '2.6.2'`

## Suggested test pass

### Combined pressure
- create at least 2 overdue tasks and 4 in-motion tasks
- confirm `Work is starting to back up` can win over milder derived signals

### Owner-aware descriptions
- create a pressure state where one owner clearly dominates the overdue or in-motion tasks
- confirm the description includes `Mostly <owner>'s items.`
- confirm mixed-owner pressure states stay neutral

### Calmness regression
- while a derived signal is held, introduce a slightly stronger one and confirm the cooldown still prevents jitter
- introduce a clearly stronger signal and confirm it can still take over

## Phase D status

This build adds the first restrained contextual layer to the priority engine. The next likely step is either a very small suggestion-style signal pass or a stop point, depending on whether this added context feels useful in real household use.
