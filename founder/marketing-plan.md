# Recapd go-to-market plan

Written 2026-10-08. Builds on `founder/pricing-strategy.md`.

## The honest starting point

- 206 accounts, 47 active in 28 days, 2 paying subscribers.
- Average event has **1.7 participants**. No event has reached 10 guests.
- Pro is $19.99/mo or $59.99/yr ($39.99 first-year launch offer). Event Pass is not built.

**What that means for marketing:**
1. **The guest loop is the real channel, and it isn't working yet.** Every event should show Recapd to 10-50 new people for free. At 1.7 per event, hosts aren't inviting, or guests aren't joining. Web join just shipped, which should help. Measure it before buying traffic.
2. **Paid installs don't pay back yet.** Meta iOS installs run about $3-6 in the US, TikTok $0.70-4.50. With 2-5% of hosts paying, one paying customer costs $60-300 against $40-60 of revenue. Ads only work once each host brings in more hosts through their guests.
3. **People buy per event, not per month.** Ads that say "$19.99/month" to someone planning one wedding will convert badly. Event Pass ($14.99) is the offer ads should sell. Build it before scaling paid.

**So the order is: content (free) first, fix the loop, then turn on paid in small steps.**

## Who we sell to

The host, never the guest. Guests are distribution.

| Segment | Why | When |
|---|---|---|
| Couples planning a wedding | Highest willingness to pay ($29-119 at competitors), searches actively | Peak Apr-Sep, plan 6-12 months ahead |
| Company party organisers (julebord) | One organiser, 30-200 guests, company card | **Nov-Dec, starts now** |
| Big birthdays (30/40/50), bachelor/bachelorette, trips | Frequent, friend groups, great TikTok content | All year |
| Russ (Norway) | Huge photo culture, tight groups, weeks of events | Apr-May 17 |
| New Year's Eve | Every friend group, one night | Dec 31 |

