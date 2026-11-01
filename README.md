# Schoology Overhaul

A Manifest V3 Chrome extension that replaces Schoology's interface with a modern dashboard, assignment manager, calendar, grades view and sidebar navigation. It is a UI/UX overhaul only, with no AI features.

## Install

1. Open `chrome://extensions`, turn on **Developer mode**.
2. **Load unpacked** and pick this folder.
3. Sign in to Schoology as usual and open `/home`.

Your school's Schoology address must match `*://*.schoology.com/*`. If your district uses a custom domain, add it to `content_scripts.matches` in `manifest.json`.

## What you get

| Area | Route | Notes |
|---|---|---|
| Dashboard | `/home` | Notes, course cards (banner, grade, code, term, announcements, Due list) and a Tasks panel with a week picker, course filter, progress ring, tabs for announcements, assignments and submitted items, recent feedback and a View Grades link. |
| Assignments | `/home#/assignments` | Filters (all, upcoming, missing, overdue, completed), sort by due date, class or status, search, per-class filter. |
| Assignment detail | `/home#/a/...` | Description, due info, status, and **Open in Schoology to submit**. |
| Courses | `/courses` | Courses detected from your account, shown as cover-and-title cards in a responsive grid. Hover a card to **rename** it or **customize** colour and cover (gradients or your own image). Drag to rearrange, or switch to A-Z. Entire card opens the real course. |
| Calendar | `/calendar` | Month, week, day and agenda views. |
| Grades | `/grades/grades` | Course cards with assignment-level rows grouped by category, as reported by Schoology. |
| Settings | `/home#/settings` | Theme, accent, course colours, school links, banners, diagnostics, clear cache. |
| Everything else | course pages, submission pages, messages, resources... | Left as native Schoology, with the sidebar, a course-colour accent bar, "This course" shortcuts and light dark-mode styling. |

## Course cards

- Cards are generated only from courses detected in Schoology; none are hardcoded.
- Custom names, colours, covers and order are saved in `chrome.storage.local` and keyed by Schoology's course id, so links and identification never change. The original name stays visible under a renamed title, and "Reset to original" in the Customize dialog restores everything for that course.
- Custom names are used everywhere in the redesign: sidebar, assignments, calendar, grades.
- Uploaded cover images are downscaled and stored locally only. No image URLs are fetched from the web.

## Course branding

Every class gets the identity of its own subject, worked out from its name (`src/subjects.js`): AP Biology gets biology, Spanish gets Spanish, and so on for 17 subjects. Anything unrecognised gets a monogram of its initials, never one generic icon.

