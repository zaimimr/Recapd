---
name: Recapd
description: A near-black event album where the photos are the only bright thing, and one sunset gradient marks the way out.
colors:
  coral: "#FF5E62"
  hot-pink: "#FF2D8E"
  violet: "#8B2FE0"
  pink-soft: "#FF7FB4"
  accent-surface: "rgba(255,45,142,0.14)"
  accent-surface-strong: "rgba(255,45,142,0.24)"
  accent-border: "rgba(255,45,142,0.38)"
  page: "#0B0B12"
  page-deep: "#07070C"
  card: "#15151F"
  card-elevated: "#1E1E2B"
  border: "#2A2A38"
  border-strong: "#3A3A4A"
  text-primary: "#FFFFFF"
  text-muted: "#A0A0B2"
  text-faint: "#6B6B7E"
  text-disabled: "#5C5C6E"
  pill-surface: "rgba(255,255,255,0.08)"
  glass: "rgba(255,255,255,0.14)"
  glass-border: "rgba(255,255,255,0.18)"
  overlay: "rgba(7,7,12,0.82)"
  danger: "#EF4444"
  danger-surface: "rgba(239,68,68,0.16)"
  success: "#22C55E"
  success-surface: "rgba(34,197,94,0.16)"
  warning: "#F59E0B"
  warning-surface: "rgba(245,158,11,0.16)"
typography:
  display:
    fontSize: "30px"
    fontWeight: 800
    lineHeight: "34px"
    letterSpacing: "-1px"
  title:
    fontSize: "24px"
    fontWeight: 800
    lineHeight: "28px"
    letterSpacing: "-0.7px"
  heading:
    fontSize: "19px"
    fontWeight: 700
    lineHeight: "24px"
    letterSpacing: "-0.4px"
  subheading:
    fontSize: "16px"
    fontWeight: 700
    lineHeight: "21px"
    letterSpacing: "-0.3px"
  body:
    fontSize: "15px"
    fontWeight: 500
    lineHeight: "21px"
    letterSpacing: "-0.1px"
  bodyStrong:
    fontSize: "15px"
    fontWeight: 700
    lineHeight: "21px"
    letterSpacing: "-0.2px"
  callout:
    fontSize: "13.5px"
    fontWeight: 500
    lineHeight: "19px"
    letterSpacing: "0"
  caption:
    fontSize: "12px"
    fontWeight: 600
    lineHeight: "16px"
    letterSpacing: "0"
  eyebrow:
    fontSize: "11px"
    fontWeight: 800
    lineHeight: "14px"
    letterSpacing: "1.4px"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  xxl: "24px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  xxl: "24px"
  xxxl: "32px"
  huge: "40px"
components:
  button-primary:
    backgroundColor: "{colors.hot-pink}"
    textColor: "{colors.text-primary}"
    typography: "{typography.subheading}"
    rounded: "{rounded.lg}"
    padding: "0 20px"
    height: "54px"
  button-primary-disabled:
    backgroundColor: "{colors.card}"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.lg}"
    padding: "0 20px"
    height: "54px"
  button-secondary:
    backgroundColor: "{colors.card-elevated}"
    textColor: "{colors.text-primary}"
    typography: "{typography.subheading}"
    rounded: "{rounded.lg}"
    padding: "0 20px"
    height: "54px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.hot-pink}"
    typography: "{typography.subheading}"
    rounded: "{rounded.lg}"
    padding: "0 16px"
    height: "46px"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.text-primary}"
    typography: "{typography.subheading}"
    rounded: "{rounded.lg}"
    padding: "0 20px"
    height: "54px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.xl}"
    padding: "16px"
  field:
    backgroundColor: "{colors.card-elevated}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
    height: "52px"
  pill:
    backgroundColor: "{colors.pill-surface}"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.pill}"
    padding: "5px 10px"
  pill-live:
    backgroundColor: "{colors.success-surface}"
    textColor: "{colors.success}"
    rounded: "{rounded.pill}"
    padding: "5px 10px"
  pill-accent:
    backgroundColor: "{colors.accent-surface}"
    textColor: "{colors.pink-soft}"
    rounded: "{rounded.pill}"
    padding: "5px 10px"
  list-row:
    backgroundColor: "{colors.card}"
    textColor: "{colors.text-primary}"
    typography: "{typography.bodyStrong}"
    padding: "13px 16px"
    height: "60px"
  stat-tile:
    backgroundColor: "{colors.card-elevated}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.lg}"
    padding: "12px 8px"
  icon-button:
    backgroundColor: "{colors.pill-surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.pill}"
    size: "38px"
  grid-tile:
    backgroundColor: "{colors.card-elevated}"
    rounded: "{rounded.sm}"
    padding: "2px"
