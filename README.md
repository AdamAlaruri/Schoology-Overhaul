<p align="center"><img src="icons/icon512.png" alt="Schoology Overhaul logo" width="120"></p>

<h1 align="center">Schoology Overhaul</h1>

<p align="center">A calmer, faster, better-looking Schoology. Runs entirely in your browser.</p>

<p align="center">
  <img src="docs/screenshots/dashboard.png" alt="Dashboard with priorities grouped by urgency and a grades panel" width="820">
</p>

A Chrome extension that redesigns how Schoology looks. It reads pages you can already see, using your own session. Nothing is sent to any server, and you can switch back to the classic view in one click.

> Screenshots use made-up demo data from the local test server, not a real student account.

## Features

- **Dashboard:** what is due, grouped as overdue, today, next 7 days and later, plus grades and announcements.
- **Courses:** one tile per course, with its own colour. Drag to reorder.
- **Course pages:** overview, materials, assignments, grades and announcements in one place.
- **Assignments:** filter and sort, with older completed work moved to an archive.
- **Grades:** every course at a glance, with a **Hypothetical** mode for planning. Real grades are never changed.
- **Calendar:** month, week, day and agenda views, plus personal tasks.
- **Messages, groups and search:** press `/` or `Ctrl+K` to search.
- **Themes and accessibility:** ten themes, light/dark, density, text size, high contrast and reduced motion.

<p align="center">
  <img src="docs/screenshots/courses.png" alt="Courses page" width="400">
  <img src="docs/screenshots/grades-hypothetical.png" alt="Grades in Hypothetical mode" width="400">
</p>

## Install

The extension is not on the Chrome Web Store, so load it from this folder.

1. Download or clone this repository.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Choose **Load unpacked** and select the project folder.
4. Sign in to Schoology and open your home page.

It runs on `*://*.schoology.com/*`. If your school uses its own domain, add it to both `matches` lists in `manifest.json` and reload the extension. To return to the original site, choose **Classic view** in the account menu.

## Privacy

- The only permission is `storage`. There is no background worker.
- The only network requests go to Schoology, using your existing session. No analytics, no third parties, no accounts.
- Passwords are never read or stored.
- Settings, hypothetical grades, personal tasks and cached data stay in `chrome.storage.local`. **Settings → Data & privacy** clears them.
- Content from Schoology is sanitised before it is shown.

## Development

No build step: plain JavaScript and CSS loaded from the manifest.

```bash
node tests/mock-server.js    # fake Schoology at http://localhost:4173/home
for f in tests/*-cases.js; do node "$f"; done
```

```
manifest.json
src/      scripts and styles (core, data, views, app, themes)
tests/    test scripts and the mock server
fonts/    bundled Geist and Inter with licences
icons/    extension icons
docs/     screenshots
```

If a page loads empty, open **Settings → Diagnostics** to see what each data source found, then adjust the matching selector in the `SEL` block at the top of `src/data.js`. Only the first page of each Schoology list is read.

## Credits and disclaimer

Geist and Inter are bundled under the SIL Open Font License (see `fonts/LICENSES.txt`).

This is an unofficial, independent project. It is not made, endorsed or supported by Schoology or PowerSchool.
