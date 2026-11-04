---
name: Schoology Overhaul
description: A quiet, warm-dark student dashboard for Schoology. Plain type, one accent, soft containers.
colors:
  background: "#151311"
  content: "#1B1916"
  card: "#221F1B"
  hover: "#2A2621"
  selected: "#332E28"
  border: "#35312B"
  border-strong: "#4A443B"
  text: "#F7F2EA"
  text-muted: "#BDB3A6"
  text-faint: "#968C7F"
  accent: "#8AA8FF"
  on-accent: "#05070A"
  success: "#6FD3A0"
  warning: "#F2BD6A"
  danger: "#EF8A80"
typography:
  hero:
    fontFamily: "SGO Inter, Inter, system-ui, sans-serif"
    fontSize: "36px"
    fontWeight: 680
    lineHeight: 1.15
  headline:
    fontFamily: "SGO Inter, Inter, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 650
    lineHeight: 1.25
  title:
    fontFamily: "SGO Inter, Inter, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.25
  body:
    fontFamily: "SGO Inter, Inter, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "SGO Inter, Inter, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 550
    lineHeight: 1.45
rounded:
  sm: "10px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  xxl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.md}"
    height: "40px"
    padding: "0 16px"
  button-default:
    backgroundColor: "{colors.card}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    height: "40px"
    padding: "0 16px"
  button-ghost:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    height: "40px"
    padding: "0 16px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "24px"
  input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    height: "40px"
    padding: "0 16px"
---

# Design System: Schoology Overhaul

> **Update (dashboard v2):** the dark topographic look is kept. The dashboard is now a header (date, greeting, one status sentence, week progress line), a grouped To do agenda (Overdue, Due today, Next 7 days, Later) and a right column with a compact Courses list, Announcements and Recent feedback. Re-run `/impeccable document` to refresh tokens.

## Overview

**Creative North Star: "The Quiet Desk"**

A tidy study desk at night: warm charcoal surfaces, sand-coloured text, one soft periwinkle accent that points at what to do next. Nothing performs. The interface exists to show what is due, what is missing and what the grade is, so type is plain, containers are calm, and decoration is minimal.

Density is moderate: generous 24px card padding, 14px body text, 48px list rows. The four base colours (background, contour lines, glow, accent) are user-changeable and every surface, border and text colour is derived from them, so the system holds under other themes (Slate, Midnight, Forest, Plum, Ember, Paper) and a light mode.

**Key Characteristics:**
- One typeface (Inter), normal tracking, sentence case, no italics.
- Tonal layering instead of shadows; one soft border per container.
- One accent colour; urgency is colour plus an icon plus a word.
- A very faint contour map sits behind the page and is never a focal point.

## Colors

A warm, brown-leaning charcoal palette with a single cool accent, so the accent is the only cool thing on the screen.

