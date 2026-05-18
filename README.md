# GCDash — Google Classroom Dashboard

A teacher dashboard that connects to the Google Classroom API to provide course outlines, student progress monitoring, seating chart management, and curriculum planning tools. Entirely client-side — no server, no database, no third-party data sharing.

Live: [https://gcdash.netlify.app](https://gcdash.netlify.app)

---

## Features

### Dashboard (index.html)

- **Course Management** — View all Google Classroom courses organized by Active, Archived, and Other tabs
- **Drag-to-Reorder** — Drag course cards into your preferred order, synced via Google Drive
- **Color Coding** — Assign colors to course cards to visually group related courses
- **Fetch Assignments & Materials** — Pull all assignments and materials per course, grouped by topic/week
- **Print Summary Outline** — Clean printable one-page course overview with topic and assignment titles
- **Print Detailed Outline** — Full printable course outline with descriptions and attachment links
- **Student Progress Monitor** — Grade percentages, earned/possible points, and missing assignments per student with color-coded at-risk flagging
- **Markdown Export** — Export course data as Astro-ready `.md` files with YAML frontmatter
- **Drive Sync** — Settings sync across devices via Google Drive (`drive.file` scope)

### Seating Chart (seating.html)

- **Room layout system** — Create a grid, designate desk cells with Edit Room mode, save the room. Desk layout is shared across all classes using that room.
- **Grade color-coded desk cards** — On track (>75% green), Watch (61–75% yellow), At risk (≤60% red)
- **Student assignment** — Random, alphabetical, or manual click-to-place
- **Drag-and-drop** (desktop) — Atomic swap when dragging to an occupied desk
- **Tablet mode** — Long press to select, tap to move/swap, auto-save after each move
- **Multi-class print** — Select any classes, generates landscape print document with uniform desk sizing
- **Google Drive sync** — Room layouts and seating charts sync across devices

---

## Seating Chart Workflow

1. **Select a class** from the dropdown
2. **Set grid size** (Rows / Cols) and click **Apply** — size the grid to match your physical room including aisles
3. Click **Edit Room** — click cells to toggle between desk (orange border) and space (dark). Space cells represent aisles, gaps, and walls.
4. Click **Save Room** and give it a name — desk layout is saved to the room and shared by all classes using it
5. Click **Assign** — Random, Alphabetical, or place students manually by clicking desks
6. Click **Save Seating Chart**
7. Click **Print** to print

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

### Step 1 — Create a Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click the project selector at the top → **New Project**
3. Name it (e.g. `gcdash`) and click **Create**

### Step 2 — Enable the Required APIs

1. Go to **APIs & Services → Library**
2. Enable: **Google Classroom API** and **Google Drive API**

### Step 3 — Configure the OAuth Consent Screen

1. Go to **APIs & Services → OAuth consent screen**
2. Fill in App name, support email, and developer contact
3. Under **Audience**, select **External**
4. Click through to **Data Access**

### Step 4 — Add OAuth Scopes

On the **Data Access** page, paste the following scopes:

```
https://www.googleapis.com/auth/classroom.courses.readonly
https://www.googleapis.com/auth/classroom.coursework.students.readonly
https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly
https://www.googleapis.com/auth/classroom.topics.readonly
https://www.googleapis.com/auth/classroom.student-submissions.students.readonly
https://www.googleapis.com/auth/classroom.rosters.readonly
https://www.googleapis.com/auth/drive.file
```

> `drive.file` is non-sensitive — it only accesses files created by GCDash.

### Step 5 — Create OAuth Credentials

1. Go to **APIs & Services → Credentials → + Create Credentials → OAuth 2.0 Client ID**
2. Application type: **Web application**
3. Add authorized origins: `http://localhost:8080` and your production URL
4. Copy the **Client ID**

---

## Local Development

```zsh
# Create config.js
echo "var CONFIG = { clientId: 'YOUR_CLIENT_ID.apps.googleusercontent.com' };" > config.js

# Serve locally
npx serve . -l 8080
```

Open [http://localhost:8080](http://localhost:8080). The app must be served over HTTP/HTTPS — `file://` URLs won't work due to OAuth restrictions.

---

## Deployment — Netlify

1. In Netlify dashboard → **Site Settings → Environment Variables**, add:
   ```
   GOOGLE_CLIENT_ID = your-client-id.apps.googleusercontent.com
   ```
2. Push to GitHub → Netlify auto-deploys via `build.js` which generates `config.js` from the environment variable.

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

---

## Privacy

GCDash is entirely client-side. No student data, grades, or personal information is ever sent to any server other than Google's own APIs. The only data written outside the browser is the teacher's own preference file in their own Google Drive.

See [privacy.md](privacy.md) for full details.

---

## Author

Built by Manuel Chagoyan — Technology Teacher, Coalinga High School
