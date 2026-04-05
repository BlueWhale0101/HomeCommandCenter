
# Household Command Center

A separate PWA for ambient household awareness and low-friction room-based interaction, built against the same Supabase project as the existing task board while preserving backward compatibility.

## Project status

Current working status:
- TV view is the default landing screen and is tuned for across-room readability.
- Kitchen view is the richer operational view and is allowed to scroll.
- Laundry and Bedroom modes exist as secondary surfaces.
- Settings can autoload from `settings.json` on first run.
- Dev console is available by long-pressing the version pill.
- Realtime is wired for tasks, household logs, signals, laundry loads, and context snapshots.

Current focus:
- Bedroom first-pass polish
- Laundry refinement from real use
- Rule-based household reminder signals (starting with bins)

## Build notes

### Versioning
Every build should bump all of the following together:
- `APP_VERSION` in `app.js`
- version badge text in `index.html`
- service worker cache name in `sw.js`
- ZIP filename

### Deployment notes
- This app is designed for static hosting such as GitHub Pages.
- `settings.json` can be hosted beside the app for first-run autoload.
- TVs should use TV mode as the default no-interaction landing view.
- Kitchen is intentionally more detailed and can scroll.

### Debugging notes
- Long-press the version pill to open the dev console.
- Startup issues typically surface there first.
- If Supabase fails to load, the app should now show a clearer startup error instead of silently hanging.

## Data schema overview

The app reads your existing `tasks` table and writes new data to additive household tables.

### Existing table: `tasks`
The app reads task rows from the shared task board schema.

Important fields currently observed in your board:
- `id`
- `title`
- `owner`
- `due_text`
- `panel`
- `completed_at`
- `archived`
- `archived_at`
- `tag`
- `recurrence`

Filtering rules currently exclude tasks that are:
- `panel = done`
- `panel = archived`
- `completed_at` present
- `archived = true`
- `archived_at` present

### New table: `household_logs`
Used for one-tap quick actions such as:
- kitchen cleaned
- dishes done
- bins out

### New table: `household_signals`
Used for attention items such as:
- bins likely due
- laundry building up
- kitchen reset due

### New table: `laundry_loads`
Used for multiple concurrent laundry loads with simple states such as:
- washing
- drying
- ready
- done

### New table: `device_profiles`
Used for assigning a device to a mode and location, such as:
- TV
- Kitchen
- Laundry
- Bedroom
- Mobile

### New table: `context_snapshots`
Used for cached external context such as:
- weather today
- calendar today
- calendar tomorrow

## View roles

### TV
- passive awareness
- weather, next event, today, attention, tomorrow/focus
- should fit on one screen

### Kitchen
- richer operational view
- weather and next event at the top
- quick actions near the top
- blended today list
- can scroll

### Laundry
- multi-load workflow tracking
- designed around low-friction state progression
- now includes a summary card, clearer next-step hints, and laundry-specific recent activity

### Bedroom
- calm time-oriented view
- weather and next event at the top
- blended today/tomorrow list depending on time of day
- gentle reminder layer beneath the primary list

## Google Calendar plan

The intended integration path is:
1. fetch Google Calendar data separately
2. write simplified calendar snapshots into `context_snapshots`
3. keep the UI reading only snapshots

That keeps the widget layer simple and avoids coupling view code directly to Google APIs.

## Next steps
- Continue kitchen refinement from real use
- Improve quick views for all tasks and all events
- Polish laundry workflow
- Add Google Calendar snapshot sync

- v0.8.4-dev: smaller blue quick-action buttons, toast feedback, tap animation, cleaner quick-view dialog.
- v0.9.3-dev: first laundry polish pass with a workflow summary, stronger load rows, and laundry-specific recent activity.


## v0.9.3-dev notes
- Laundry state colors increased for clearer scanning.
- Laundry summary counters compacted and the Done counter removed.
- Replaced Recent Laundry Activity with workflow-first laundry signals:
  - flag when an active load has not moved for 90+ minutes
  - flag when no laundry activity has happened for over a day


## v0.9.3 notes
- Laundry counters compressed into a single no-wrap horizontal workflow row.
- Laundry page shows only actionable laundry signals, while generic in-progress laundry signals continue to feed other views.
- Developer console now supports a test time override for simulating future behaviors.


## v0.9.4-dev notes
- Laundry counters now stay on one compact horizontal row with larger numerals and a stronger left-to-right workflow feel.
- Bedroom first pass now puts Weather & Next Event at the top and uses a blended primary list for day/evening orientation.
- Next signal candidate: a rule-based Wednesday night bins reminder that stays visible in multiple views instead of getting buried as an ordinary task.


## Reminder rule notes

Current first rule-based reminder:
- **Wednesday bins** signal
  - active from **5:00 PM local time on Wednesday**
  - visible on **TV, Bedroom, and Kitchen**
  - clears automatically once a `bins_out` quick log is recorded that day

## Time-based presentation notes

Current presentation-phase behavior:
- **Evening starts at 5:00 PM local time**
- Bedroom and TV can shift to a more tomorrow-focused presentation during the evening
- Dev-console **test time** can be used to simulate this behavior safely
