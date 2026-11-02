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
| Dashboard | `/home` | A compact greeting with a factual summary line, three statistics, class cards, recent teacher feedback and a Tasks panel (see "Dashboard" below). |
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

## Course banners

- Every class shows its **original Schoology course image** by default. The extension reads the image address from the home Course Dashboard (matching the dashboard card's title, which begins with the course title and a colon) and never downloads, edits or replaces it. A class Schoology gives no image (for example an Advisory) gets a flat tint of its colour; nothing is generated.
- **Change banner** (image icon on a card) offers the original, seven optional photographs (Science, Biology, History, English, Computer Science, Languages, Arts & electives) and an upload. The photographs are real public-domain or CC0 pictures from Wikimedia Commons bundled in `banners/`, with credits in `banners/CREDITS.md`; nothing is generated and nothing is fetched at run time. Mathematics classes are suggested the Science photo. Choose, preview, then **Apply**. Under Settings, **Restore original Schoology banners** and **Reset all banners** apply to every class.
- Choices are stored per course id in `chrome.storage.local`.

## Native course pages

Every course opens inside the app; the legacy Schoology course page is never shown (add `?sgo=classic` to a URL to see it on purpose, or use "Open in Schoology"). Real Schoology addresses are kept, so refresh, back/forward and bookmarks work:

- `/course/ID/materials` is the Overview; `?tab=materials`, `?tab=assignments[&a=ASSIGNMENT]`, `?f=FOLDER` (nested folders with breadcrumbs), `/updates` (Announcements) and `/student_grades` (Grades).
- Folders, files, links and assignments come only from Schoology's own materials pages; order is preserved and counts are real. Nothing is invented.
- Your personal to-do tick is separate from Schoology's submission status.
- Loading shows skeletons, failures show a retry, an ended session shows a sign-in prompt, and fetched pages are cached.

## Design system

One stylesheet owns the look (`src/theme.css`); `src/styles.css` holds component layout only and consumes its tokens.

- **Typography:** one font, Inter (bundled in `fonts/`, SIL Open Font License), declared once and inherited everywhere. Seven sizes: H1 30 (greeting), H2 28, H3 24 (section headings), H4 18 (course titles), Body 15 (assignment titles), Small 14, Caption 13 (metadata).
- **Spacing:** an 8px scale (`--space-1` 4px for micro adjustments, then 8, 16, 24, 32, 40, 48, 64), 40px buttons and inputs, 32px compact controls, 48px rows. Radii are 4, 8 and 12px.
- **Surfaces:** one solid page colour (default `#0F1115`), panels `#171A21`, elevated surfaces and menus `#1D222B`, borders `#303640`, text `#F3F5F8` / `#A8B0BE`, accent `#65A9FF`. No gradients, glow, blur or background graphics. The interface switches between light and dark according to the background colour; text pairs are 7:1 or better in dark and controls have a 3:1 boundary (WCAG 2.2 AA).

## Dashboard

- **Header:** your first name from Schoology, today's date and one factual line built from real counts ("2 assignments overdue · 1 due today · 5 more in the next 7 days · 2 new grades"), or "Nothing is overdue or due soon." No clock, no motivational messages.
- **Statistics (three, only from real data):** *Outstanding* = assignments not submitted and not checked off, overdue included; *Due in 7 days* = open assignments due today through 7 days out, overdue excluded; *New grades* = unread grade notifications. A workload estimate is not shown because Schoology gives no time estimates.
- **Class cards:** the original Schoology course image in one banner ratio, a title that wraps, the grade only when Schoology reports one (never a `--%` placeholder), overdue and upcoming counts, and the nearest upcoming assignment or "No upcoming assignments". The whole card opens the course; the `...` menu holds Open, Assignments, Grades, Announcements, Change banner and Rename.
- **Tasks:** groups Overdue, Due today, Upcoming (next 7 days), Later and No due date (empty groups are hidden), filters Today / Next 7 days / All upcoming (overdue always included) and a course filter, a compact "x of y done in the next 7 days" bar, and tabs for Assignments, Completed and class posts. Each row shows the assignment title, course, due date and a status the data supports: *Overdue* (on Schoology's missing list), *Not submitted*, *Submitted* (gradebook shows it submitted or graded; it cannot be unchecked here), *Completed* (checked off by you) and *To do* for personal tasks, which also carry a "Personal" tag. "Not started" and "In progress" are not offered because Schoology does not expose them. Row actions live in a menu (details, edit, delete for personal tasks, hide from the tracker for assigned work).

## Notifications

The bell keeps one history (up to 80, read items dimmed, "Clear read" asks first) of: **new grades**, **grade changes** (shows the earlier and new score), **new assignments** and **deadlines within 24 hours**, each with a title, course, timestamp and a link to the right page. The first read of grades and of assignments only records what already exists, so nothing old is announced, and each event has an id built from what happened so background refreshes never repeat it. Connection problems (an ended session or a failed refresh) are shown at the top of the list from the live state, so they never pile up and disappear when the refresh succeeds.

## Calendar, Inbox and Groups

All three open in the redesigned app (no legacy flash, refresh and back/forward work). Data comes only from Schoology's own pages:

- **Calendar** (`/calendar`): month, week, day and agenda views, tests and events marked, "Add personal task" for your own dated items (saved only in this browser).
- **Inbox** (`/messages`, `/messages/sent`, `/messages/view/ID`): list, reading pane, search and an Unread filter. Message text is kept in memory only. Replying and composing (`/messages/new`) happen inside the app: the extension reads Schoology's own message form with your signed-in session, fills in your text and submits it, so Schoology delivers it and keeps it in Sent. Errors from Schoology are shown as-is, and "Open in Schoology" is always offered. Opening a message marks it read, as in Schoology.
- **Groups** (`/groups`): your groups with their latest posts. A single group (`/group/ID`) still opens on Schoology's own page.

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
src/theme.css  design tokens, light/dark, dashboard and notification styles
src/styles.css component layout
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

## Accent colour

Settings → Appearance has a square that opens a grid of colours (or any custom colour) plus a solid background colour and four presets. Text on the accent switches between near-black and white for contrast, and accent-coloured text is adjusted to stay readable. There is no Help item in the sidebar, top bar or settings.
