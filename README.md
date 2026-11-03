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
| Grades | `/grades/grades` | One row per course, all collapsed when the page opens; open a row for assignment-level rows grouped by category, as reported by Schoology. |
| Settings | `/home#/settings` | Theme, accent, course colours, school links, banners, diagnostics, clear cache. |
| Everything else | course pages, submission pages, messages, resources... | Left as native Schoology, with the sidebar, a course-colour accent bar, "This course" shortcuts and light dark-mode styling. |

## Course cards

- Cards are generated only from courses detected in Schoology; none are hardcoded.
- Custom names, colours, covers and order are saved in `chrome.storage.local` and keyed by Schoology's course id, so links and identification never change. The original name stays visible under a renamed title, and "Reset to original" in the Customize dialog restores everything for that course.
- Custom names are used everywhere in the redesign: sidebar, assignments, calendar, grades.
- Uploaded cover images are downscaled and stored locally only. No image URLs are fetched from the web.

## Course banners

- Every class shows its **original Schoology course image** by default. The extension reads the image address from the home Course Dashboard (matching the dashboard card's title, which begins with the course title and a colon) and never downloads, edits or replaces it. A class Schoology gives no image (for example an Advisory) gets an abstract subject cover on the dashboard, drawn from the course title; no image is ever fetched.
- **Change banner** (image icon on a card) offers the original, seven optional photographs (Science, Biology, History, English, Computer Science, Languages, Arts & electives) and an upload. The photographs are real public-domain or CC0 pictures from Wikimedia Commons bundled in `banners/`, with credits in `banners/CREDITS.md`; nothing is generated and nothing is fetched at run time. Mathematics classes are suggested the Science photo. Choose, preview, then **Apply**. Under Settings, **Restore original Schoology banners** and **Reset all banners** apply to every class.
- Choices are stored per course id in `chrome.storage.local`.

## Course view

- **Hero:** a tall rounded banner whose lower edge fades out so the page's own glow and contour lines show through; the course name in bold with an inline pen to rename, and the code (for example MATH&151), teacher and term beneath it. **Change banner** and the course menu sit top-right as solid, ringed buttons that stay readable over any image.
- **Tabs:** a pill that slides to the active tab.
- **Materials lead:** the wide left column is Materials, with quick-filter chips (All, Folders, Files, Assignments, Links and pages, each with a count), a search box, a sort menu (teacher's order or A to Z) and grouped lists under divider pills. Folders have an arrow that peeks inside without leaving the page, and the Materials tab uses the same tools.
- **Supporting column:** *Up next* is a timeline (a node per assignment, a Missing or Open chip, an arrow to open it); *Announcements* is a compact feed, and an empty one collapses to a single slim row; *Course* is aligned key and value rows with soft dividers; the Schoology note is quiet micro-copy.
- **Assignment and announcement pages:** a back pill, a 40px-padded card with the title, fact tiles, the action, then Instructions at a 72-character measure and 1.7 line height; announcements are a feed of cards with the same reading width.
- **Grades:** a summary card with the grade in large type, and a table card with full-contrast text, so nothing sits on the bare background.
- **Depth:** cards are charcoal with soft corners, a glow behind the border that strengthens on hover, and the contour map is slightly stronger on this page.

## Native course pages

Every course opens inside the app; the legacy Schoology course page is never shown (add `?sgo=classic` to a URL to see it on purpose, or use "Open in Schoology"). Real Schoology addresses are kept, so refresh, back/forward and bookmarks work:

- `/course/ID/materials` is the Overview; `?tab=materials`, `?tab=assignments[&a=ASSIGNMENT]`, `?f=FOLDER` (nested folders with breadcrumbs), `/updates` (Announcements) and `/student_grades` (Grades).
- Folders, files, links and assignments come only from Schoology's own materials pages; order is preserved and counts are real. Nothing is invented.
- Your personal to-do tick is separate from Schoology's submission status.
- Loading shows skeletons, failures show a retry, an ended session shows a sign-in prompt, and fetched pages are cached.

## Design system

"Topographic precision", warmed up: deep charcoal surfaces, soft rounded corners, gentle gradients, fine contour lines in a warm sand tone. One stylesheet owns the look (`src/theme.css`); `src/styles.css` holds component layout only and consumes its tokens.

- **Typography:** one font, Inter (bundled in `fonts/`, SIL Open Font License), declared once and inherited everywhere. Scale: hero 36/680, page heading 28/650, section 21/600, course title 17/600, card heading 15, body 14, metadata 12, micro-label 11 (phones step down: 27, 23, 19, 16). Grades, percentages and statistics use tabular numerals.
- **Colour:** background `#151311`, content `#1B1916`, cards `#221F1B`, hover/selected `#2A2621` / `#332E28`, borders `#35312B` / `#4A443B`; text `#F7F2EA` / `#BDB3A6` / `#968C7F`; accent `#8AA8FF`; success `#6FD3A0`, warning `#F2BD6A`, danger `#EF8A80`. Urgency always pairs colour with an icon and a word.
- **Layers:** L0 background, L1 content, L2 cards, L3 hover and selected, L4 popovers, L5 dialogs. Backdrop blur only on popovers (12px) and modal backdrops (6px), never on cards or the header (nothing scrolls beneath it, so blur there only costs frames).
- **Spacing and shape:** 4/8/12/16/24/32/40/48/64px tokens, 40px buttons and inputs, radii 10, 12, 16 and 24px. Motion is 150-400ms on one ease-out curve, `cubic-bezier(.22,1,.36,1)`: menus, popovers and dialogs arrive with a short fade and scale, dialogs fade out, and expanding sections ease open. `prefers-reduced-motion` turns it all off.
- **Colour themes:** the palette button in the top bar opens a quick list of looks (Hearth, Slate, Midnight, Forest, Plum, Ember, Paper); **Customise appearance** (also in Settings) opens a split-view panel: the miniature dashboard (drawn over the real contour map and glow, with the same seed, density and weight as the page) stays on the left with the accent colour, and every control sits beside it on the right, so nothing needs scrolling to see an edit. Quick-colour chips fill in three colours (background, contour lines, glow); every surface layer, border and text colour is derived from them, so the layout never changes, and the contour map and glow are drawn exactly as before. The **accent colour** is chosen separately in the same panel and is never changed by a theme. The map's on/off, line density, line weight (thin, standard, bold) and shape are in the same view.
- **Course colours:** fourteen colours in five families (Warm, Green, Blue, Purple & pink, Neutral), plus any custom colour, in the course editor and in Settings (one row per course that opens its families). The accent colour picker is grouped the same way. By default every assignment and material indicator, and the bottom of every course card (dashboard and Courses page), uses one unified colour (the accent), with the word and icon carrying the meaning; Settings → Course colours → *Colour-code assignments by course* tints them with each course's colour instead.
- **Hide from dashboard:** in a course's ⋯ menu, on the course page and on the Courses page. A hidden course disappears from the dashboard (and its assignments from Today's Priorities) but stays fully available under Courses; the dashboard says how many are hidden. Summer work and Advisory start hidden until you choose otherwise.
- **Course names:** Schoology's name is shown exactly as given (nothing is parsed or tidied). Rename a course with the pencil on its card (Enter saves, Escape cancels, empty goes back to Schoology's name), or with the pencil beside the title on the course page. There is no fixed list of names in Settings.
- **Name:** Settings → Profile saves as you type; the Account menu in the rail has **Edit name…** for a quick fix.
- The interface switches between light and dark text according to the background colour, so contrast always holds.