**Market: global English content, with local holidays as separate hooks.** Weddings and birthdays run all year as the base. Holidays are the spikes, see the [holiday calendar](#holiday-calendar-oct-2026-to-dec-2027). Norway (julebord, russ, 17. mai) gets Norwegian posts on top.

## The 5 levels

### 1. Content (attract, free)

**Accounts:** TikTok, Instagram (Reels + carousels), same handle `@recapdapp`. Skip a Facebook page beyond what Meta ads require. YouTube Shorts gets the same videos for free.

**Volume:** 1 post per day for 8 weeks. Most will flop, the algorithm tests each one on a small audience and one hit is worth 100 average posts. POV's best single wedding video did about 9.8M views.

**Formats that work for this category:**
- **"This is your sign" hooks.** POV's top video was "this is your sign to give your wedding guests disposable cameras". Text on screen, trending sound, 7-12 seconds.
- **The group chat problem.** "Me asking for the photos 3 weeks after the party" + screen recording of a dead group chat. Then the Recapd album filling up.
- **Before/after reveal.** "Photographer: 400 photos. Guests: 2,300 photos I would never have seen." Scroll through a real album grid.
- **Slideshow carousels** (TikTok photo mode + IG carousels). Faceless, cheap, high save rate. "5 things nobody tells you about wedding photos", "Julebord checklist".
- **POV / skit.** "POV: you're the only one who remembered to share the photos."
- **Real events.** Film setup at your own and friends' events: QR sign on the table, people scanning, album the next morning. Real beats polished.
- **Norwegian julebord series** (Nov-Dec): "Julebord-bildene du aldri får se", "Hvem tar bildene på julebordet?".

**10 hooks ready to film:**
1. This is your sign to stop begging for the party photos in the group chat
2. My guests took 1,800 photos at our wedding. Here's how I got every single one
3. The wedding photographer misses 80% of the night. Your guests don't
4. POV: the morning after and the whole album is already there
5. Stop using shared Google Photos albums for events, here's why
6. Put this QR code on every table at your wedding
7. How to get every photo from a bachelorette trip without nagging anyone
8. The julebord photos everyone wants and nobody shares
9. Things I'd do differently at my 30th: 1. collect the photos properly
10. Your guests don't need to download anything. They scan, they upload, done

**Production:** batch-film 7 videos in one evening a week. CapCut templates in Sunset Pop colors. Reuse the app screenshots and the brag video.

**Other free content:**
- **App Store search (ASO):** already rewritten. Add "julebord", "russ", "bryllup bilder" to the Norwegian keyword set.
- **SEO pages on recapd.app:** `/wedding`, `/julebord`, `/birthday`, `/russ`. One page each, real screenshots, "make your album" button. Long-tail search is how wedding couples find tools.
- **Reddit / Facebook groups:** answer "how do I collect photos from guests" posts in r/weddingplanning and Norwegian wedding groups. Helpful answers, not ads.

### 2. Capture (turn attention into a host)

- **One action everywhere:** "Create your album, free". Link in bio goes to recapd.app with smart redirect to the right store.
- **Free printable QR sign** is the lead magnet. The share kit already makes table and poster formats. Promote it: "Free wedding QR sign template".
- **Pixels on recapd.app before any ad spend:** Meta Pixel + Conversions API, TikTok Pixel + Events API. Track `view_landing`, `store_click`, `web_join`, `web_upload`. Without these there is nothing to retarget.
- **In app:** RevenueCat + Meta/TikTok SDK events for `event_created`, `invite_shared`, `paywall_viewed`, `purchase`. Optimise ads for `event_created`, not installs.
- **Email for hosts** at sign-up (Supabase already has it). Ask for event date during event creation. That date drives everything in level 3.
- **Apple Search Ads:** brand keyword "recapd" (cheap, protects the name) + long-tail "wedding photo sharing", "event photo app", "guest photos qr". Start $5/day.

### 3. Follow-up (turn a sign-up into an event with guests)

The biggest gap. Most accounts never get a real event going.

**Host sequence (email + push), timed from the event date:**

| When | Message |
|---|---|
| Sign-up, no event after 1 day | "Your album takes 30 seconds to set up" |
| Event created, 0 invites after 1 day | "Share this QR code" + print link |
| 7 days before | "Print your table sign" |
| Day of event | "Remind guests to scan" |
| Day after | Auto upload reminder to guests (exists) |
| 3 days after | "Your album has X photos. Download everything" |
| 2 days before deletion | Upgrade to keep it longer (Event Pass) |

**Guest to host conversion** (where growth compounds):
- After a guest views or downloads an album: "Hosting something? Make your own album, free."
- Web join end screen: same message + store badges.
- Track `guest -> creates own event` as the north-star growth metric.

**Tool:** Loops or Resend (both have free tiers) triggered from Supabase. Push via the existing notification setup.

### 4. Retarget (bring back people who almost converted)

Only turn on once audiences have 1,000+ people. Meta's floor is about 100, but delivery is shaky below 1,000.

| Audience | Message | Channel |
|---|---|---|
| recapd.app visitors who didn't click a store button | Real album reveal video | Meta + TikTok |
| **Web-join guests** (warmest pool, they've used it) | "Your turn. Make an album for your next party" | Meta + TikTok |
| Installed, no event created | "30 seconds to set up" walkthrough | Meta app re-engagement |
| Video viewers 50%+ of your organic posts | Best organic posts as Spark Ads | TikTok |
| Hosts whose album expires soon | Event Pass offer | Push/email (free, not ads) |

**Lookalikes:** seed with hosts who created an event with 5+ guests. Small, high-quality seed beats a big mixed list.

**Budget:** $5-10/day total. Retargeting is the cheapest paid traffic you will ever buy.

### 5. Speed (who moves fastest wins)

- **Speed to content:** jump on trending sounds within 24-48h. Keep a folder of 20 pre-filmed app clips so a trend video takes 15 minutes.
- **Speed to reply:** reply to every comment and DM within an hour in the first 8 weeks. Comments boost reach, and someone asking "does this work for weddings?" is a lead.
- **Speed to host:** a new host should have their first guest upload within 24h. Measure it, fix whatever slows it.
- **Speed to kill:** test 3-5 creatives per ad group, kill anything at 2x target cost after ~$20 spend, double down on winners. Turn your best organic posts into ads instead of making ads from scratch.
- **Speed to season:** hosts plan 1-2 months ahead, so content does too. See the calendar below.

## Holiday calendar (Oct 2026 to Dec 2027)

**Rule: the main push is 1 month before each date.** That is when hosts decide and set things up. Every holiday gets 4 waves:

| Wave | When | Post |
|---|---|---|
| Tease | 6-5 weeks before | 1-2 light posts: "Hosting X this year?" |
| **Main push** | **4-1 weeks before** | Most posts + all ads: checklists, QR sign templates, setup walkthroughs |
| Last call | Final week | "It's not too late, set up in 30 seconds" |
| Recap | 1-3 days after | Real album reveals from that holiday |

Ads run only in the main push and last call: on 4 weeks out, off the day of the event. Weddings and birthdays run always-on underneath.

Dates marked ~ follow lunar calendars, check them a month before.

| Holiday | Date | Main push from | Region | Angle |
|---|---|---|---|---|
| **Halloween 2026** | Oct 31 | **Now** | US, UK, global | Costume party photos, "everyone's costume in one album" |
| Diwali 2026 | ~Nov 8 | **Now** | India, diaspora | Family gatherings, lights, outfits |
| **Thanksgiving / Friendsgiving** | Nov 26 | Oct 29 | US | Family table, the photo everyone forgets to send |
| Julebord | Nov-Dec | Oct 15 | Norway | Company party, organiser sets it up once |
| Hanukkah | ~Dec 4-12 | Nov 6 | Global | 8 nights, one album |
| **Christmas 2026** | Dec 25 | Nov 27 | Global | Family Christmas, "grandma wants every photo" |
| **New Year's Eve** | Dec 31 | Dec 3 | Global | Midnight from every phone in one album |
| Engagement season | Dec-Feb | Dec 26 | Global | "Just got engaged? Sort the guest photos first" (wedding funnel) |
| Lunar New Year 2027 | ~Feb 6 | Jan 9 | Asia, diaspora | Family reunion dinner |
| Carnival | ~Feb 6-10 | Jan 9 | Brazil, Europe | Group costumes, parade |
| Galentine's / Valentine's | Feb 13-14 | Jan 17 | Global | Friend groups, couples parties |
| Eid al-Fitr | ~Mar 9-10 | Feb 9 | Global | Family visits, outfits |
| St. Patrick's Day | Mar 17 | Feb 17 | US, Ireland, UK | Pub crawls, group trips |
| Holi | ~Mar 22 | Feb 22 | India, diaspora | Color party, the messiest photos ever |
| **Easter 2027** | Mar 28 | Feb 28 | Global | Family brunch, egg hunt with kids |
| Russ | Apr 20 - May 17 | Mar 22 | Norway | Weeks of parties, one album per russ group |
| Passover | ~Apr 21-29 | Mar 24 | Global | Seder with the whole family |
| Orthodox Easter | May 2 | Apr 4 | Greece, E. Europe | Family feast |
| Mother's Day (US) | May 9 | Apr 11 | US, UK (Mar 7) | Family brunch album as a gift |
| Eid al-Adha | ~May 16-17 | Apr 18 | Global | Family gatherings |
| 17. mai | May 17 | Apr 19 | Norway | Bunad, parade, family |
| Graduation season | May-Jun | Apr 15 | US, Europe | Grad parties, prom |
| **Wedding season peak** | Jun-Sep | May 1 | Global | QR on tables, guest photos vs photographer |
| Bachelor/bachelorette season | Apr-Aug | Mar 15 | Global | Trips, "what happens on the trip stays in the album" |
| Pride | June | May 1 | Global | Parade groups |
| Father's Day | Jun 20 | May 23 | US, UK | BBQ album |
| Midsummer / Sankthans | Jun 23-25 | May 26 | Nordics | Bonfire, cabin trips |
| 4th of July | Jul 4 | Jun 6 | US | BBQ, fireworks from every angle |
| Summer trips & festivals | Jul-Aug | Jun 1 | Global | Group trips, festivals |
| Mid-Autumn Festival | ~Sep 15 | Aug 18 | Asia | Family, lanterns |
| Oktoberfest | ~Sep 18 - Oct 3 | Aug 21 | Germany, global | Group tables |
| Canada Thanksgiving | Oct 11 | Sep 13 | Canada | Family dinner |
| Diwali 2027 | ~Oct 29 | Oct 1 | India, diaspora | Same as 2026 |
| **Halloween 2027** | Oct 31 | Oct 3 | Global | Start on time this year |
| Día de Muertos | Nov 1-2 | Oct 4 | Mexico, LatAm | Family remembrance, altars |
| **Thanksgiving 2027** | Nov 25 | Oct 28 | US | Friendsgiving + family |
| Julebord 2027 | Nov-Dec | Oct 15 | Norway | Pitch to organisers in September |
| **Christmas 2027** | Dec 25 | Nov 27 | Global | Family Christmas |
| Hanukkah 2027 | ~Dec 24 - Jan 1 | Nov 26 | Global | 8 nights, one album |
| **New Year's Eve 2027** | Dec 31 | Dec 3 | Global | Midnight album |

**Bold = biggest pushes.** Spend most of the ad money on these and on wedding season.

**Birthdays (always on):** 1-2 posts a week all year. Milestone hooks: 18th, 21st, 30th, 40th, 50th, kids' parties. "Hosting a birthday this month?" posts at the start of each month.

**Weddings (always on):** 2 posts a week all year, 4 a week from Apr to Sep. Engagement season (Dec-Feb) is when couples start planning, so wedding content starts there, not in summer.

**Posting load:** about 1 post per day overall. At any time, 1-3 holidays are in their main push plus birthdays and weddings, so each week is roughly 2-3 holiday posts, 2 wedding, 1-2 birthday.

## Paid ads: when and how much

| Phase | When | Spend | Goal |
|---|---|---|---|
| 0. Instrument | Oct 8-20 | $0 | Pixels, CAPI, app events, email sequence live |
| 1. Organic + julebord | Oct 20 - Dec 31 | $5/day Apple Search Ads | 60 posts, find 3 hooks that beat 10K views |
| 2. Retarget | When audiences > 1,000 | $5-10/day | Cost per `event_created` |
| 3. Prospecting test | Event Pass live + 4+ guests per event | $20-30/day, 2 weeks | Cost per host with 5+ guests |
| 4. Wedding season scale | Jan-Apr (couples plan ahead) | Scale winners only | Paying hosts |

**Meta (Facebook + Instagram):** Advantage+ app campaign, broad targeting, let creative do the targeting. Optimise for `event_created`. Norway + US as separate campaigns.

**TikTok:** Spark Ads (boost your own organic winners). Vendor data shows lower cost per install than normal in-feed ads. 9-15s, hook in first 1.5s.

**Skip for now:** Google App Campaigns, Snapchat, influencer deals over $200. Micro-creators (5-50K followers, wedding/party niche) paid in free Pro + small fee are fine to try in phase 3.

## Partnerships (slower, compounding)

- **Wedding planners, venues, photographers in Norway:** free Host Pro for planners, Recapd QR sign on their tables. A photographer who says "your guests' photos go here" is a recurring channel.
- **Julebord venues and event agencies:** same offer, Norwegian one-pager.
- **Wedding stationery shops (Etsy, local):** QR code on the invitation suite.

## Metrics to watch weekly

| Metric | Now | 8-week target |
|---|---|---|
| Avg guests per event | 1.7 | 5 |
| Events with 10+ guests | 0 | 20 |
| New hosts per week | ~10 | 50 |
| Guest -> creates own event | unknown | 5% |
| Paying hosts | 2 | 25 |
| Best post views | - | 100K |

## Next 2 weeks

1. Create TikTok + Instagram `@recapdapp`, same bio and link.
2. Add Meta + TikTok pixels and server events to recapd.app, app events to the app.
3. Add event date prompt + host email sequence (Loops/Resend).
4. Add "make your own album" prompt for guests after viewing/downloading.
5. Film first 14 videos (hooks above), post 1 per day.
6. Post Halloween (last call), Thanksgiving/Friendsgiving, Diwali and julebord content this week. Christmas teasers from Oct 23, main push from Nov 27.
7. Build one landing page per big occasion on recapd.app: `/halloween`, `/thanksgiving`, `/christmas`, `/new-years-eve`, `/wedding`, `/birthday`, `/julebord`.
7. Apple Search Ads: brand + 10 long-tail keywords, $5/day.
8. Decide on Event Pass, since paid prospecting waits for it.

## Sources

- [POV wedding TikTok hook, 9.8M views](https://www.hooked.so/hooks/photo-video/this-is-your-sign-to-give-your-wedding-guests-disposable-cam-tryp)
- [POV growth breakdown: no-download guests, QR invite cards](https://screensdesign.com/showcase/pov-disposable-camera-events)
- [Playkit: event app viral post case study](https://playkit.beehiiv.com/p/dispo)
- [Playkit: faceless slideshow growth](https://playkit.substack.com/p/couple-joy-faceless-slideshow-growth)
- [Cost per install by channel 2026](https://findclout.com/blog/cost-per-install-by-channel-2026)
- [Meta CPI tracker](https://www.superads.ai/facebook-ads-costs/cost-per-app-install)
- [TikTok ads costs 2026](https://admetrics.io/en/post/tiktok-ads-costs-complete-2026-pricing-guide)
- [TikTok ads minimum budget](https://stackmatix.com/blog/tiktok-ads-minimum-budget-guide)
- [Meta custom audiences](https://www.stackmatix.com/blog/meta-custom-audiences)
- [Meta lookalike seed minimum (Meta docs)](https://developers.facebook.com/documentation/ads-commerce/marketing-api/audiences/guides/lookalike-audiences)
- [Apple Search Ads cost benchmarks 2026](https://splitmetrics.com/blog/apple-search-ads-cost)
- [Guest QR photo flows for weddings](https://guestcam.co/use-cases/weddings)
