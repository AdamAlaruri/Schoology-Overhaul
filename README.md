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
| Dashboard | `/home` | A compact greeting, one summary line, urgent work (overdue, due today, next 7 days), a course list and the latest updates. |
| Assignments | `/home#/assignments` | To do / Overdue / Completed / All, search, course filter, sort by due date, course or title; one row style everywhere. Detail pages at `/home#/a/...`. |
| Courses | `/courses` | A list of your courses with their Schoology image, what is coming up and the next assignment. Pin a course or move it up or down from its menu. |
| Course pages | `/course/ID/...` | Overview, Materials, Assignments, Grades and Announcements, in the same look as the rest of the app. |
| Calendar | `/calendar` | Month, week and agenda views. |
| Grades | `/grades/grades` | Current grade per course, recently graded work with teacher feedback, and the full gradebook one tap away. |
| Messages | `/messages` | Inbox and sent, reading, replying and composing through your Schoology account. |
| Groups, Class posts, Settings | `/groups`, `/home#/posts`, `/home#/settings` | Your groups; announcements from your classes; appearance, names and diagnostics. |
| Everything else | submission pages, resources... | Left as native Schoology with the navigation added. |

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

One stylesheet, `src/ui.css`, owns the look. The default is a light, blue-and-white interface; choosing a dark background colour in Settings switches the whole UI to a dark palette.

- **Colour:** background `#F8FAFC`, surface `#FFFFFF`, secondary surface `#F1F5F9`, text `#0F172A`, secondary text `#475569`, border `#E2E8F0`, accent `#2563EB`. No gradients, glow, background patterns or shadows except on menus and dialogs. Text pairs are 7:1 or better, status colours 5:1 or better, and control borders are 3.4:1 or better (WCAG 2.2 AA).
- **Type:** Inter (bundled in `fonts/`, SIL Open Font License): 28 for page titles, 18 for section headings, 16 for assignment titles, 15 for body, 14 and 13 for metadata. Nothing is shrunk to fit.
- **Spacing and shape:** a 4/8/12/16/24/32/48 scale; radii 6, 8 and 12; 40px controls and 44px touch targets for the tick boxes and the bottom navigation.
- **Structure:** content sits on the page background; each list is one white surface with hairline dividers between rows, not a card per item. Status is written as text ("Overdue", "Graded"), not as badges.
- **Navigation:** eight destinations (Dashboard, Courses, Assignments, Calendar, Grades, Messages, Groups, Settings) in a narrow rail; below 900px a bottom bar with the four everyday destinations and a More menu. The top bar only holds search and the notification bell; refresh, the theme switch, the school portal link and sign out live in the account menu.

## Dashboard

- **Greeting and summary:** "Good evening, Adam." and one factual sentence ("You have 3 assignments due this week."), then `9 outstanding · 5 due this week · 0 unread grade updates`, each part a link. *Outstanding* = open work, overdue included; *due this week* = open work due today through 7 days out, overdue not counted; *unread grade updates* = unread grade notifications.
- **Urgent work:** Overdue, Due today and Upcoming (next 7 days), in that order. Empty groups do not appear. Each row has a tick box, the assignment title, course, due date and a status only when it says something. Eight rows show at first, with "Show more" and a link to all assignments. Due date order is not importance, and the app does not claim otherwise.
- **Courses:** a list with the original Schoology image, the course name, upcoming and overdue counts and the next assignment. A course with nothing coming up shows only its name. Pin, move up/down, change image and rename are in each row's menu. Courses are not split into current, supplementary or archived because Schoology's course list has no reliable metadata for that.
- **Recent updates:** up to five new grades, grade changes and new assignments from the notification history (with teacher feedback when the gradebook has it), unread ones marked "New"; "Show more" reveals the rest. Deadlines within 24 hours stay in the bell and in the urgent list rather than being repeated here.
- **Status words (only what Schoology's data supports):** *Graded* (the gradebook shows a score), *Submitted* (handed in, not graded), *Marked done* (you checked an assigned item off here; never shown as submitted), *Completed* (a personal task you finished), *Overdue* (on Schoology's missing list), *Open* and *To do*. "Not started" and "In progress" are not offered because Schoology does not expose them.

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
src/ui.css     the design system and every component style
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
