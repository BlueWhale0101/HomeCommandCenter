# Home Command Center v2.7.3

## Overview

v2.7.3 starts **Phase E — Visual Polish**. This build does not add new logic, signals, or backend behavior. It tightens the visual hierarchy so the screen reads faster from a distance and fits a little more useful content into the same space.

This build was patched from the stable v2.6.3 startup-hotfix line.

## What changed

### 1. Stronger reading hierarchy
- task titles are heavier and slightly clearer
- metadata is smaller and dimmer
- card subtitles are quieter
- warning rows and overdue rows stand out more clearly

### 2. Denser task rows for ambient displays
- reduced list item padding slightly across TV, kitchen, and bedroom layouts
- tightened card header spacing and list gaps
- reduced quick-action button height slightly in kitchen mode

The goal is to show a bit more real content without redesigning the layout.

### 3. Cleaner panel separation
Cards now have subtle left-edge accents so major regions are easier to distinguish at a glance:
- **Needs Attention / Attention** → warm accent
- **Today** → green accent
- **Don’t Forget / Coming Up** → cooler reminder accent

### 4. Subtle owner recognition
Task rows now add a light owner tint using the row edge:
- **Wes** → green tint
- **Skye** → blue tint
- **shared/other** → neutral warm tint

This is intentionally light so it helps scanning without turning the screen into a dashboard of badges.

### 5. Softer signal emphasis
Signals still stand out, but info/notice rows are calmer than before. Warning rows remain the strongest signal treatment.

## Files updated
- `app.js`
- `index.html`
- `sw.js`
- `styles.css`
- `README.md`

## Version updates
- `APP_VERSION = '2.7.1'`
- `<meta name="app-version" content="2.7.1">`
- `CACHE_VERSION = '2.7.1'`

## Suggested test pass

### Distance readability
- stand a few metres away from the kitchen or bedroom display
- confirm the main task titles read faster than before
- confirm metadata feels less visually dominant

### Panel separation
- confirm **Needs Attention**, **Today**, and **Don’t Forget** are easier to distinguish at a glance

### Density
- compare how many rows are visible in kitchen and bedroom views
- confirm nothing feels cramped or harder to tap

### Owner recognition
- confirm Wes and Skye tasks are easier to tell apart without reading the owner text first

## Phase E status

This is the first Phase E build and is intentionally conservative. It improves readability and density without redesigning the layout or adding new interaction complexity.


## What changed in 2.7.3

### 1. Kitchen quick actions back to a single row
- quick action buttons now size to fit exactly one row in kitchen view
- spacing and text sizing were tightened so all four actions stay visible together
- buttons still remain large enough for ambient tap use

### 2. Trust info moved to the bottom of ambient layouts
- the ambient health / trust banner now renders after the main content instead of above it
- this keeps trust information available without making it the first thing the eye lands on
- banner typography was softened slightly so it reads more like footer diagnostics than a primary card

### 3. Roadmap notes from live-use feedback
The next layout-focused refinement round should explicitly include:
- **Kitchen**: another pass after a few days of real-world use
- **Bedroom**: keep the current direction, then refine from usage feedback
- **TV**: dedicated layout refinement, likely moving to a **3-column layout** for better space use

These are layout feedback items, not logic issues.

## Files updated in 2.7.3
- `app.js`
- `index.html`
- `sw.js`
- `styles.css`
- `README.md`


## Phase E follow-up roadmap
- Per-view refinement after several days of real use
- TV layout refinement: dedicated 3-column ambient layout
- Bedroom layout refinement from feedback
- Kitchen spacing/scroll refinement from real-world use
