# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Students who use Schoology (any school whose address matches `*.schoology.com`) and want a calmer, faster way to see what is due, their courses, materials and grades. The author is a student and uses it daily; the intended release is public (Chrome Web Store), so it must work for accounts the author cannot test against. Primary job: open the app, see what needs doing today, find a course file, check a grade.

## Product Purpose
A Manifest V3 Chrome extension that replaces Schoology's interface with a modern dashboard, assignments list, calendar, grades, course pages, inbox and groups. It is a UI/UX overhaul only. Success: a student can see overdue and upcoming work at a glance, open course files in the app, and understand their grades, without fighting Schoology's own pages.

## Positioning
It works entirely inside the student's signed-in browser session: same-origin reads of Schoology's own pages, no server, no account, no AI. A hypothetical-grade layer sits directly on the real gradebook, which Schoology's own UI does not offer.

## Operating Context
Runs as a content script on Schoology pages; native pages are hidden, never removed, and "Classic view" restores them in one click. Data comes from Schoology's own endpoints and gradebook markup, which vary by district and could only be verified against a mock, so selectors are tunable (Settings → Diagnostics).

## Capabilities and Constraints
- Student-facing and read-mostly: submission always happens on Schoology's own pages; the app only links to them.
- Only the `storage` permission; no background worker; no network calls except same-origin requests to Schoology. No credentials read, no data leaves the browser. Preferences and cache live in `chrome.storage.local`.
- No fabricated data: grades verbatim, "Done" is a personal local tick, missing work comes from Schoology's overdue list and gradebook.
- Hypothetical grades: a Lock / Edit toggle (starts Locked), Add grade at the top of the Grades page, custom categories with weights, what-if scores; saved only locally, never sent to Schoology.
- Plain JavaScript, no build step; core layout, grid and features are not to be restructured by styling passes.
- Open: Schoology's markup could not be validated on a real account; the Spanish-overdue and refresh issues were fixed without live reproduction.

## Brand Commitments
Name: Schoology Overhaul. Direction changed (Nov 2026): the default is now a light, blue-and-white, Schoology-inspired look (near-white background `#f8fafc`, accent `#1769d6`, dark navy/charcoal text), with Light / Dark / System theme modes in Settings → Display. The contour map is off by default and there is no blur setting. Still true: one sans-serif (Inter), sentence case, no italics or decorative dividers, quiet containers with one soft border. An accent that cannot reach 4.5:1 contrast on the page is replaced automatically. Existing users on the old charcoal default are migrated once (`blueV`); their own custom colours are kept.

## Evidence on Hand
README.md documents behaviour; tests/ holds 8 case scripts and a mock Schoology server (`node tests/mock-server.js`). Bundled assets: Inter font, 12 public-domain/CC0 banner photos with credits in `banners/CREDITS.md`. No real-account screenshots, user research or metrics exist; none should be invented.

## Product Principles
1. Show the truth Schoology reports; never invent or silently hide work that is missing.
2. Never touch submission or send anything to Schoology from the hypothetical layer.
3. Stay quiet: calm, legible, standard type and few borders over expressive styling.
4. Keep it private and light: local storage only, minimal permissions, fast first paint.
5. Fail gracefully: a broken selector or ended session should leave Schoology usable, not a blank page.

## Accessibility & Inclusion
Required: sufficient contrast on every theme (text colour switches with background), full keyboard use with visible focus, `prefers-reduced-motion` respected, and colour never the only carrier of urgency (icon plus word).