### Primary
- **Periwinkle** (#8AA8FF): the accent. Primary buttons, the active rail item, the active tab pill, assignment indicators (unless colour-coding by course is on), focus rings. Text on it is near-black (#05070A); accent-coloured text is darkened or lightened to stay readable.

### Neutral
- **Desk Black** (#151311): page background.
- **Content Charcoal** (#1B1916): content area and shell.
- **Card Charcoal** (#221F1B): cards, rows, inputs.
- **Hover Charcoal** (#2A2621) and **Selected Charcoal** (#332E28): hover and selected states, popovers.
- **Soft Edge** (#35312B) and **Firm Edge** (#4A443B): the default border and the ghost-button or divider border.
- **Sand White** (#F7F2EA), **Sand Grey** (#BDB3A6), **Sand Dim** (#968C7F): primary, secondary and tertiary text.

### Status
- **Mint** (#6FD3A0) done, **Amber** (#F2BD6A) soon or warning, **Coral** (#EF8A80) overdue or error. Always paired with an icon and a word.

### Named Rules
**The One Accent Rule.** Only the accent is cool and saturated. Course colours appear only when the student turns on colour-coding.
**The Derived Surfaces Rule.** Surfaces, borders and text are mixed from the background and contour colours, never hard-coded per component, so every theme keeps its contrast.

## Typography

**Display, Body and Label Font:** Inter (bundled as "SGO Inter", with system-ui fallbacks)

**Character:** One family, standard hierarchy, tabular numerals for grades and counts. No serif, no italic, no negative tracking, no all-caps eyebrows.

### Hierarchy
- **Hero** (680, 36px, 1.15): the dashboard greeting. Phones step down to 27px.
- **Headline** (650, 28px, 1.25): page headings. Section headings are 600 at 21-24px.
- **Title** (600, 17px, 1.25): course titles and card headings (15px for small cards).
- **Body** (400, 14px, 1.55): all reading text; instructions at a 72-character measure and 1.7 line height.
- **Label** (550, 13px, 1.45): buttons, chips, menu items. Metadata is 12px, the smallest text is 11px.

### Named Rules
**The Plain Type Rule.** Normal letter-spacing, sentence case, upright text everywhere. Emphasis comes from weight and size only.

## Layout

A 96px icon rail (72px collapsed) on the left; on screens under 900px it becomes a slide-in drawer opened by one large accent Menu button. The page is capped at 1440px. The dashboard reads top to bottom: greeting, priorities, courses, with a right column (progress, announcements, feedback) that drops beneath the courses below 1280px. Spacing steps by 8px (4px for micro adjustments, 12px as the one in-between). Scrolling happens inside the content pane. Core grid and container positions are fixed; styling passes must not restructure them.

## Elevation & Depth

Flat by default. Depth is tonal: background, content, card, hover/selected, popover and dialog are successive charcoal layers. Shadows are reserved for floating things (popovers, dialogs, toasts) and are neutral black; there are no coloured glows. Backdrop blur appears only on popovers (12px) and modal backdrops (6px).

### Shadow Vocabulary
- **Popover** (`box-shadow: 0 8px 24px rgb(0 0 0 / .4)`): menus and popovers.
- **Dialog** (`box-shadow: 0 16px 40px rgb(0 0 0 / .55)`): modals.

### Named Rules
**The Flat-At-Rest Rule.** Cards do not lift, glow or change shadow on hover; at most the border strengthens.

## Shapes

Soft but not bubbly: 10-12px on controls, 16px on cards, 24px on hero panels and dialogs, full pills for tabs and the utility group, a circle for the profile initial (56px, 44px collapsed). One border per container; no nested double borders. Dividers are spacing, not lines or illustrations.

## Components

### Buttons
- **Shape:** 12px radius, 40px high, 16px side padding, 13px label at weight 550.
- **Primary:** accent fill, near-black text; hover mixes the accent toward white.
- **Default:** card-tone fill; hover a faint lighter wash.
- **Ghost:** transparent with a Firm Edge border; used for secondary actions like Back and the Lock toggle.

### Cards / Containers
- **Corner Style:** 16px. **Background:** Card Charcoal. **Border:** one Soft Edge line. **Padding:** 24px. No shadow.

### Inputs / Fields
- **Style:** 40px, 12px radius, tonal fill, Soft Edge border. **Focus:** a 2px accent outline. Dropdown option lists use the card layer colours, never browser white.

### Navigation
- Icon rail with a label under each icon, accent indicator on the active item, tooltips when collapsed. Tabs are a pill that slides to the active tab. Top-right utilities (notifications, theme, refresh, light/dark) are one solid pill.

### Priority row
Course name, title link, due text, an urgency badge (icon plus word), a tick and a round arrow. Overdue rows get a faint coral wash only; completed rows fold away with an Undo toast.

### Hypothetical grade bar
A Lock / Edit toggle and a prominent Add grade button at the very top of the Grades page and each course's Grades tab; results show the real grade and "With your changes" side by side.

## Do's and Don'ts

### Do:
- **Do** use Inter at the sizes above, with normal tracking and sentence case.
- **Do** build surfaces from the derived charcoal layers and one Soft Edge border.
- **Do** pair every urgency colour with an icon and a word.
- **Do** keep text high-contrast on every theme and keep focus rings visible.
- **Do** keep the hypothetical-grade layer clearly local ("never sent to Schoology").

### Don't:
- **Don't** use italics, negative letter-spacing, uppercase eyebrow labels, section numbering or a display serif.
- **Don't** add coloured glows, hover lifts, decorative dividers or low-opacity text.
- **Don't** introduce a second accent or colour-code by course unless the student turns it on.
- **Don't** restructure the dashboard grid or container positions in a styling pass.
- **Don't** put a box inside a box with a second border.