---

# Design System: Recapd

## Overview

**Creative North Star: "The Dark Room with One Lit Door"**

Recapd is a room with the lights off. The ground is near-black (`#0B0B12`), every surface above it is a slightly lighter grey-violet, and the only things that glow are the photos people brought and the single gradient control that says what to do next. That is the whole idea: the album is the interface, chrome recedes, and the sunset gradient is rationed so hard that its appearance reads as an instruction rather than as decoration.

The density is generous rather than tight. Cards are big, corners are soft (20px on the outer card), and every interactive target clears a thumb in the dark. Type is heavy and tightly tracked — the headline voice is a blunt statement, not a display flourish — and it runs on the platform's own system face, so the app never spends a frame waiting on a webfont and never looks imported. Where the product is a form (join, onboarding, create), the form is short, centred, and capped at a readable measure; where the product is photographs, the photographs run to the edges at two-pixel gutters and nothing but a status badge sits on top of them.

This world is a deliberate refusal of what the app used to be: a light, grey, bordered, form-shaped utility. It is also a refusal of the other obvious direction — a gradient-drenched party app. The gradient appears once per screen. Everything else is black, grey, and photographs.

**Key Characteristics:**

- Dark only, one appearance, no light theme and no toggle.
- One coral→pink→violet gradient, spent on one filled control per screen.
- Depth from a 1px `#2A2A38` edge and a lighter fill, not from shadow.
- One icon family (Feather), one stroke weight, no exceptions.
- One authored motion moment: feed tiles settling in. Everything else is instant.
- Type hierarchy carried entirely by weight and tracking on the system face.

## Colors

A near-black grey-violet ladder with a single three-stop sunset ramp laid across it, plus the standard traffic-light set used only for state.

### Primary

- **Sunset Ramp — Coral `#FF5E62` → Hot Pink `#FF2D8E` → Violet `#8B2FE0`**: the brand gradient, at a 135° diagonal. It fills exactly one control per screen: "Join an album" on home, "Add your photos" on an event, "Upgrade to Pro" in settings. It is never a background, never a header wash, never a decorative panel.
- **Hot Pink** (`#FF2D8E`): the flat accent, used where a gradient cannot go — the active tab tint, the text cursor and selection, the pull-to-refresh spinner, the ghost button's label, the `d` in the Recapd wordmark, and the retry chip on a failed upload tile.
- **Soft Pink** (`#FF7FB4`): the readable accent. Anything small, pink, and meant to be read uses this instead of hot pink, because hot pink at 11px on near-black is a contrast failure — eyebrow labels, list-row icons, the empty-state glyph, accent-pill text.

### Neutral

- **Ink** (`#0B0B12`): the page ground and the splash background, so launch does not flash a different dark.
- **Deep Ink** (`#07070C`): the darker ground, used as the base of the modal overlay (`rgba(7,7,12,0.82)`) that dims a screen behind a dialog.
- **Card** (`#15151F`): every card, every panel, and the fill a disabled button falls back to.
- **Raised Card** (`#1E1E2B`): the surface one step above a card — input shells, stat tiles, grid-tile backing, the secondary button.
- **Edge** (`#2A2A38`): the 1px border that does the structural work in this system, and the hairline divider between list rows.
- **Strong Edge** (`#3A3A4A`): the rare emphasised border.
- **White** (`#FFFFFF`): all primary text, and the label on any filled control.
- **Muted** (`#A0A0B2`): secondary text, metadata, placeholders, inactive segment labels. This is the contrast floor for body copy.
- **Faint** (`#6B6B7E`) and **Disabled** (`#5C5C6E`): dividers' text, inactive tab labels, the trailing chevron. Never used for anything a user must read.

