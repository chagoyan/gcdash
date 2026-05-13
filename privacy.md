# Privacy Policy — GCDash

**Last updated:** May 2026

---

## Overview

GCDash is a personal teacher dashboard that connects to Google Classroom to help teachers manage course outlines, monitor student progress, and export curriculum data. This privacy policy explains how the app handles your data.

---

## Data We Access

GCDash requests access to the following Google data through OAuth 2.0:

| Data | Purpose |
|------|---------|
| Google Classroom courses | Display your course list |
| Assignments and materials | Generate course outlines |
| Topic names | Organize assignments by week/unit |
| Student rosters | Display student names in progress monitor |
| Student grades and submissions | Calculate grade percentages and flag at-risk students |
| Google Drive files (app-specific) | Store app settings across devices |

---

## How We Use Your Data

- **Course data** is used solely to display course outlines, generate printable reports, and export markdown files.
- **Student data** (names, grades, submissions) is used solely to display the student progress monitor within the app.
- **Settings data** is stored in a file named `settings.json` inside a folder called `.gcdash-config` in your Google Drive. This file contains only app preferences (course colors, drag order) — no student data.

---

## Data Storage

- **All Google Classroom data is processed in your browser only.** It is never sent to any external server.
- **No student data is stored** on any server, database, or third-party service.
- **App preferences** (course colors, card order) are stored in:
  - Your browser's `localStorage` (local to each device)
  - A settings file in your Google Drive (for cross-device sync, if enabled)
- **No cookies** are used by this application.

---

## Data Sharing

We do not share, sell, rent, or trade any data with third parties. Your Google Classroom data and student information never leave your browser.

---

## Third-Party Services

GCDash uses the following Google APIs:
- [Google Classroom API](https://developers.google.com/classroom)
- [Google Drive API](https://developers.google.com/drive)
- [Google Identity Services](https://developers.google.com/identity)

Your use of GCDash is also subject to [Google's Privacy Policy](https://policies.google.com/privacy).

---

## Data Retention

GCDash does not retain any data. When you disconnect or close the browser tab, all fetched data is discarded. Only your app preferences (colors, order) are persisted in localStorage and optionally in Google Drive.

---

## Student Data — FERPA

GCDash accesses student names and grade data solely for display within the app to the authenticated teacher. This data is:
- Never stored on any server
- Never shared with any third party
- Only visible to the authenticated teacher
- Discarded when the session ends

Teachers are responsible for ensuring their use of GCDash complies with their school or district's data privacy policies and applicable laws including FERPA.

---

## Security

- GCDash uses OAuth 2.0 with short-lived access tokens (expiring in approximately 1 hour)
- All API requests are made over HTTPS
- The app requests only the minimum scopes necessary
- All scopes except `drive.file` are read-only

---

## Your Rights

You can revoke GCDash's access to your Google account at any time by visiting [myaccount.google.com/permissions](https://myaccount.google.com/permissions) and removing the app.

---

## Contact

For questions about this privacy policy, contact:

**Manuel Chagoyan**
Technology Teacher, Coalinga High School
mchagoyan@chusd.org

---

## Changes to This Policy

This privacy policy may be updated from time to time. The date at the top of this page reflects the most recent revision.