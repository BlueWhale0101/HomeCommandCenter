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
- Mode rendering for:
  - TV
  - Kitchen
  - Laundry
  - Bedroom
  - Mobile
- One-tap quick logs into `household_logs`
- Multi-load laundry workflow using `laundry_loads`
- PWA manifest and service worker

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
- completed: `done`

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