### Tertiary

State colours are functional only and never brand-adjacent: **Danger** `#EF4444` (destructive actions, field errors, the remove chip), **Success** `#22C55E` (the Live pill and its dot, privacy checkmarks), **Warning** `#F59E0B` (Upcoming, expiry inside five days, permission "Action needed"). Each pairs with its own 16%-alpha surface so a tinted chip never needs a border.

### Named Rules

**The One Lit Door Rule.** Exactly one gradient-filled control per screen. If a screen wants two, one of them is secondary and wears `#1E1E2B` with a `#2A2A38` edge instead.

**The Dropped Gradient Rule.** A disabled control is not the primary action any more, so it drops the gradient entirely and falls to flat `#15151F` with muted text. Never fade the gradient; a translucent gradient reads as broken rendering, not as unavailable.

**The Readable Pink Rule.** Hot pink is for fills, tints and single glyphs. Anything small and pink that must be *read* uses soft pink `#FF7FB4`.

**The Single Appearance Rule.** There is one theme object and it is dark. `constants/theme.ts` exports a single `theme` const with no light variant and no `getTheme` switch; `app.json` pins `userInterfaceStyle: "dark"` and the splash background to `#0B0B12`. Do not add a light palette, a system-appearance listener, or a theme toggle.

## Typography

**All roles:** the platform system face (San Francisco on iOS, Roboto on Android). No `fontFamily` is set anywhere in the app.

**Character:** heavy, tight, and spoken rather than styled. Headlines sit at weight 800 with negative tracking down to -1px, which gives the system face a compressed, poster-ish set without importing anything. Body text is weight 500 and stays quiet at `#A0A0B2`. The pairing is one face doing all nine jobs; the hierarchy comes from weight and tracking, never from a second family.

### Hierarchy

- **Display** (800, 30px, 34px line, -1px): the home hero and the one statement a screen is allowed to make.
- **Title** (800, 24px, 28px line, -0.7px): section headers, which double as the app's large page titles. The album title on an event screen overrides to 26px/30px.
- **Heading** (700, 19px, 24px line, -0.4px): empty-state titles and in-card headings.
- **Subheading** (700, 16px, 21px line, -0.3px): album card titles, button labels, nav-bar titles (17px).
- **Body** (500, 15px, 21px line, -0.1px): ledes, descriptions, input text. Capped at a 680px measure.
- **Body Strong** (700, 15px): list-row titles and field labels.
- **Callout** (500, 13.5px, 19px line): in-card secondary lines, small-button labels.
- **Caption** (600, 12px, 16px line): metadata, hints, field errors, nav subtitles.
- **Eyebrow** (800, 11px, +1.4px tracking, uppercased by the component): grouped-section labels only.

The six-character album code is the one bespoke type treatment: 34px / weight 800 / +10px tracking, centred in a card, so the characters read one at a time when someone is copying them off a host's screen across a room.

### Named Rules

**The Weight-Not-Family Rule.** One platform system face carries the entire hierarchy, and it is expressed through weight (500 → 700 → 800) and tracking. Do not introduce a second font family, a serif, or a display webfont. The app loads exactly one font at boot — the Feather icon set — and ships no text font of its own.

**The Tightening Rule.** The bigger the type, the tighter the tracking: -1px at 30px, -0.3px at 16px, 0 at 13.5px and below. Eyebrows invert this and open to +1.4px, which is what makes them read as labels instead of as small headlines.

## Layout

All measurements are density-independent points (pt on iOS, dp on Android), not CSS pixels.

**Spacing** runs on an eight-step scale — 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 — applied through `gap` rather than margins wherever the platform allows it. The two recurring rhythms: 16 for the screen's horizontal gutter and a card's internal padding, and 32 between top-level sections of a scrolling screen.

