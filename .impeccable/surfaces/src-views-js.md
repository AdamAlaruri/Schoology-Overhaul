---
version: 1
slug: "src-views-js"
primary_target: "src/views.js"
related_targets: []
---

# Surface brief: whole app (dashboard, courses, assignments, grades, calendar, inbox)

Scope and mode: Operate. A student opens it daily to see what is due, open a course file, check a grade.
Chosen direction: "Marker on paper" (assigned by the roll), light by default, confirmed with the user.
Unresolved: dark theme keeps the old warm charcoal values; only light is re-drawn first.

## Direction contract

THESIS: The page is a cool white sheet with ink-black text; the only loud thing on it is a marker-yellow highlight, used solely for work that needs action now. Refuses the dark-glass, glowing-card dashboard and boxes inside boxes.

OWN-WORLD: Ground #F7F8FA, content white, one hairline border #E3E6EB, ink #14171C / #4B5563 / #6B7280, action blue #2457D6, marker yellow #FFE45E reserved for overdue and due-today. Flat surfaces, no shadows at rest, no contour map, no glow. Inter, normal tracking, sentence case. Recognisable with content removed: white panels on pale grey, one blue button, a yellow underline stroke.

STORY: The visitor sees in seconds what is overdue or due today (highlighted), what is next, and where each course stands, then opens it. Nothing decorative competes.

FIRST VIEWPORT: Left rail (icon + label, blue active). Top: greeting at 32px with the count of items still to do. Below, Today's Priorities as a flat list (course small, title medium, due text muted, badge right); overdue and today titles carry the marker stroke. Right column: week progress, announcements, feedback as plain sections. Courses grid below priorities. Primary action (Add task) sits top-right of the priorities header.

FORM: Marker on paper, grounded candidate 6 of the ordered list; seed: seed:e2ab5d11d87e4157.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
