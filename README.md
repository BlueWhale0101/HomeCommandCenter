# Household Command Center

A separate PWA shell for the new household dashboard, designed to use the same Supabase project as the current task board without breaking backward compatibility.

## What this starter includes

- Separate app shell and deploy target
- Device profile boot flow using `device_profiles`
- Realtime subscriptions to:
  - `tasks`
  - `household_logs`
  - `household_signals`
  - `laundry_loads`
  - `context_snapshots`
- Fixed mode layouts built from reusable widgets for:
  - TV
  - Kitchen
  - Laundry
  - Bedroom
  - Mobile
- One-tap quick logs into `household_logs`
- Multi-load laundry workflow using `laundry_loads`
- PWA manifest and service worker


## Architecture note

This starter now uses a **reusable widget architecture** with fixed per-mode layout definitions.

- Widgets are shared building blocks like Today, Spotlight, Signals, Context, Quick Actions, and Laundry.
- Modes such as Kitchen, TV, Laundry, Bedroom, and Mobile are just fixed widget lists for now.
- Later, this can evolve into per-device configurable widget ordering without breaking the core rendering model.

## Google Calendar plan

The app is ready to consume calendar data through `context_snapshots`.

When you are ready to add Google Calendar API support, the clean path is:

1. Fetch events from Google Calendar in a separate sync job or edge function.
2. Store a simplified snapshot in `context_snapshots` under types like `calendar_today` and `calendar_tomorrow`.
3. Keep the room widgets reading those snapshots, so the display layer stays simple and fast.

This keeps Google Calendar integration isolated from the UI and preserves compatibility with the current task board.

## Important compatibility note

This app does **not** modify your existing task schema. It reads the existing `tasks` table and writes only to the new additive household tables, unless you later choose to add task write actions.

## First-run setup

Open Settings and enter:

- Supabase URL
- Supabase anon key
- Device name
- Mode and location

Also set the task field mapping to match your current board schema.

Defaults assume these task fields:

- title: `task`
- owner: `owner`
- due date: `due_date`
- completed: `completed`

If your current schema uses different field names, update them in Settings.

## Snapshot format suggestion

This starter expects the `context_snapshots.payload` JSON to roughly look like:

### `weather_today`
```json
{
  "summary": "22°C · Rain later"
}
```

### `calendar_today` or `calendar_tomorrow`
```json
{
  "items": [
    { "title": "Birthday planning", "time": "3:00 PM" }
  ]
}
```

## Next recommended build steps

1. Replace manual field mapping with a small config file once your task schema is final.
2. Add task completion from kitchen mode.
3. Add basic signal generation logic.
4. Add nicer room-specific themes.
5. Add TV rotation / auto-refresh polish.

## Deployment

This app is designed to be deployable on GitHub Pages or any static host.
