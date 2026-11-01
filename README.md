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

- **Typography:** one font, Inter (bundled in `fonts/`, SIL Open Font License), declared once and inherited everywhere, with controls set to `font: inherit`. Seven sizes only: H1 48/700, H2 36/600, H3 28/600, H4 22/500, Body 16/400, Small 14/400, Caption 12/400, with the line heights from the brief. Page titles and the welcome line are H1, the clock H2, section headings H3, card titles H4. On phones the headings step down one level.
- **Spacing:** an 8px scale (`--space-1` 4px for micro adjustments, then 8, 16, 24, 32, 40, 48, 64), 40px buttons and inputs, 32px compact controls, 48px rows. Radii are 4, 8 and 12px.
- **Surfaces:** background (one SVG) → app shell → panels (subtle 8px blur) → menus and dialogs. The interface switches between light and dark text according to the background colour, so contrast always holds.

## Topographic background

`src/topo.js` generates a real contour map in code: a warped elevation field built from several hills, with iso-lines extracted by marching squares and written as smooth cubic Bézier `<path>` elements. It is one fixed, full-viewport SVG with a soft permanent blur (1.5px, background layer only, not adjustable) (`#sgo-bg`, `pointer-events: none`, behind everything), drawn at document start from `src/early.js` so it is there before the page paints. The geometry is generated once and kept; nothing animates. Strokes read CSS variables, so recolouring changes the paths themselves.

**Settings → Appearance** has buttons to turn the **topographic map** on or off, set its **line density** (Light, Standard, Dense) and draw a **New map**, and four independent colours, each with a picker and a hex field, plus curated presets and a reset: contour lines (`--contour-color`), contour glow (`--contour-glow`, drawn under the major contours), background (`--app-background`) and accent (`--accent`). Changes apply instantly and are saved with the other preferences in `chrome.storage.local`. Tests: `node tests/topo-cases.js`.

## Dashboard header

The greeting (Good morning / afternoon / evening plus your first name from Schoology, or just the greeting when no name is known) is the page heading, with a live clock beside it. The clock uses the browser's own local time and timezone, updates on the minute, and its timer stops whenever the dashboard is not on screen. On narrow screens the order is welcome, tasks, classes. Spacing uses the `--space-*` tokens in `theme.css`; every page shares one card surface, one page width (`--page`) and the same left edge. "Your classes" and "Tasks" open with the same heading row so their first cards start on the same line.

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

## Grade updates, accent colour, Help

- **Grade updates:** the bell in the top bar counts unread grading updates. When the gradebook shows a score that was not there before (a new grade, or a changed one) one notification is kept, showing the assignment, class, score and percentage, the due date and the date it was first seen here (Schoology does not publish when a grade was entered). The first read only records what is already graded, so old grades never flood in, and a grading event is never announced twice. Mark one or all as read. Checked whenever the gradebook is read (dashboard, Grades and course pages). Tests: `node tests/grade-cases.js`.
- **Accent colour:** Settings → Appearance has eight named accents plus a custom hex. Text on the accent switches between near-black and white for contrast, and accent-coloured text is darkened or lightened to stay readable on either interface. Saved with your other preferences.
- There is no Help item in the sidebar, top bar or settings.