**The measure cap.** `CONTENT_MAX_WIDTH` is 680. Phones are narrower and ignore it; tablets stop stretching at it and centre the column. This is implemented by `ScreenScroll`, which wraps its children in a real `View` carrying `maxWidth: 680` and `alignSelf: "center"`. Screens that build their own scroller (the event screen's masonry header, the home masthead) repeat that pair by hand.

**Short screens centre.** `ScreenScroll` takes a `center` prop that adds `flexGrow: 1` + `justifyContent: "center"` to the scroll container, so a three-field form sits in the middle of the viewport instead of stranded against the top. Content taller than the viewport still scrolls normally. Home, onboarding, and the name gate all use it.

**Navigation.** Three tabs (Home / My Events / Settings) on an 84pt iOS / 66pt Android bar in `rgba(15,15,22,0.98)` with a hairline top edge. Top-level screens have no header — their title lives in the body as a `SectionHeader`. Deep screens and sheets use the inline `NavBar`: a 38pt circular back or close control on the left, a centred title with optional subtitle, and up to two `IconButton`s on the right.

**The feed** is the exception to every gutter above: a 2 / 3 / 4-column masonry list at a 2pt padding per tile, running edge to edge under a header card, with a density switcher pinned above it.

### Named Rules

**The Real Child Rule.** `maxWidth` + `alignSelf: "center"` must sit on a real `View` child. The same properties on a `ScrollView` or `FlatList` `contentContainerStyle` are silently ignored and the capped column left-aligns on a tablet. This was a shipped bug; do not reintroduce it.

**The Anchored Masthead Rule.** A brand mark is an anchor, not content. The home wordmark sits outside the centred scroll block, pinned to the top of the screen, so it does not drift into the vertical middle when the page is short.

## Elevation & Depth

This system separates surfaces with **tonal layering and a hairline edge**, not with shadow. The ladder is `#0B0B12` page → `#15151F` card → `#1E1E2B` raised, and every card and tile carries a 1px `#2A2A38` border that does the actual separating. Shadows exist and are applied, but they are nearly invisible against a near-black ground by design: they seat an element rather than lift it.

### Shadow Vocabulary

- **Card seat** (`0 8px 18px rgba(0,0,0,0.35)`, Android elevation 6): on every `Card` and `AlbumCard`. Perceptible only at the card's bottom edge.
- **Accent glow** (`0 10px 20px rgba(255,45,142,0.45)`, Android elevation 10): on the gradient primary button only. This is the one place a shadow is meant to be *seen* — it is the halo under the lit door, and it disappears the moment the button is disabled.

Those two are the entire shadow vocabulary. There is no third depth step and no sheet shadow; a modal or sheet separates itself with the overlay behind it, not with a shadow of its own.

### Named Rules

**The Edge-Before-Shadow Rule.** If two surfaces need separating, change the fill one step up the ladder and draw a 1px `#2A2A38` edge. Reach for a shadow only when the element is the primary action.

## Shapes

Corners are generously soft and get softer as containers get bigger: 8 on a media tile, 12 on a small icon chip, 16 on buttons and inputs, 20 on cards, 24 where a panel is large, and fully round (999) on pills, avatars and the circular nav and icon buttons. Nothing in the app is square-cornered.

Borders are always 1px and almost always `#2A2A38`. A card can swap its border to `rgba(255,45,142,0.38)` via its `accent` prop to mark an advisory (the expiry countdown card), or to `#EF4444` to mark a blocked state (an album at its guest limit) — those are the only two border colours besides the default.

The recurring silhouette is a soft-cornered dark rectangle holding a left-aligned glyph, a stack of text, and a trailing chevron or badge. It scales from a 60pt list row up to a 104pt-cover album card without changing its logic.

### Named Rules

**The Nesting Radius Rule.** Radius decreases as you nest: a 20pt card holds 16pt buttons and inputs, which hold 12pt icon chips. Never nest a larger radius inside a smaller one.

## Components

### Buttons

- **Shape:** 16pt corners (`radius.lg`), three fixed heights — 54 (lg), 46 (md), 38 (sm) — full-width by default, with an icon allowed on either side of the label.
- **Primary:** the 135° coral→pink→violet gradient behind white weight-700 text, plus the accent glow. One per screen.
- **Secondary:** `#1E1E2B` fill, 1px `#2A2A38` edge, white label. This is the workhorse; most buttons in the app are secondary.
- **Ghost:** no fill, no border, hot-pink label. Used for the low-stakes third option ("Restore purchases", "Use a different code").
- **Danger:** a coral-to-red gradient (`#F97066` → `#EF4444`) with white text, used only for destructive confirmation.
- **Pressed:** opacity drops to 0.82 with a 0.985 scale. There is no hover state; this is a touch system.
- **Disabled / loading:** flat `#15151F`, muted text, no border, no gradient, no glow. A loading button swaps its label for a spinner in the same content colour and stays disabled.

**Implementation note:** the gradient is rendered with `react-native-svg` (`components/ui/Gradient.tsx`), not `expo-linear-gradient`. `react-native-svg` was already linked for QR rendering, so the entire visual system needs no native rebuild to adopt. Clip a gradient by giving its wrapper a radius plus `overflow: "hidden"`.

### Cards / Containers

- **Corner style:** 20pt.
- **Background:** `#15151F`, or `#1E1E2B` with the `elevated` prop.
- **Border:** 1px `#2A2A38`; `accent` swaps it to the pink border tint.
- **Shadow:** the card seat, per Elevation.
- **Padding:** 16 by default; `padded={false}` turns the card into a container for edge-to-edge `ListRow`s.
- A card takes an `onPress` and becomes a button, dropping to 0.75 opacity while pressed.

### Inputs / Fields

- **Style:** a 52pt-minimum shell at 16pt radius, filled `#1E1E2B` with a 1px `#2A2A38` edge, an optional leading Feather glyph at 17pt, and a weight-600 white value.
- **Label:** body-strong white, above the shell. **Hint:** caption muted, below it.
- **Focus:** no border change. The cursor and selection turn hot pink; that is the whole focus treatment.
- **Error:** the border turns `#EF4444` and the hint is replaced by a danger-coloured caption announced with `accessibilityLiveRegion="polite"`. The hint stays visible until an error takes its place.

### Pills

- **Style:** fully round, 10×5 padding, an 11.5pt weight-700 label, an optional 6pt dot or 12pt Feather glyph. No border — the tinted surface is enough.
- **Tones:** neutral (white 8% on muted text), live and success (green), warning (amber), danger (red), accent (pink tint on soft pink). Tone is never chosen by hand on an event: `lib/eventStatus.ts` maps status to `{label, tone, dot}` — Live/green/dotted, Upcoming/warning, Ended and Expired/neutral — and `expiryTone(days)` escalates the countdown to warning at five days and danger at two.

### Navigation

- **Tab bar:** Feather glyphs at 22pt over a 10.5pt weight-600 label; hot pink when active, `#5C5C6E` when not.
- **NavBar:** inline, transparent, 38pt circular controls on white-8%. A `dismiss` prop swaps the back chevron for an X and relabels it "Close".
- **Sheets close, steps go back.** Any modally-presented route (join, create, share, contribute, onboarding) shows the X. A chevron appears only for movement *within* a flow — the join screen's preview step going back to code entry.

### Grid Tile (signature)

The feed tile is where the product lives. An 8pt-cornered `#1E1E2B` square filled by a cover-fit image with a blurhash placeholder, at a 2pt gutter, in a FlashList masonry layout switchable between 2, 3 and 4 columns. Overlays are minimal and always dark-on-photo: an 18pt uploader initial badge top-left in that person's avatar colour, a `VID` chip top-right, a 38pt play button centred and a duration chip bottom-right on video, and — while an item is uploading — a 55%-deep `rgba(7,7,12,0.55)` scrim carrying a status chip (Queued / Uploading / Failed) and up to three 28pt circular retry / skip / remove chips.

**The one authored motion moment.** A tile arriving in the feed settles in: opacity 0→1 and scale 0.94→1 over 320ms on `Easing.out(Easing.cubic)`. It is keyed so a tile that never animates — recycled by the list, or served from cache — starts already visible rather than flashing in. Nothing else in the app has an entrance animation. Skeleton tiles pulse between 0.45 and 1 opacity on a 760ms `Easing.inOut(Easing.quad)` loop; that is a progress indicator, not decoration.

### Album Card

The home and My Events row: a 104pt square cover flush against the left edge of a 20pt-cornered card, a title with a key glyph when you are the host, a date-and-guest metadata line, and a wrapping row of pills carrying status, item count, and — only inside five days — the expiry countdown. When there is no cover, the square shows the album's initial in title type at `#5C5C6E`.

### Photo Viewer

Full-bleed black behind the image, with all chrome floating on translucent glass: `rgba(255,255,255,0.14)` fills with `rgba(255,255,255,0.18)` borders for the bottom actions, and `rgba(7,7,12,0.52)` for the top close button and metadata badges. This is the only place in the app where glass is used; everywhere else, surfaces are opaque.

### Avatars

Circular, initial-only, coloured by a stable hash of the display name over an eight-entry palette drawn from the Sunset Pop family (`lib/colors.ts`); every entry clears 4.5:1 against white text. Stacked avatars overlap by 32% of their size and each wears a 1.5pt ring in the page colour to cut itself out of its neighbour, with a `+N` chip in `#1E1E2B` closing the stack.

## Do's and Don'ts

### Do:

- **Do** spend the gradient once per screen, on the one control you want pressed, and give everything else the secondary treatment.
- **Do** drop the gradient entirely when a control is disabled — flat `#15151F` and `#A0A0B2` text, never a faded gradient.
- **Do** separate surfaces by moving up the tonal ladder (`#0B0B12` → `#15151F` → `#1E1E2B`) and drawing a 1px `#2A2A38` edge.
- **Do** use Feather, at one stroke weight, for every icon in the app. FontAwesome and Ionicons were removed on purpose and all 19 icon imports now point at Feather.
- **Do** put `maxWidth: CONTENT_MAX_WIDTH` + `alignSelf: "center"` on a real `View`, never on a `contentContainerStyle`.
- **Do** pull event status, tone and copy from `lib/eventStatus.ts` rather than deciding per screen what "Live" looks like.
- **Do** use soft pink `#FF7FB4` for small pink text and hot pink `#FF2D8E` for fills, tints and single glyphs.
- **Do** keep touch targets at 44pt or larger, and give small controls the shared `hitSlop` (10 on every side).
- **Do** let sheets close with an X and reserve the back chevron for steps inside a flow.

### Don't:

- **Don't** add a light theme, a system-appearance listener, or a theme toggle. There is one `theme` const and it is dark.
- **Don't** use the gradient as a background, a header wash, a card fill, or a divider. It fills controls.
- **Don't** put a second gradient-filled button on a screen that already has one.
- **Don't** introduce a second icon family, a second font family, or a second stroke weight.
- **Don't** add entrance or transition animations. The feed tile's 320ms settle is the only authored moment; everything else is instant on purpose, because the app is used one-handed on a phone that is already busy uploading.
- **Don't** reach for a shadow to separate two surfaces — change the fill and draw the edge.
- **Don't** nest a larger corner radius inside a smaller one.
- **Don't** use `expo-linear-gradient`. The `Gradient` primitive is built on `react-native-svg` specifically so the design system requires no native rebuild.
- **Don't** use `#6B6B7E` or `#5C5C6E` for anything a user has to read. They are for chevrons, inactive labels and dividers.
- **Don't** reintroduce the decorative eyebrow. The `eyebrow` prop was deliberately removed from `SectionHeader` so a kicker cannot be added above a title by accident.

### The eyebrow exception, stated honestly

`Eyebrow` survives as a **grouped-section label** — the small uppercase word that names a stack of cards: Settings' Plan / Privacy / Access / About, the share screen's "Joined so far", the guest sheet's "Guest list", the edit screen's "Danger zone", the event screen's "The feed". That use is sanctioned.

Four decorative kickers also remain, sitting above a title as pure ornament, and they stay by an explicit user-backed decision rather than because they pass review:

- `app/join/[code].tsx:153` — "You're invited to"
- `app/event/join.tsx:188` — "You're invited to"
- `app/event/[id].tsx:681` — "Event album"
- `app/event/share/[id].tsx:84` — "Scan to join"

The craft floor bans the decorative kicker outright. These four are a known, deliberate exception to it — not a precedent. Do not add a fifth, and do not cite these when adding a kicker to a new screen.
