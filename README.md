
# Household Command Center

## v2.2.11
- Calendar and weather service cleanup pass.
- Centralized calendar connection and publisher-status state behind shared helpers.
- Centralized weather snapshot/freshness state behind a shared service helper for mobile/admin surfaces.
- Reused one snapshot freshness interpreter across calendar/weather status views.

## v2.2.2
- Stabilization baseline pass.
- Unified shipped version markers across `app.js`, `index.html`, and `sw.js`.
- Removed legacy calendar-auth wrapper patch and folded calendar connection status into the main mobile render path.
- Preserved mobile calendar/status visibility with a native connection summary card and banner refresh.


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


## v0.9.7-dev
- Wednesday bins reminder now starts at 12:00 PM on Wednesday.
- Bedroom view includes a lightweight Laundry card under the main Today/Tomorrow card so loads can be advanced without switching views.


## v1.0.2-dev notes
- First Google Calendar integration pass added for multiple Google accounts and selectable calendars per account.
- Calendar events are merged into shared household views with source labels like account and calendar name.
- This first pass uses browser-based Google auth and local account storage, so reconnecting may be needed after tokens expire.


## Weather integration

This build adds a first-pass weather integration using an Open-Meteo location lookup and forecast fetch. Enter a shared household weather location in Settings. The app resolves that location, fetches forecast data, and merges a weather snapshot into the existing context widgets.

## Google Calendar source labels

Event chips now use account display name + calendar summary and no longer include the raw email address.


## v1.0.2-dev notes
- Weather location lookup is more forgiving and now tries common Australia variants automatically.
- Weather display is cleaner and includes a compact tomorrow hint when useful in evening-oriented views.
- Event source chips no longer show raw email addresses.


## v1.1.0-dev
- Added a mobile control-panel view with Status, Logs, Calendar, Weather, and Debug tabs.
- Added a Supabase project shortcut in the mobile Logs tab.
- Weather location labels now use the town name only when available.


## v1.2.0-dev - Shared household config

This build adds the first shared config/control-plane layer.

### What it syncs
- Google OAuth client ID
- Connected Google Calendar accounts and selected calendars
- Shared weather location + resolved coordinates

### How it works
- Mobile can push shared config to the `household_config` table in Supabase.
- Other devices load that config on startup and subscribe to updates through Realtime.
- Supabase bootstrap config still comes from local settings or `settings.json`.

### Required SQL setup
Run the SQL in `household_config_setup.sql` to create the table and permissive anon policies for this shared-household setup.

### Notes
- Google access tokens are synced in this first pass so shared displays can read calendar events. Because browser access tokens expire, reconnecting on mobile may occasionally be needed.


## v1.2.1-dev
- Fixed weather sync reliability across devices using shared weather config.
- Devices now keep the last good weather snapshot if refresh fails instead of blanking the UI.
- Weather refresh now runs after shared snapshots load, preventing race conditions that caused weather to flicker on TVs.


## v1.2.3-dev
- Calendar reliability pass: adds diagnostics, silent token refresh attempts for expired Google accounts, and unified event merge logging.
- Updated HTML header and manifest to use padded root-level icon files (icon-180x180.png, icon-192x192.png, icon-512x512.png).


## v1.2.3-dev
- Added explicit per-device calendar connection status.
- Devices now show when Google Calendar needs reconnect locally.
- Added reconnect help in Mobile → Calendar.
- Corrected icon references to use the `icons/` folder path.


## v1.2.8-dev
- Headless calendar mode: connected devices publish merged calendar snapshots to `context_snapshots`.
- Unconnected TVs now consume shared snapshots instead of blanking or overwriting them.
- Added `context_snapshots_headless_setup.sql` for anon insert/select policies and realtime.


## Stabilization notes

### v2.2.3 cleanup pass
- normalized repeated mobile action-row/button construction behind shared helpers
- removed a few clearly unused helper paths left from earlier patch stacking
- preserved behavior while reducing duplicated UI wiring in Mobile tabs


### v2.2.5 cleanup pass
- unified Google Calendar account rendering behind a shared internal renderer for editable and read-only mobile views
- tightened task digest internals to reuse computed evening state and due-bucket results
- roadmap note added: easy reconnect flow for expired Google Calendar publisher sessions


### v2.2.7 cleanup pass
- normalized mobile tab wiring behind a shared tab registry with label, subtitle, and render definitions
- reduced repeated mobile stack/card assembly with small internal helpers for shared mobile composition
- reused the same inline action builders across weather, signals, debug, and log panels to keep mobile admin UI behavior aligned


## v2.2.7 cleanup pass
- normalized shared card/list composition helpers
- reused shared empty-state and pill builders across task, signal, and calendar admin UI
- kept behavior stable while reducing render duplication

## v2.2.8 cleanup pass

- normalized refresh paths around shared helpers for full refresh, targeted refresh, and shared UI rerendering
- added refresh deduping/queueing so overlapping realtime or manual refresh requests reuse a single in-flight cycle
- unified snapshot/shared-config targeted updates behind one path instead of ad hoc rerender calls
- added lightweight refresh-state visibility to Mobile → Debug

## v2.2.9 cleanup pass
- normalized signal assembly into a shared evaluation pipeline
- centralized bins/custom-rule/laundry signal evaluation helpers
- shared one signal sort path for stored + synthetic signals
- preserved signal behavior while reducing branching in render-time paths


## v2.2.10 cleanup pass
- normalized task intelligence internals around a shared `buildTaskIntelligenceContext(...)` path
- reused cached due-bucket state and shared selectors for task digest assembly
- consolidated snapshot-to-display mapping and tomorrow-window task selection helpers


## v2.2.11 cleanup pass
- centralized calendar publisher/connection status into shared service helpers
- normalized weather service state/freshness interpretation behind one shared path
- reduced drift between mobile status, calendar, and weather trust UI

## v2.2.13 cleanup pass
- clarified local-vs-shared config ownership behind shared helper paths
- centralized device profile apply/build logic for load and save flows
- normalized shared calendar/weather/signal config application into one local-state sync path
- preserved behavior while reducing config write/read drift

- v2.2.13: Hardened Realtime setup with shared channel specs, subscription diagnostics, scoped event handling, and clearer Mobile debug visibility.


## v2.2.14 cleanup pass

Wake lock/runtime hardening:
- v2.2.14: Centralized wake-lock lifecycle notes, retry/release diagnostics, startup sync, and added Mobile Debug visibility for wake-lock runtime state.

## v2.2.15 cleanup pass

Surface/runtime normalization:
- v2.2.15: Centralized per-surface definitions, body-class application, and screen layout lookup behind a shared surface registry so mode-specific runtime/layout behavior is less hand-wired.

Roadmap notes:
- Add per-device pixel-shift protection for always-on displays as a dedicated-display runtime feature near wake-lock/device-runtime hardening.
- Investigate headless calendar publisher push behavior during Phase 6 reliability work before implementing reconnect or publisher-flow fixes.
