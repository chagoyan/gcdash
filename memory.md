# GCDash — Project Memory

## Project Overview

**GCDash** is a client-side Google Classroom dashboard built by Manuel Chagoyan, technology teacher at Coalinga High School. Hosted on Netlify with GitHub CI/CD. No server — everything runs in the browser. Manuel works on a MacBook with zsh shell.

**Live URL:** https://gcdash.netlify.app
**Stack:** Vanilla JS, HTML, CSS, Google OAuth (GIS), Google Classroom API, Google Drive API, localStorage

---

## Files

| File           | Purpose                                                           |
| -------------- | ----------------------------------------------------------------- |
| `index.html`   | GCDash main dashboard page                                        |
| `app.js`       | GCDash main app logic                                             |
| `styles.css`   | GCDash styles (not modified — changes go in index.html `<style>`) |
| `config.js`    | Google OAuth Client ID (gitignored, shared between pages)         |
| `seating.html` | Full seating chart page (self-contained)                          |
| `logo.png`     | CHS Technology Pathway logo                                       |
| `netlify.toml` | Netlify config                                                    |
| `build.js`     | Build script                                                      |

---

## Architecture

### Auth Flow

- GCDash uses Google Identity Services (GIS) for OAuth
- On login: `handleToken()` stores token in `localStorage('gcdash-token-handoff')`
- Seating chart reads `gcdash-token-handoff` on load, clears it, skips login
- On return to GCDash: `goHome()` writes token to `localStorage('gcdash-return-token')`
- GCDash load handler reads `gcdash-return-token`, clears it, calls `fetchCourses()`
- Sessions preserved in `sessionStorage('gcdash-access-token')`

### Google Drive Sync

- Scope: `drive.file` (self-authorized in Google Cloud Console — no IT needed)
- File: `.gcdash-config/settings.json` in user's Drive
- Stores: `courseColors`, `courseOrder`, `seatingLayouts`, `roomLayouts`, `seatingMetaLabels`
- Both pages merge before writing to avoid overwriting each other's keys
- Triggered 1.5s debounced after any save action

### OAuth Scopes

```
classroom.courses.readonly
classroom.rosters.readonly
classroom.coursework.students.readonly
classroom.student-submissions.students.readonly
classroom.profile.emails
drive.file
```

---

## GCDash Dashboard (index.html + app.js)

### Features

- Course cards with color coding, drag-to-reorder
- Active / Archived / Other tabs (Declined removed — useless)
- Student progress monitor with grade color tiers
- Assignment and material fetching
- Print course outlines
- Email students via Gmail compose URL
- Google Drive sync for course colors and order
- Sign out link (top right, subtle)
- Seating Chart button (only shown for Active courses)
- Spinner while returning from seating chart

### Grade Tiers

- 🟢 On track: > 75%
- 🟡 Watch: 61–75%
- 🔴 At risk: ≤ 60%
- ⚫ No data: gray

### Mobile Behavior

- Email buttons hidden on touch devices (`IS_TOUCH` detection)
- Earned/Possible column hidden in portrait mode (`orientation: portrait` + `max-width: 768px`)
- `IS_TOUCH = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0)`

### Key localStorage Keys

| Key                        | Purpose                                                       |
| -------------------------- | ------------------------------------------------------------- |
| `gcdash-token-handoff`     | Token written by app.js, read by seating.html                 |
| `gcdash-return-token`      | Token written by seating.html goHome(), read by app.js        |
| `gcdash-seating-course`    | Course ID passed from GCDash to seating chart for auto-select |
| `gcdash-grades-{courseId}` | Grade cache (10 min TTL)                                      |

---

## Seating Chart (seating.html)

### Features

- Google Classroom roster + grade loading
- Grade color-coded desk cards
- Drag-and-drop on desktop (atomic swap when dropping on occupied desk)
- Resize rows/columns with drag handles
- Aisle detection: columns/rows < 32px (MIN_SIZE \* 2)
- Room layouts saved and synced to Drive
- Multi-class print in landscape
- Student picker modal (click empty desk)
- Alphabetical / random assign
- Reset all seats
- Student name = clickable email link (desktop only)
- Sign out → redirects to GCDash
- Logo click → goHome() → GCDash with token handoff
- Auto-select course passed from GCDash

### Constants

```javascript
DESK_W = 118; // default desk width px
DESK_H = 76; // default desk height px
GAP = 10; // grid gap px
MIN_SIZE = 16; // minimum col/row size px
// Aisle threshold: MIN_SIZE * 2 = 32px
```

### Device Detection

```javascript
const IS_TOUCH = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const IS_TABLET = IS_TOUCH && window.screen.width >= 768;
const IS_PHONE = IS_TOUCH && window.screen.width < 768;
```

