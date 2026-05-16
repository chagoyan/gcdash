# GCDash — Google Classroom Dashboard

A teacher dashboard that connects to the Google Classroom API to provide course outlines, student progress monitoring, seating chart management, and curriculum planning tools. Entirely client-side — no server, no database, no third-party data sharing.

Live: [https://gcdash.netlify.app](https://gcdash.netlify.app)

---

## Features

- **Course Management** — View all Google Classroom courses organized by Active, Archived, and Declined tabs
- **Drag-to-Reorder** — Drag course cards into your preferred order, synced via Google Drive
- **Color Coding** — Assign colors to course cards to visually group related courses
- **Fetch Assignments & Materials** — Pull all assignments and materials per course, grouped by topic/week
- **Print Summary Outline** — Clean printable one-page course overview with topic and assignment titles
- **Print Detailed Outline** — Full printable course outline with descriptions and attachment links
- **Student Progress Monitor** — Grade percentages, earned/possible points, and missing assignments per student with color-coded at-risk flagging (On track >75%, Watch 61–75%, At risk ≤60%)
- **Seating Chart** — Interactive drag-and-drop seating chart with Google Classroom grade color coding, room layouts, and multi-class print support
- **Markdown Export** — Export course data as Astro-ready `.md` files with YAML frontmatter
- **Drive Sync** — Settings sync across devices via Google Drive (requires `drive.file` scope)

---

## Tech Stack

| Layer          | Technology                                                   |
| -------------- | ------------------------------------------------------------ |
| Frontend       | Vanilla HTML, CSS, JavaScript — no framework, no build step  |
| Auth           | Google Identity Services (OAuth 2.0, client-side token flow) |
| Classroom Data | Google Classroom REST API v1                                 |
| Sync           | Google Drive API (`drive.file` scope)                        |
| Hosting        | Netlify — static hosting with CI/CD via GitHub               |
| Utilities      | JSZip for bulk `.md` export                                  |

---

## Project Structure

```
gcdash/
├── index.html        # Main dashboard — structure and layout
├── styles.css        # All styles organized by section
├── app.js            # All app logic organized by section
├── config.js         # OAuth Client ID (not committed to git)
├── seating.html      # Seating chart — standalone page
├── build.js          # Netlify build script — generates config.js from env var
├── netlify.toml      # Netlify build configuration
├── logo.png          # App logo (used in header and auth screen)
├── privacy.md        # Privacy policy
└── README.md         # This file
```

> `config.js` is in `.gitignore` and never committed to git. It is generated at build time by `build.js`.

---

## Google Cloud Setup

This is the most important part of getting a new instance of GCDash running. Follow these steps carefully.

### Step 1 — Create a Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click the project selector at the top → **New Project**
3. Name it (e.g. `gcdash`) and click **Create**
4. Make sure your new project is selected in the top bar

### Step 2 — Enable the Required APIs

1. Go to **APIs & Services → Library**
2. Search for and enable each of these:
   - **Google Classroom API**
   - **Google Drive API**

### Step 3 — Configure the OAuth Consent Screen

1. Go to **APIs & Services → OAuth consent screen**
   _(Google may now call this **Google Auth Platform**)_
2. Click **Get Started** or **Edit App**
3. Fill in:
   - **App name:** GCDash
   - **User support email:** your email
   - **Developer contact:** your email
4. Under **Audience**, select **External** (unless your school domain has Workspace)
5. Click through to **Data Access**

### Step 4 — Add OAuth Scopes

1. On the **Data Access** page, click **Add or Remove Scopes**
2. The scope picker will open — scroll down to find a **"Paste scopes"** text box
3. Paste all of the following scopes (one per line):

```
https://www.googleapis.com/auth/classroom.courses.readonly
https://www.googleapis.com/auth/classroom.coursework.students.readonly
https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly
https://www.googleapis.com/auth/classroom.topics.readonly
https://www.googleapis.com/auth/classroom.student-submissions.students.readonly
https://www.googleapis.com/auth/classroom.rosters.readonly
https://www.googleapis.com/auth/drive.file
```

4. Click **Add to Table**, then **Update**, then **Save**

> **Note:** `drive.file` is a non-sensitive scope — it only accesses files created by GCDash, not the teacher's existing Drive files. It will appear under "Your non-sensitive scopes."

> **Workspace accounts:** If your school uses Google Workspace, the Drive API may be restricted by your domain administrator. Try adding the scope — if it fails, contact IT and share this README. The app works without Drive sync (falls back to localStorage automatically).

### Step 5 — Create OAuth Credentials

1. Go to **APIs & Services → Credentials**
2. Click **+ Create Credentials → OAuth 2.0 Client ID**
3. Application type: **Web application**
4. Name it (e.g. `GCDash Web Client`)
5. Under **Authorized JavaScript origins**, add:
   - `http://localhost:8080` (for local development)
   - `https://yourdomain.netlify.app` (your production URL)
6. Click **Create**
7. Copy the **Client ID** — you'll need it in the next step

---

## Local Development Setup

### Prerequisites

- Node.js installed (for `npx serve`)
- A Google Cloud project set up per the steps above

### Create config.js

Create a `config.js` file in the project root:

```js
var CONFIG = {
	clientId: 'YOUR_CLIENT_ID.apps.googleusercontent.com',
};
```

> This file is in `.gitignore` and never committed. It is shared by both `index.html` and `seating.html`.

### Run Locally

```zsh
npx serve . -l 8080
```

Open [http://localhost:8080](http://localhost:8080) in your browser.

> The app must be served over HTTP/HTTPS — it cannot be opened as a `file://` URL due to OAuth restrictions.

---

## Deployment — Netlify

### Environment Variable

In Netlify dashboard → **Site Settings → Environment Variables**, add:

```
GOOGLE_CLIENT_ID = your-client-id.apps.googleusercontent.com
```

### Build Script

`build.js` runs automatically on every deploy and generates `config.js` from the environment variable:

```js
const fs = require('fs');
const config = `var CONFIG = { clientId: '${process.env.GOOGLE_CLIENT_ID}' };`;
fs.writeFileSync('config.js', config);
```

### netlify.toml

```toml
[build]
  command = "node build.js"
  publish = "."
```

### CI/CD

Push to GitHub → Netlify auto-deploys. No manual steps needed.

---

## OAuth Scopes Reference

| Scope                                             | Sensitivity   | Purpose                            |
| ------------------------------------------------- | ------------- | ---------------------------------- |
| `classroom.courses.readonly`                      | Non-sensitive | Fetch course list                  |
| `classroom.coursework.students.readonly`          | Non-sensitive | Fetch assignments                  |
| `classroom.courseworkmaterials.readonly`          | Non-sensitive | Fetch materials                    |
| `classroom.topics.readonly`                       | Non-sensitive | Fetch topic names                  |
| `classroom.student-submissions.students.readonly` | Non-sensitive | Fetch student grades               |
| `classroom.rosters.readonly`                      | Non-sensitive | Fetch student roster               |
| `drive.file`                                      | Non-sensitive | Read/write GCDash config file only |

All Classroom scopes are read-only. The `drive.file` scope is limited to files created by GCDash — it cannot access any existing Drive files.

---

## Grade Color Coding

Used consistently across the Student Progress Monitor and Seating Chart:

| Color     | Range   | Label          |
| --------- | ------- | -------------- |
| 🟢 Green  | > 75%   | On track       |
| 🟡 Yellow | 61–75%  | Watch          |
| 🔴 Red    | ≤ 60%   | At risk        |
| ⬜ Gray   | No data | Not yet graded |

---

## Seating Chart — seating.html

The seating chart is a standalone page linked from the main GCDash dashboard. It shares the same `config.js` Client ID and OAuth token — no separate sign-in required.

### Features

- Loads rosters and computes grades directly from Google Classroom
- Color-coded seat cards matching the Student Progress Monitor thresholds
- Drag-and-drop student placement between desks
- Resizable rows and columns (drag handles between cells) to model real room layout
- Aisle columns created by dragging a column to minimum width
- Add/remove rows via toolbar
- Multiple named room layouts saved per teacher
- Seating layouts saved per class (by course ID)
- Multi-class print — select any classes, generates landscape print document
- Roster sidebar with collapse/expand toggle
- Extensible student data fields (field1–field4) for future Aeries API integration

### Room Layout Tips

- Drag the handle between two columns narrow to create an aisle
- Save your room layout with **Save Room** — give it a name (e.g. "Room 308")
- The room name is saved with each class's seating chart and restores automatically

### Grade Performance

- Grades are calculated from all graded submissions using the wildcard endpoint (`courseWork/-/studentSubmissions`) for maximum speed
- Grades are cached in `localStorage` for 10 minutes per class
- On repeat visits, cached grades load instantly; cache refreshes silently in background

### Printing

1. Click **Print** in the header
2. Select one or more classes (classes with saved layouts are pre-checked)
3. Click **Print** — a new landscape window opens with one class per page
4. Hit the orange **Print** button to send to printer

---

## Settings Sync — Google Drive

GCDash syncs settings to a hidden file in the teacher's Google Drive:

```
.gcdash-config/
└── settings.json
```

**What syncs:**

- Course card order
- Course card colors
- Seating layouts (coming soon)
- Room layouts (coming soon)
- Meta field labels (coming soon)

**What stays local:**

- Grade cache (temporary, device-specific)
- Auth tokens (security — never leave the device)

> If Drive sync is unavailable (e.g. Workspace restrictions), the app falls back to `localStorage` automatically with no interruption.

---

## App Sections — app.js

| Section                  | Description                             |
| ------------------------ | --------------------------------------- |
| State                    | Global variables and runtime state      |
| UI Utilities             | `setStatus()` and shared helpers        |
| Auth                     | Google OAuth token flow                 |
| API                      | Classroom REST calls                    |
| Drive Sync               | Settings read/write to Google Drive     |
| Drag and Drop            | Course card reordering                  |
| Course Card Colors       | Color picker and storage                |
| Courses UI               | Tabs, cards, rendering                  |
| Detail Panel             | Assignments and materials view          |
| Student Progress Monitor | Grade report and at-risk flagging       |
| Print View               | Summary and detailed printable outlines |
| Markdown Export          | `.md` file generation with frontmatter  |
| Helpers                  | Grouping, sorting, formatting utilities |
| Attachments              | Drive, YouTube, link, form rendering    |

---

## Roadmap

### In Progress

- [ ] Google Drive sync for seating layouts, room layouts, and meta field labels
- [ ] Print — proportional column widths matching saved room layout
- [ ] Seating chart tablet mode — tap-to-select, tap-to-place, confirm dialog
- [ ] Course card reordering on mobile — long-press to drag

### Planned

- [ ] Aeries SIS API integration — Language Fluency, Program, Attendance on seat cards _(pending IT approval)_
- [ ] Google OAuth app verification (remove unverified warning for other users)
- [ ] Multiple named seating layouts per class (e.g. "Group work" vs "Exam")
- [ ] Email at-risk students via Gmail API
- [ ] Astro student-facing site from `.md` exports

### Parking Lot

- [ ] Sorting options for courses (date, alpha, custom)
- [ ] Multiple print style templates
- [ ] Row labels on seating chart (Row A, Row B)
- [ ] Per-seat teacher notes

---

## Privacy

GCDash is entirely client-side. No student data, grades, or personal information is ever sent to any server other than Google's own APIs. The only data written outside the browser is the teacher's own preference file in their own Google Drive.

See [privacy.md](privacy.md) for full details.

---

## Author

Built by Manuel Chagoyan — Technology Teacher, Coalinga High School
