# Home Command Center

Home Command Center is the ambient half of a shared household system. It is designed for TVs, wall tablets, and always-on displays that need to stay calm, readable, and trustworthy while still supporting a small set of high-value actions.

It works alongside **Garden Board**, which remains the primary place for active task creation and full task editing.

## Core goals

- ambient visibility for the household
- realtime-first behavior with minimal polling
- low backend IO for always-on devices
- trust through clear health surfaces
- light interaction without turning the display into a heavy app

## Current architecture

### Frontend
- Vanilla HTML, CSS, and JavaScript
- Progressive Web App deployed through GitHub Pages
- Service worker caching for installability and resilience

### Backend
- Supabase
- Shared Postgres database
- Realtime subscriptions

### Shared data model
Primary table: `tasks`

Expected task fields:
- `id`
- `household_id`
- `title`
- `owner`
- `due_text`
- `panel`
- `archived`
- `archived_at`
- `completed_at`
- `created_at`
- `updated_at`

Other tables in active use:
- `context_snapshots`
- `household_signals`
- `household_config`
- `device_profiles`
- `household_logs`
- `laundry_loads`

## System state by roadmap phase

### Phase A — Stabilize Baseline
Completed in the `2.3.x` era.

Key outcomes:
- startup stabilized
- realtime behavior normalized
- runaway query sources reduced
- IO monitoring added

### Phase A2 — Data Efficiency and Retention
Also part of the `2.3.x` era.

Current behavior:
- archived tasks are excluded from default queries
- archive loading is explicit and on-demand
- older completed tasks are trimmed from default live fetches
- query discipline is tighter across surfaces

### G-lite — Reliability Surfaces
Completed first pass in the `2.3.x` era.

Current trust surfaces include:
- realtime state clarity
- stale client and version mismatch visibility
- publisher health
- freshness states for major data classes
- degraded-state UX for ambient screens
- housekeeping results by table

### Phase B — Action and Trust
Starts in the `2.4.x` era.

Current Phase B progress:
- `2.4.0` one-tap task completion
- `2.4.1` completion undo
- `2.4.2` task detail entry via long press

## Interaction model

### Tasks
- **Tap**: mark task complete
- **Undo toast**: available for a short window after completion
- **Long press**: open task details quickly on the command surface

This keeps the command center useful for quick action while avoiding a heavy full-edit workflow.

## Versioning strategy

Each roadmap phase maps to the second version number:

- `2.3.x` — stabilization, A2, and G-lite
- `2.4.x` — Phase B: Action and Trust
- `2.5.x` — Phase C: Frictionless Input
- `2.6.x` — Phase D: Intelligence v2
- `2.7.x` — Phase E: Visual Polish
- `2.8.x` — Phase F: Household Clarity
- `2.9.x` — Phase G: Full Reliability

## Release discipline

Every behavior patch must update all of the following together:

### App version
In `app.js`:

```js
const APP_VERSION = '2.4.2';
```

### HTML version
In `index.html`:

```html
<meta name="app-version" content="2.4.2" />
```

And the visible version badge should match.

### Service worker cache version
In `sw.js`:

```js
const CACHE_VERSION = 'v2.4.2';
```

The service worker should continue to use immediate activation behavior so stale always-on displays do not linger on old logic:

```js
self.skipWaiting();
self.clients.claim();
```

## Reliability and degraded state

The UI should make it obvious when something is off without making the screen noisy.

Healthy state:
- no banner
- freshness reads as healthy
- realtime status is connected

Aging state:
- soft warning surfaces
- data is still usable, but attention may be needed

Degraded state:
- ambient banner appears
- cause is summarized briefly
- recovery hint is shown where possible

## Development guidance

Prefer:
- minimal high-impact changes
- reuse of existing data flow
- realtime over new polling
- explicit loading for old or low-value data

Avoid:
- backend redesign unless clearly necessary
- duplicate logic across apps
- loading archived or stale data by default
- changes that make always-on devices noisier

## Testing checklist

For each release:
- confirm visible version badge matches the release
- confirm service worker cache version matches
- verify stale-client mismatch detection still works
- verify task completion still writes cleanly
- verify undo still restores cleanly
- verify long press opens task details without accidental completion
- verify degraded-state UX stays calm on ambient displays

## Near-term roadmap

Phase B still open:
- faster edit flow
- signal dismiss or snooze
- clearer degraded-state interaction handling

Phase C later:
- better voice and GPT input flows
- improved tagging and natural language dates

Longer-term phases remain focused on intelligence, polish, and clearer shared household coordination.
