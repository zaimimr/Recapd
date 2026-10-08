# Recapd pricing strategy

Checked 2026-10-08. Data from prod Supabase, RevenueCat, `types/subscription.ts`.

## Where you are

- Pro: $2.99/mo or $29.99/yr. Free: 12 guests, 30s videos, 500 MB files. Every album is deleted 14 days after the event, on both plans.
- 206 accounts, 47 active users and 44 new customers in the last 28 days, 2 active subscriptions, $5 MRR.
- Live events: avg 1.7 participants, p90 2.8, **0 events with 10+ guests**.

**Your current pricing is wrong**, for three reasons:
1. **A subscription doesn't match the need.** People host 1-3 events a year, so a monthly plan feels like a trap and gets cancelled right after the event.
2. **$2.99 is below every competitor**, including POV's cheapest $4.99 tier. That signals "toy" and leaves money on the table for weddings, where people happily pay $49-119.
3. **The paywall never fires.** The only real gate is 12 guests, and no event has reached 10. Free users never hit a reason to pay.

**Who pays: the host, never the guest.** Guests are your growth loop (web join, no install), so charging them kills it. Price for the person organising a milestone event: weddings, big birthdays, trips, graduations, company events.

## 1. Pricing models

| Model | Fit | Pros | Cons |
|---|---|---|---|
| Flat subscription | 2 | Recurring revenue | The need comes in bursts, so people cancel after one month |
| Usage-based (storage/GB) | 1 | Tracks cost | Hosts can't predict the bill, and it scares them before the event |
| Per-seat (guests) | 3 | Guest count tracks event size and value | Punishes inviting more people, which is your growth loop |
| Freemium | 4 | Every free event shows the app to 10+ new people | Needs a limit that actually triggers |
| Credits | 2 | Flexible | Too abstract for a party host |
| One-time per event | **5** | Matches how people buy, matches competitors, no cancellations | Revenue is lumpy |

**Recommendation: freemium plus a one-time Event Pass, with a yearly plan for repeat hosts.** Hosts think "I'm paying for my wedding album", not "I'm subscribing to an app". Every competitor that charges real money charges per event.

## 2. Tiers

**Free** ($0)
- Up to 12 guests
- Album kept 14 days after the event
- Photos at full resolution, videos up to 30s
- 500 MB per file
- Download your own uploads
- **Upgrade trigger:** the "album deletes in 2 days" notice, or guest #11.

**Event Pass** ($14.99 once, per event) - the target tier
- Unlimited guests
- **Album kept 2 months** after the event, the hard maximum on every plan
- Videos up to 5 min, 5 GB files
- Download the whole album as a ZIP
- "Album closes in 7 days" reminder to every guest
- Upgrade at any time, including after the event while the album still exists
- **Upgrade trigger:** a 4th event in the same year, which makes Host Pro cheaper.

**Host Pro** ($19.99/mo or $59.99/yr, 75% annual discount)
- Everything in Event Pass, for unlimited events
- Each album kept 2 months, also after cancelling
- Self-serve, no sales team
- For: event planners, photographers, families with several events a year
- **Upgrade trigger:** a 4th paid event in 12 months ($59.96 in passes vs $59.99/yr).

Remove the guest cap for Pass and Host Pro in `subscription_plans.capabilities` (it is already null for `pro`). Add a `retention_days` capability (free 14, paid 60) so the expiry depends on the plan.

**Positioning:** "Recapd collects your event, you download it, then it's deleted." Two months is a privacy promise, not a weakness, because the app is a collector, not cloud storage.

## 3. Competitors

All prices come from third-party listings, several written by rival apps. Confirm at checkout.