Note: viewport is `width=1200` (fixed) so `window.innerWidth` always reports 1200.
Use `window.screen.width` for device detection.

### Phone Mode (IS_PHONE)

- View-only — no editing controls
- Desktop layout renders at 1200px, pinch-to-zoom to navigate
- No drag, no tap interaction
- Email links disabled

### Tablet Mode (IS_TABLET)

- Editing controls hidden (save, assign, settings, print, resize handles)
- **Long press** (~500ms) occupied desk → selects it (orange ring + vibration)
- **Short tap** any other desk → confirm dialog (swap or move)
- **Tap unseated student** in roster → selects them (orange highlight)
- **Tap empty desk** with roster student selected → confirm move
- Auto-saves to localStorage + Drive after every confirmed move
- Toast: "Seating chart saved." after each move
- `user-select: none` on all desks and chips to prevent text selection

### Desktop Mode

- Full drag-and-drop
- Atomic swap when dragging to occupied desk
- Click empty desk → student picker modal
- Manual Save Seating Chart button

### localStorage Keys (Seating)

| Key                         | Purpose                                                      |
| --------------------------- | ------------------------------------------------------------ |
| `gcdash-seating-{courseId}` | Saved layout: seats, rows, cols, colWidths, rowHeights, room |
| `gcdash-seating-rooms`      | Room layout presets                                          |
| `gcdash-seating-settings`   | Default grid size, meta field labels                         |
| `gcdash-grades-{courseId}`  | Grade cache (10 min TTL)                                     |

### Print

- Multi-class print modal — select classes, click Print
- Opens `about:blank` window with landscape CSS
- Uses `fr` units proportional to saved `colWidths` for columns
- Aisles rendered as fixed `24px` columns
- Grade colors preserved in print (`print-color-adjust: exact`)
- **Known issue:** Print colTpl debug log never fires — investigating duplicate code path

---

## Todo List

### Active

1. **Help / info icon on seating.html** — add a help icon (ⓘ or ?) to the seating chart toolbar that opens an in-page guide covering the room setup and student assignment workflow.
2. **Sync attendance/tardies and Quick Links across devices** — Absence/Tardy indicators and Quick Links (`gcdash-quick-links`) currently only apply to localStorage; needs Drive sync (like `courseColors`/`seatingLayouts`).

### Parking Lot

2. **Aeries API integration** — populate student meta fields (Language Fluency, Program, Attendance, IEP/504). Requires IT approval. Revisit after teacher adoption.
3. **Aesthetic review** — consider aligning with Google Classroom / Aeries aesthetics after real-world teacher feedback.

### Completed ✅

- Google Drive sync
- Seamless navigation (token handoff, no double login)
- Spinner on return to GCDash
- Hide email button on touch devices
- Student email links from seating chart desk cards
- Sign out on both pages
- Seating chart mobile view-only mode (desktop viewport, pinch-to-zoom)
- Hide Earned/Possible column in portrait mobile
- Seating chart tablet mode (long press → select, tap → move/swap, auto-save)
- Tap roster student to place on empty desk (tablet)
- Atomic swap on desktop drag-and-drop
- Prevent text selection on touch (user-select: none)
- Remove Declined tab
- Hide Seating Chart button for non-Active courses
- Auto-select course in seating chart from GCDash
- Print default to current class only
- Desk designation system (Edit Room mode — desks vs space)
- Room is source of truth for desk layout (all classes using a room share desk positions)
- Disabled col/row resize dragging (aisles via empty columns/rows)
- Toolbar reordered to match logical workflow
- Print uniform cell sizes (1fr for all columns/rows)

---

## Key Decisions & Learnings

- `drive.file` scope can be self-authorized — no IT needed
- `window.screen.width` for device detection (not `window.innerWidth` — affected by viewport meta)
- `width=1200` viewport on seating chart = desktop layout on all devices
- Seating chart uses `touchend` + `touchstart` (not `click`) for reliable iOS interaction
- `user-select: none` essential to prevent text selection on touch
- Long press (500ms) is the right UX pattern for selection on iOS
- Auto-save on tablet preferred over manual save
- `placeStudent()` does atomic swap — finds old seat, swaps occupant back
- Template literal `<script>` tags must be split as `<scr` + `ipt>` to avoid parser issues
- Always run `node --check` on extracted JS before pushing

---

## Google Cloud Console Setup

- Project: GCDash (or similar)
- OAuth Client ID in `config.js` (gitignored)
- Authorized origins: `https://gcdash.netlify.app`, `http://localhost:8080`
- Scopes added under Data Access → non-sensitive: `drive.file`, `classroom.*`
- No IT approval needed for current scope set