- **Emblem:** a line-art logo drawn in code (DNA helix, flask, integral sign, open book, temple, speech bubble with ¡!, supply and demand curves, brain, atom, brackets, gear, palette, notes, heart with pulse, globe, parabola, bell curve). It sits in a navy tile on the course card, the Courses page and the course header, tinted with the subject's accent.
- **Banner:** each subject also has its own 960×320 banner on one system (navy-teal ground, cyan line art, one muted accent; Spanish carries a subtle flag-stripe accent). Banners are inline SVG, so there are no files to go missing and no network requests.
- **Automatic by default.** Under **Change banner** the choices are Automatic, Original (Schoology's own picture, read from the home dashboard and never edited), nine subject banners (Biology, Chemistry, Calculus, English, History, Spanish, Economics, Psychology, Classic) and an upload. Choose, preview, then **Apply**. Earlier saved choices keep working.
- A class's default colour is its subject's accent until the student picks one. **Reset all banners** returns every class to Automatic; **Restore original Schoology banners** switches every class to Original.
- Detection rules, emblems and banners are covered by `node tests/banner-cases.js`.

## Colour and type

Cyan and white: `#20C5D9` is the accent, with a deeper cyan for active states and a darkened cyan for text on light surfaces (6.4:1 on white; navy on cyan is 7.9:1). Four bundled fonts (`fonts/`, SIL Open Font License, see `fonts/LICENSES.txt`), each with one job: Plus Jakarta Sans for the interface and page titles, DM Sans for text people read, Instrument Serif for the welcome line only, Space Grotesk for numbers and clocks.

## Native course pages

Every course opens inside the app; the legacy Schoology course page is never shown (add `?sgo=classic` to a URL to see it on purpose, or use "Open in Schoology"). Real Schoology addresses are kept, so refresh, back/forward and bookmarks work:

- `/course/ID/materials` is the Overview; `?tab=materials`, `?tab=assignments[&a=ASSIGNMENT]`, `?f=FOLDER` (nested folders with breadcrumbs), `/updates` (Announcements) and `/student_grades` (Grades).
- Folders, files, links and assignments come only from Schoology's own materials pages; order is preserved and counts are real. Nothing is invented.
- Your personal to-do tick is separate from Schoology's submission status.
- Loading shows skeletons, failures show a retry, an ended session shows a sign-in prompt, and fetched pages are cached.

## Design system and backgrounds

`src/theme.css` holds the tokens (type, radii, spacing, surface opacity, blur, shadows, motion) and the surface hierarchy: background layer, glass navigation rail, content panels, then menus and dialogs, each with its own opacity and blur. Titles use a serif display face and the interface uses the system sans, so no font is downloaded. Browsers without `backdrop-filter` get more opaque surfaces instead of blur.

**Settings → Background** sets what sits behind the whole app:
- 12 curated backgrounds (gradients, textures, architecture, nature, landscapes). They are drawn in code as gradients and small inline SVGs, so they are illustrations, not photographs, and nothing is downloaded. Upload a photo for photography.
- Upload your own PNG, JPEG or WebP (up to 8 MB, at least 320 px). It is scaled down to 2200 px and re-encoded before it is stored; anything unreadable, too large or the wrong type is refused with a message and the current background is kept.
- Solid colour, and Blur, Brightness and Overlay sliders. Reset returns to the default.
- Saved under its own `sgo_bg` key in `chrome.storage.local` and applied before first paint, so it survives refreshes. If the browser refuses the write (storage full) you are told.

## Dashboard header

The greeting (Good morning / afternoon / evening plus your first name from Schoology, or just the greeting when no name is known) is the page heading, with a live clock beside it. The clock uses the browser's own local time and timezone, updates on the minute, and its timer stops whenever the dashboard is not on screen. On narrow screens the order is welcome, tasks, classes. Spacing uses the `--s1`…`--s8` tokens in `styles.css`; every page shares one card surface (`--rc` radius, `--cp` padding, hairline border, no shadow), one page width (`--page`) and the same left edge. "Your classes" and "Tasks" open with the same heading row so their first cards start on the same line.

## Calendar, Inbox, History and Groups

All four open in the redesigned app (no legacy flash, refresh and back/forward work). Data comes only from Schoology's own pages:

- **Calendar** (`/calendar`): month, week, day and agenda views, tests and events marked, "Add personal task" for your own dated items (saved only in this browser).
- **Inbox** (`/messages`, `/messages/sent`, `/messages/view/ID`): list, reading pane, search and an Unread filter. Message text is kept in memory only. Replying and composing happen on Schoology's own page; opening a message marks it read, as in Schoology.
- **History** (`/home/recent-activity`): the posts in your Recent Activity feed plus the course pages you opened in this extension (stored locally, can be cleared). Schoology has no browsing-history feed, so nothing else is listed.
- **Groups** (`/groups`): your groups with their latest posts. A single group (`/group/ID`) and composing a message still open on Schoology's own pages.

## Quirky messages

A short, friendly line appears under the dashboard greeting. There are 20 for each part of the day (really late 0:00-4:59, morning, afternoon, evening, night from 22:00), and one is picked at random each time the extension opens. The last one shown is remembered so it is not repeated back to back. Edit them in `src/quips.js`; `node tests/quip-cases.js` checks the counts and time bands.

## How it stays safe and compatible

- **Native DOM is hidden, never removed.** Schoology's scripts, forms and sessions keep running, and **Classic view** (sidebar) restores the original page in one click.
- **Submission is untouched.** Assignment pages are native; the overhaul only links to them.
- **Permissions:** only `storage`. No host permissions beyond the Schoology content-script match, no background worker, no network calls except same-origin requests to Schoology itself using your existing session.
- **No credentials are read or sent. No data leaves the browser.** Preferences and a cache of what was read live in `chrome.storage.local` (Settings → Clear cached data).
- **No fabricated data.** Grades are shown verbatim. Priority is derived only from due date (and title keywords for tests). "Done" is a personal checkbox saved locally and is labelled as such. Submission status is "Not submitted" only when Schoology lists the item as overdue.

## Architecture

```
manifest.json
src/core.js    namespace, local prefs store, DOM helper h(), icons, date parsing, HTML sanitiser
src/data.js    all Schoology selectors (SEL), parsers, same-origin fetches, cache, derived helpers
src/views.js   screens as functions of state -> DOM (dashboard, assignments, calendar, ...)
src/app.js     sidebar/topbar shell, router, theme, MutationObserver, native-page handling
src/styles.css design tokens, light/dark, components
tests/mock-server.js   fake Schoology used to smoke-test the UI locally
```

It is plain JavaScript with no build step. The task suggested React; I chose a small `h()` helper instead because it loads without a bundler and keeps the content script small. The views are pure functions of state, so porting them to React later is mechanical.

## Tuning selectors (important)

Schoology's markup varies by district and version, and I could not sign in to a real account to validate against live pages. Parsing was developed against the structure I expect (Upcoming/Overdue lists, `/courses`, `.gradebook-course`, home feed items) and verified only against the included mock. If a section is empty on your school's site:

1. Open **Settings → Diagnostics**. It shows each data source, how many items it found, and the URL used.
2. Adjust the matching entry in the `SEL` block at the top of `src/data.js`. For example, change `overdueRoot` or `gradeCourse` to match what DevTools shows.
3. Reload the extension at `chrome://extensions`.

Known limits:
- The calendar shows items Schoology has exposed through its Upcoming/Overdue lists and ones cached from earlier visits. It does not yet read arbitrary past or future months from Schoology's own calendar feed.
- Announcements are read from the home feed when you visit `/home`.
- Assignment-level grades appear only if Schoology's grades page includes them in the markup; otherwise use Classic view.

## Local smoke test

```bash
node tests/mock-server.js    # then open http://localhost:4173/home
```