| App | Price | Includes | Recapd sits |
|---|---|---|---|
| [POV](https://pov.camera/pricing) | Free ≤10 guests, $4.99 (25) to $89.99 (250), per event | Disposable-camera style, guest-count tiers | **Between.** A flat $14.99 beats POV for 50+ guests, which is the wedding range |
| [Kululu](https://kululu.me/pricing) | Free (100 uploads, 7 days), $39 Plus, $99 Pro | Pro = no upload cap, 1-year storage | **Well below.** Kululu sells a year of storage, you sell collecting and downloading |
| [GuestPix](https://knipsmig.com/alternatives/guestpix) | $39 party, $49-119 wedding | QR upload, 12-24 month hosting | **Below.** Your app grid and full-res viewer are better than a web upload page |
| [WedShoots / The Guest](https://knipsmig.com/best/event-photo-apps) | From $29 / $49 per event | Wedding-focused apps | **Below** |
| [Wedibox](https://www.wedibox.com/compare/guestpix) | $79 once | Photos plus RSVP, seating, website | **Below.** You do one thing well |

At $14.99 you sit below the apps that store albums for a year, which is fair because you keep them 2 months. You cost more than POV only for small parties, and Free covers those.

## 4. Unit economics

All costs are **estimates** (Supabase list prices, not checked against your invoice):
- Storage $0.021/GB-month, egress $0.09/GB, store fee 15% (small-business program).
- Fixed costs about $35/mo: Supabase Pro $25 plus Apple $99/yr ($8.25). Sentry and RevenueCat are free at this size.

| | Revenue (net of store fee) | Cost | Gross margin |
|---|---|---|---|
| Free event (12 guests × 15 photos × 3 MB ≈ 0.5 GB, 14 days, 2 GB egress) | $0 | 0.5×0.021×0.5 + 2×0.09 ≈ **$0.19** | n/a |
| Event Pass (100 guests ≈ 5 GB, 2 months, 15 GB egress) | $12.74 | 5×0.021×2 + 15×0.09 = **$1.56** | **88%** |
| Host Pro yearly (4 events × 5 GB, each kept 2 months ≈ 3.3 GB on average) | $50.99 | 3.3×0.021×12 + 40×0.09 = **$4.43** | **91%** |

- **Break-even on fixed costs:** $35 ÷ $11.18 net per Pass ≈ **4 Event Passes/month**, or $35 ÷ ($50.99 − $4.43)/12 ≈ **9 yearly subscribers**.
- **Free users** cost about $0.19 per event, so 100 free events a month is $19. Freemium is affordable.
- **Target blended ARPU (paying hosts):** $18/year (mostly one-off Passes, ~1 in 5 payers on Host Pro).

## 5. Pricing psychology

- **Anchor on competitors, not your own tiers.** Show "Most apps charge $39-99 per event" next to $14.99, because hosts compare against what they've seen at weddings, not against $0.
- **Decoy: Host Pro monthly at $19.99.** It costs more than one Pass, so one-off hosts pick the Pass, and repeat hosts see $59.99/yr as the obvious deal. It has to be above $14.99, because albums survive cancelling and a cheaper monthly would replace the Pass.
- **Frame the yearly plan in events:** "$59.99/yr: every event this year. 4 events pays for itself", not "save 75%", because hosts count events, not months.

## 6. Launch vs. scale pricing

- **Live now (set 2026-10-08, effective 2026-10-09 on iOS): Host Pro $19.99/mo or $59.99/yr, with a launch offer of $39.99 for the first year** (iOS pay-up-front intro offer, Play offer `launch`, Test Store intro price, new subscribers only). The paywall shows $59.99 crossed out next to $39.99. The Event Pass is not built yet.
- **Grandfathering:** the 2 current $2.99/$29.99 subscribers keep that price for as long as they stay subscribed. Anyone who buys a $9.99 Pass keeps that album for the full 2 months.
- **Raise to $14.99** when either is true:
  - 30 Passes are sold at $9.99, or
  - more than 4% of events with 5+ guests buy a Pass at the expiry prompt.
- **Raise to $19.99** when more than 30% of Passes go to events with 50+ guests (proof that weddings are buying).
- **How to raise:** new price for new purchases only, and announce it in the app 14 days ahead ("Price goes up on X, lock in $9.99 now"). The deadline drives a spike in sales.

## Do next

1. Make retention depend on the plan (`retention_days`: free 14, paid 60) and show a "Keep this album for 2 months" paywall at the 3-days-left notice and at guest #11.
2. Turn the inactive `recapd_event_pro` consumable back on at $9.99 and create the new yearly plan at $39.99. Archive the $2.99 monthly plan for new buyers.
3. Keep the 12-guest free cap, because the expiry is now the real trigger.