## Dashboard

Reading order: greeting, academic overview, today's priorities, courses, recent activity.

- **Hero:** greeting, one sentence derived from your real data (overdue, due today, or the quirky message when nothing needs attention), the count of assignments still to do this week, and a live clock and date on the right (updates on the minute). Grades are deliberately not shown here.
- **Today's Priorities:** overdue, due today, due soon, then later; five shown, the rest behind "Show more". Each row has course, title, due date, an urgency badge, a tick and a small round arrow button that opens the assignment. Ticking draws the check, folds the row away, then updates progress and shows a floating confirmation with **Undo** (outside the page flow, pauses on hover, always fades out the same way). Completed items are listed below. Filter by course, or add your own task.
- **Courses:** cover, title, code, **Current grade** (or "Grade not available"), **Next assignment** with its urgency. Summer work and Advisory courses are left off the dashboard. On a dashboard card the pen and ⋯ buttons fade in only on hover or keyboard focus (always visible on touch screens), solid and ringed so they read over any banner. The ⋯ menu has **Rename**, **Change banner**, **Notification icon…** (eight symbols, saved per course) and **Colour and name…**. **Change banner** offers Automatic, Typographic (the name set large in the course's own colour), Original, twelve bundled images and your own upload; the choice shows the same on the dashboard, Courses page and course page. A cover you chose always wins; otherwise (Automatic) a bundled photograph when one fits the subject (biology, history, English, languages, computer science), and a typographic banner for the rest. Schoology's own generic picture is used only if you pick "Original". The course with the soonest deadline gets the contour treatment.
- **Right column:** "This week" progress with an encouraging line, the latest three announcements (View all expands) and recent feedback. Below 1280px it sits beneath the courses.
- **Navigation:** 96px rail (72px collapsed) with Account, Dashboard, Courses, **Assignments**, Grades, **Search** (opens a search overlay for assignments and courses: type, arrow keys, Enter; `/` or Ctrl+K opens it from anywhere), Groups, Calendar, Inbox and Accessibility. The Account button is a circle with the first letter of your name; profile pictures are never shown. There is no top bar: the bell, colour theme, refresh and light/dark buttons float at the top-right in one minimal pill. There is no search box on any page body. The Account circle is 56px (44px collapsed) with a large bold initial. The Assignments page's *include in your workload?* prompt is one slim line (Include all, or Review to open the list). There are no school links in the top bar or rail, blue indicator and glow on the active item, tooltips when collapsed, a quiet static contour fragment at the bottom. The collapse control is a labelled row at the bottom of the rail. The collapse button flips a class on the live page rather than rebuilding it, so the width, labels and chevron animate together and keyboard focus stays on the button. Under 900px there is no bottom bar: one large accent-coloured **Menu** button opens the same navigation as a slide-in drawer (scrim, close button, Escape and choosing a destination all close it).

## Topographic background

`src/topo.js` generates a real contour map in code: a warped elevation field built from several hills, with iso-lines extracted by marching squares and written as smooth cubic Bézier `<path>` elements. It is one fixed, full-viewport SVG with a soft permanent blur (1.5px, background layer only, not adjustable) (`#sgo-bg`, `pointer-events: none`, behind everything, shown at about 15% opacity under a faint blue glow), drawn at document start from `src/early.js` so it is there before the page paints. The same engine makes the smaller pieces (hero, featured and hovered course cards, section dividers, rail, empty states) as data-URI images exposed as `--topo-*` variables. The geometry is generated once and kept; nothing animates. Strokes read CSS variables, so recolouring changes the paths themselves.

**Settings → Appearance** has buttons to turn the **topographic map** on or off, set its **line density** (Light, Standard, Dense) and draw a **New map**, and four independent colours, each with a picker and a hex field, plus curated presets and a reset: contour lines (`--contour-color`), contour glow (`--contour-glow`, drawn under the major contours), background (`--app-background`) and accent (`--accent`). Changes apply instantly and are saved with the other preferences in `chrome.storage.local`. Tests: `node tests/topo-cases.js`.

## Hypothetical grades (a layer on the Schoology gradebook)

There is no separate grading system: the hypothetical tools sit directly on the existing Schoology grades (the Grades page and each course's Grades tab). A **Lock / Edit** toggle and a prominent **Add grade** button sit at the top of the page, so nothing needs scrolling past long lists of assignments. The toggle starts **Locked**: grades are secured, the layer is read-only and Add grade is disabled. **Unlocked (Editing)** lets the student:

- **Add grade**: a dialog for a course, an assignment name, a category (one of Schoology's, one of their own, or a new one with a weight %), and earned / possible points.
- **Add categories** with their own weight %, and **set weights** for Schoology's own categories (useful when Schoology reports none).
- **Try a different score** on any assignment Schoology lists (a "what-if"), including ungraded ones, and reset it with one click.

The course then shows its real grade and **With your changes** side by side, with the difference. Inside a category the grade is points earned over points possible; the total is the weighted average of the categories that have scores (empty categories are left out and the rest scaled up; weights that do not add to 100% are scaled to 100% with a note; with no weights at all every point counts equally). The change is measured from the unchanged gradebook worked out the same way, so rounding or weights Schoology does not show never look like the student's doing. Everything is saved only in this browser (`hypo` in the extension preferences) and nothing is ever sent to Schoology. No letter grade is invented for hypothetical totals because grading scales differ by school.

## Calendar, Inbox and Groups

All three open in the redesigned app (no legacy flash, refresh and back/forward work). Data comes only from Schoology's own pages:

- **Calendar** (`/calendar`): month, week, day and agenda views, tests and events marked, "Add personal task" for your own dated items (saved only in this browser).
- **Inbox** (`/messages`, `/messages/sent`, `/messages/view/ID`): list, reading pane, search and an Unread filter. Message text is kept in memory only. Replying and composing (`/messages/new`) happen inside the app: the extension reads Schoology's own message form with your signed-in session, fills in your text and submits it, so Schoology delivers it and keeps it in Sent. Errors from Schoology are shown as-is, and "Open in Schoology" is always offered. Opening a message marks it read, as in Schoology.
- **Groups** (`/groups`): your groups with their latest posts. A single group (`/group/ID`) still opens on Schoology's own page.

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
