# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

Expo / React Native, shipping one design language to both iOS (App Store 6758083751) and Android (`com.zaimimran.recapd`). The app does not fork its visual language per OS; it honors each platform's affordances (safe areas, back gesture, tab bar, system sheets) inside a single branded system.

## Users

**The host.** Creates the album for a wedding, birthday, festival, or trip. Often mid-event, one-handed, in low light, slightly drunk, and not willing to do admin. Their job: get everyone's photos into one place without chasing people.

**The guest.** Invited by a QR code or a six-character code, usually at the event itself. Most guests never installed the app before tonight and will not create an account. Their job: dump their camera roll into the album and later pull everyone else's photos out.

Guests outnumber hosts heavily, and a guest's entire relationship with the product can be ten minutes long. Friction at join time is the product's single biggest risk.

## Product Purpose

Recapd collects every guest's photos and videos from one event into a single shared album, so nobody leaves with only their own angle of the night. Success is an album that ends the event with more photos than any one person took, and a guest who saves the whole thing to their camera roll before it expires.

## Positioning

Sharing happens through a disposable, invite-only event album rather than an account, a profile, or a permanent library. Guests join with a name and nothing else: no email, no password, no social graph. Files arrive at original quality instead of being recompressed the way a group chat does it, and the album deletes itself after the event instead of accumulating.

There is no feed, no followers, no discovery, and no algorithm. That absence is the product, not a missing roadmap item.

## Operating Context

- Used at the event, on a phone, in the dark, frequently on congested or absent wifi.
- Uploads are large and bursty: a guest dumps 200+ items at once, then locks the phone. Uploading continues in the background through a native module and does not resume automatically after a terminal failure; the user taps Retry.
- Joining happens by scanning a QR code shown on the host's screen, or typing a six-character code.
- Albums are time-boxed. They expire roughly two weeks after the event ends; the host can delay deletion once, and participants are reminded to download before the album closes.

## Capabilities and Constraints

- Anonymous Supabase auth (`signInAnonymously`), display name only. No email, password, or profile.
- Event rooms with QR + six-character code join; per-event participant roster.
- Photo and video upload through a custom native uploader (Swift `URLSession` background / Kotlin WorkManager), TUS-based, surviving app suspension.
- Feed is a masonry grid at 2 / 3 / 4 column density; full-resolution viewer; video playback.
- Download-all to the device camera roll, skipping already-downloaded items.
- Realtime: new media and new participants appear without a refresh.
- Free plan: 12 participants, 30-second videos, 500 MB per file. Pro: unlimited participants, 5-minute videos, 5 GB per file, one-time deletion delay. Billing through RevenueCat; entitlement `Recapd Pro`.
- Grid memory is a live constraint. Full-resolution images decoded on the main thread have caused watchdog terminations; thumbnails and virtualization are load-bearing, not optimizations.
- Localization: English and Norwegian bokmål are the only permitted languages.

## Brand Commitments

- Name **Recapd**. Fan-of-cards logo mark, `assets/recapd-logo.svg`.
- **Sunset Pop** palette, already committed in `constants/theme.ts`: coral `#FF5E62` → hot pink `#FF2D8E` → violet `#8B2FE0` on near-black `#0B0B12`.
- **The approved App Store / Play Store screenshots are binding visual authority** (2026-09-11, `~/Desktop/Recapd-store-screenshots-2026-09-11/`). The user approved them verbatim: *"I like them very much"*, and asked that the app be redesigned so every screen follows their design language. Where this conflicts with generic platform or category defaults, the screenshots win.
- Dark appearance only. Confirmed by the user this session, replacing the previous automatic light/dark behavior.
- Voice: plain, short, a little blunt. "They scan. They're in." Never markety, never cute.

## Evidence on Hand

- Shipped app, live on both stores; App Store version 1.12.0 sits in `PREPARE_FOR_SUBMISSION`.
- Store screenshots and the generator that produced them (generator is currently session-scoped and uncommitted).
- Real Supabase schema, RevenueCat products, and Sentry history of production failures.
- No testimonials, user counts, press, or ratings exist. Do not fabricate any.

## Product Principles

1. **Guest friction is the enemy.** Anything that stands between scanning a code and adding photos is a bug, including a beautiful screen that asks for something.
2. **The photos are the product.** Chrome recedes; imagery gets the space, the contrast, and the resolution.
3. **Never silently lose someone's night.** Failures are visible and recoverable by hand; expiry is announced well before it happens.
4. **Private by construction.** No public surface, no discovery, nothing sold or trained on. The app should feel like a closed room.
5. **Built for one hand in the dark.** Large targets, high contrast, no precision gestures, nothing that needs good light or full attention.

## Accessibility & Inclusion

- Touch targets at least 44×44 pt; the app is used one-handed and impaired.
- Body and placeholder text must clear 4.5:1 on the dark ground; large text 3:1.
- Existing screens already carry `accessibilityRole` / `accessibilityLabel` / `accessibilityHint` on interactive elements; the redesign must preserve them.
- Text must survive the user's system text-size setting without clipping.
