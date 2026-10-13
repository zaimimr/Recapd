# Share kit + direct app links

Date: 2026-09-30
Status: Approved design, awaiting spec review

## Goal

Hosts can put their event's QR code on tables, posters, invitations and Facebook events, and guests who scan it land in the right place. Guests with the app go straight to the join screen. Guests without it get a clear path to install and join.

Design changes (colours, fonts, logo, copy, layout) must be possible without an app release.

## Context

- The share screen (`app/event/share/[id].tsx`) shows a QR code and a text share sheet. There is no printable or image output.
- The QR code encodes `recapd://join/CODE`. A camera app on a phone without Recapd cannot do anything with it, so printed codes dead-end for most guests.
- `recapd.app/join/CODE` is a Vercel function (`web/api/join.ts`) that tries the `recapd://` scheme and shows store buttons after 2.5 s.
- No universal links or App Links are configured. After installing, the join code is lost and the guest must scan again or type it.

## Out of scope

- Web join (upload and download from the browser). This is the next spec and replaces the store buttons on the bounce page.
- Template style picker, custom text, custom photo backgrounds.
- Clipboard-based deferred deep linking.

## 1. Templates and rendering (web)

### Theme

`web/kit/theme.ts` is the single source for the kit's look: brand colours (coral `#FF5E62`, pink `#FF2D8E`, violet `#8B2FE0`, dark `#0B0B12`, cream `#FFF9F6`), the brand gradient, logo SVG, font files and copy strings. Templates read nothing else. A redesign is an edit to this file plus a web deploy.

### Templates

One JSX component per format in `web/kit/templates/`, each taking `{ title, dateLabel, code, joinUrl, qrSvg }`.

| Format | Size | Notes |
| --- | --- | --- |
| `social` | 1920x1005 PNG | Facebook event cover, also usable as a feed post |
| `story` | 1080x1920 PNG | Code and link large, QR secondary |
| `table` | A6 card, 4 per A4 sheet with cut lines | Print |
| `poster` | A4 portrait, one large QR | Print |

Templates use only flexbox and inline styles so the same component renders in Satori and as HTML.

### Endpoints

- `GET /api/kit/image?code=X&format=social|story` returns a PNG rendered with `@vercel/og`. `Cache-Control: public, max-age=3600`.
- `GET /kit/X/print?format=table|poster` returns HTML from the same components via `renderToString`, with `@page` print CSS and a "Print / Save PDF" button.
- QR codes are generated server-side as SVG with the `qrcode` package, error correction M, encoding `https://recapd.app/join/CODE`.
- Event data comes from the existing `get_event_preview` RPC, as in `join.ts`. Unknown code returns 404.
- `web/vercel.json` rewrites are updated so `/kit/*` reaches the print function.

### Link previews

`join.ts` sets `og:image` and `twitter:image` to `/api/kit/image?code=X&format=social` and `twitter:card` to `summary_large_image`.

### Privacy

Nothing new is exposed. `get_event_preview` already returns title and dates to anyone holding the code.

## 2. App UI (`app/event/share/[id].tsx`)

- The on-screen QR value changes to `https://recapd.app/join/CODE`. The scanner in `app/event/join.tsx` already accepts both forms.
- A new "Invite kit" section below "Share the link" shows 4 tiles with preview thumbnails loaded from the image endpoint.
  - Facebook / post and Story: download the PNG to the cache directory as `recapd-<code>-<format>.png` (overwritten each time), then open the share sheet with `expo-sharing`.
  - Table cards and Poster: open the print URL with `expo-web-browser`. A secondary "Copy link" action copies the print URL for printing from a laptop.
- While downloading, the tile shows a spinner. On failure, alert "Couldn't load the invite card. Check your connection."
- Every participant sees the kit. The participant cap is enforced server-side.
- No new native modules. `expo-sharing`, `expo-file-system`, `expo-web-browser` are already installed.

## 3. Direct app opening and bounce page

### Universal links and App Links

- `app.json`:
  - iOS `associatedDomains: ["applinks:recapd.app"]`
  - Android `intentFilters` with `autoVerify: true`, scheme `https`, host `recapd.app`, `pathPrefix: /join`
- `web/public/.well-known/apple-app-site-association` with appID `9L246T935B.com.zaimimran.recapd`, paths `/join/*` only.
- `web/public/.well-known/assetlinks.json` for `com.zaimimran.recapd` with SHA-256 fingerprints of both the Play App Signing key and the upload key.
- `web/vercel.json`: exclude `.well-known` from the SPA catch-all rewrite, and add a header rule serving the AASA file as `application/json`.
- expo-router maps `https://recapd.app/join/CODE` to `app/join/[code].tsx`. Verify the https entry behaves the same as the scheme entry.
- If verification fails, the bounce page still works, so nothing regresses.

### Bounce page (`web/api/join.ts`)

- The join code is the main element, in large monospace, with a "Copy code" button.
- Copy: "Get Recapd, then tap Join with code and enter ABC123."
- The scheme redirect attempt and store buttons stay.

### Resulting flow

- App installed: scan, app opens on the join screen, enter name, joined.
- App not installed: scan, bounce page, install, open app, Join with code, type the code shown on the page.

## 4. Rollout

1. Web deploy: templates, endpoints, print page, bounce page, `.well-known` files. Safe on its own; the current app keeps working and link previews improve immediately.
2. App release through the `release.json` pipeline: QR switch, kit tiles and link config in one native build, staged in both stores.

## 5. Verification

- Render all 4 formats with `vercel dev`, screenshot with Playwright, decode each QR from the PNG with `zbarimg` and confirm it equals `https://recapd.app/join/CODE`. Cover a 60-character title, an emoji title and an unknown code (404).
- Chrome print-to-PDF on A4: 4 table cards per sheet with cut lines, poster on one page.
- `curl -I` on both `.well-known` files: 200, `application/json`, no redirect. Check Apple's CDN copy at `app-site-association.cdn-apple.com/a/v1/recapd.app` and Google's Digital Asset Links API.
- `adb shell pm get-app-links com.zaimimran.recapd` shows `verified`.
- Jest: share screen QR value is the https URL; tile press calls download and share.
- Simulator: each tile opens the share sheet or browser; `xcrun simctl openurl booted https://recapd.app/join/X` lands on the join screen.
- Final gate: print a table card and scan it with the camera on iPhone and Android, with and without the app installed.

## Next

Web join spec: the bounce page becomes a browser-based join, upload and download flow for guests without the app.
