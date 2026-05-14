# GCDash — Google Classroom Dashboard

A personal teacher dashboard that connects to the Google Classroom API to provide course outlines, student progress monitoring, and curriculum planning tools.

Live: [https://gcdash.netlify.app](https://gcdash.netlify.app)

---

## Features

- **Course Management** — View all your Google Classroom courses organized by Active, Archived, and Declined tabs
- **Drag-to-Reorder** — Drag course cards into your preferred order, persisted via localStorage
- **Color Coding** — Assign colors to course cards to visually group related courses
- **Fetch Assignments & Materials** — Pull all assignments and materials per course, grouped by topic/week
- **Print Summary Outline** — Clean printable one-page course overview with topic and assignment titles
- **Print Detailed Outline** — Full printable course outline with descriptions and attachment links
- **Student Progress Monitor** — View grade percentages, earned/possible points, and missing assignments per student with color-coded at-risk flagging
- **Markdown Export** — Export course data as Astro-ready `.md` files with YAML frontmatter
- **Drive Sync** — Settings sync across devices via Google Drive (requires personal Gmail Cloud project)

---

## Tech Stack

- **Vanilla HTML/CSS/JS** — No framework, no build step
- **Google Identity Services** — OAuth 2.0 browser-based token flow
- **Google Classroom REST API** — Courses, coursework, materials, topics, rosters, submissions
- **Google Drive API** — Settings sync (`.gcdash-config/settings.json`)
- **Netlify** — Static hosting with CI/CD via GitHub
- **JSZip** — Bulk `.md` file download as ZIP

---

## Project Structure

```
gcdash/
├── index.html        # App structure and layout
├── styles.css        # All styles organized by section
├── app.js            # All app logic organized by section
├── config.js         # OAuth Client ID (not committed to git)
├── build.js          # Netlify build script — generates config.js from env var
├── netlify.toml      # Netlify build configuration
├── privacy.md        # Privacy policy
├── README.md         # This file
└── env/
    └── .env          # Local backup of credentials (not committed to git)
```

---

## Setup — Local Development

### Prerequisites
- Node.js installed
- A Google Cloud project with the following APIs enabled:
  - Google Classroom API
  - Google Drive API (optional, for settings sync)

### Google Cloud Setup
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project
3. Enable the **Google Classroom API** and **Google Drive API**
4. Go to APIs & Services → Credentials
5. Create an **OAuth 2.0 Client ID** (Web application type)
6. Add authorized JavaScript origins:
   - `http://localhost:8080`
   - `https://yourdomain.netlify.app`
7. Copy the Client ID

### Local Config
Create a `config.js` file in the project root:
```js
var CONFIG = {
  clientId: 'YOUR_CLIENT_ID.apps.googleusercontent.com'
};
```

> `config.js` is in `.gitignore` and never committed to git.

### Run Locally
```zsh
npx serve . -l 8080
```

Open `http://localhost:8080` in your browser.

---

## Deployment — Netlify

### Environment Variable
In Netlify dashboard → Site Settings → Environment Variables:
```
GOOGLE_CLIENT_ID = your-client-id.apps.googleusercontent.com
```

### Build Script
`build.js` runs automatically on deploy and generates `config.js` from the environment variable:
```js
const fs = require('fs');
const config = `var CONFIG = { clientId: '${process.env.GOOGLE_CLIENT_ID}' };`;
fs.writeFileSync('config.js', config);
```

### CI/CD
Push to GitHub → Netlify auto-deploys. No manual steps needed.

---

## OAuth Scopes

| Scope | Purpose |
|-------|---------|
| `classroom.courses.readonly` | Fetch course list |
| `classroom.coursework.students.readonly` | Fetch assignments |
| `classroom.courseworkmaterials.readonly` | Fetch materials |
| `classroom.topics.readonly` | Fetch topic names |
| `classroom.student-submissions.students.readonly` | Fetch student grades |
| `classroom.rosters.readonly` | Fetch student roster |
| `drive.file` | Read/write settings sync file |

All scopes are **read-only** except `drive.file` which only accesses files created by the app.

---

## Settings Sync — Google Drive

Settings (course colors, drag order) are synced to `.gcdash-config/settings.json` in the user's Google Drive. This enables settings to persist across multiple devices.

> **Note:** This feature requires a Google Cloud project owned by a personal Gmail account. Google Workspace accounts may have Drive API restrictions set by the domain administrator.

If Drive sync is unavailable, the app falls back to localStorage automatically.

---

## App Sections — app.js

| Section | Description |
|---------|-------------|
| State | Global variables |
| UI Utilities | `setStatus()` helper |
| Auth | Google OAuth flow |
| API | Classroom REST calls |
| Drive Sync | Settings read/write to Google Drive |
| Drag and Drop | Course card reordering |
| Course Card Colors | Color picker and localStorage |
| Courses UI | Tabs, cards, rendering |
| Detail Panel | Assignments and materials view |
| Student Progress Monitor | Grade report and at-risk flagging |
| Print View | Summary and detailed printable outlines |
| Markdown Export | `.md` file generation with frontmatter |
| Helpers | Grouping, sorting, formatting utilities |
| Attachments | Drive, YouTube, link, form rendering |

---

## Roadmap

- [ ] Astro student-facing site from `.md` files
- [ ] Draggable seating chart with grade color coding
- [ ] Quick links panel for daily external resources
- [ ] Drive sync via personal Gmail Cloud project
- [ ] Multiple print style templates (dark mode, themes)
- [ ] Sorting options for courses (date, alpha, custom)
- [ ] Email at-risk students via Gmail API
- [ ] Google OAuth verification (remove unverified warning)

---

## Email Setup — Student Grade Notifications

The student progress monitor includes a ✉️ button per student that opens a pre-populated Gmail compose window in a new tab with the student's grade summary, earned/possible points, turned in count, missing assignments, and a link to their classwork page.

**Requirements:**
- Teachers must have a **Gmail account** (Google Workspace or personal Gmail)
- Students must have an email address on file in Google Classroom
- Clicking ✉️ opens Gmail compose in a new tab — the app stays open

No setup or configuration needed. Works on all devices and browsers.

---

---

## Author

Built by Manuel Chagoyan — Technology Teacher, Coalinga High School