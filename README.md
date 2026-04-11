# Home Command Center v2.5.2

Phase: C — Signals

## Build summary
v2.5.2 is the short closeout build for the current Command Center–only Phase C work. It expands the derived client-side signals layer without adding queries, schema changes, or backend complexity.

This build was patched from the provided v2.5.0 full file set baseline and includes a panel usefulness review for **Needs Attention** vs **Don’t Forget**.

## What changed

### 1. New derived signals
This build adds two higher-value derived signals:

- **Display may be stale / Live data is aging**
  - Uses existing task freshness diagnostics
  - Surfaces when task data is stale or aging
  - Helps catch screens that look healthy but are no longer fresh

- **A lot is already in motion**
  - Triggers when many tasks are already in the `In Motion` panel
  - Helps surface work-in-progress pressure before more work is started

### 2. Calmer derived signal tuning
This build also carries forward the calmer thresholds intended for 2.5.1:

- **Heavy day** now starts at **7** due-today tasks
- **Very full day** now starts at **10** due-today tasks
- A single overdue item usually stays **notice**
- Overdue escalates to **warning** at **2+ overdue tasks** or **3+ days old**
- Only the **single highest-priority derived signal** is shown at a time

Current derived signal priority:
1. stale tasks
2. overdue pressure
3. today load
4. in-motion pressure
5. all clear

### 3. Panel usefulness review: Needs Attention vs Don’t Forget
Review result: the two panels were functionally overlapping.

Before this build:
- **Needs Attention** showed active signals
- **Don’t Forget** also reused top active signals, so the content often repeated

After this build:
- **Needs Attention** remains the place for active signals and warnings
- **Don’t Forget** now focuses on gentle, forward-looking reminders:
  - tomorrow items
  - coming-up-soon items
- **Don’t Forget no longer mirrors active signals**

This makes the panels meaningfully distinct:
- **Needs Attention** = act or check now
- **Don’t Forget** = keep this in mind soon

## Files included
- `app.js`
- `index.html`
- `sw.js`
- `README.md`

## Versioning
- `APP_VERSION = '2.5.2'`
- `<meta name="app-version" content="2.5.2">`
- `CACHE_VERSION = '2.5.2'`

Service worker behavior remains:
- `self.skipWaiting()`
- `clients.claim()`

## Testing checklist

### Derived signals
- one overdue task → overdue signal appears as notice
- 2+ overdue tasks → overdue signal escalates to warning
- 7 due-today tasks and no overdue → heavy day appears
- 10 due-today tasks and no overdue → very full day warning appears
- 5+ tasks in `In Motion` and no higher-priority condition → in-motion pressure appears
- stale or aging task freshness → stale/aging signal appears and overrides lower-priority derived signals
- no due-today or overdue tasks and no other signals → all clear appears

### Panel distinction
- **Needs Attention** should show active signals only
- **Don’t Forget** should show tomorrow / coming-up reminders
- the same signal should no longer appear in both panels just because it is the top signal

## Recommendation after this build
Phase C can reasonably be treated as complete after validation, unless you want one more very small signal-only pass. The current signal set should now be strong enough to move on to another phase without growing the Command Center into a noisy dashboard.
