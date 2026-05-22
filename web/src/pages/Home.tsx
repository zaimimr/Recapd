import "../styles/Home.css";

const features = [
	{
		title: "No more scrolling through 3,000 photos",
		copy: "Set the event start and end time. Recapd only pulls photos and videos from that window, so guests skip the endless camera roll dig.",
	},
	{
		title: "No more tiny thumbnails you can't see",
		copy: "Full-width cards, pinch-to-zoom on every photo, video durations visible upfront. The feed feels like a social app, not a file dump.",
	},
	{
		title: "No app install for guests",
		copy: "Share a link or QR code. Guests open it, pick their photos, done. No sign-up, no account, no friction at the party.",
	},
	{
		title: "No lost uploads on bad wifi",
		copy: "Uploads stay visible while syncing. If one gets stuck on spotty venue wifi, skip it or retry. Nothing disappears silently.",
	},
];

const steps = [
	{
		step: "01",
		title: "Create the event",
		copy: "Pick the start and end times and Recapd knows exactly what to collect.",
	},
	{
		step: "02",
		title: "Invite everyone",
		copy: "Send a join link or QR code so guests can contribute from any phone in seconds.",
	},
	{
		step: "03",
		title: "Collect automatically",
		copy: "When the event ends, Recapd scans the matching media and surfaces the right shots and clips.",
	},
	{
		step: "04",
		title: "Relive the night",
		copy: "Browse the feed, zoom into moments, and download the memories you want to keep forever.",
	},
];

const useCases = [
	{
		label: "Birthdays",
		copy: "One shared album from 15 friends, collected in minutes instead of weeks of chasing.",
	},
	{
		label: "Weddings",
		copy: "Every guest's perspective of the first dance, the speeches, the late-night dance floor - all in one place.",
	},
	{
		label: "Concerts & festivals",
		copy: "That clip your friend got from the front row? It's already in the feed before you ask.",
	},
];

const faqs = [
	{
		q: "Do guests need to download the app?",
		a: "Yes, guests download the app to contribute photos and videos. But they don't need to create an account. They just open the invite link, pick their media, and contribute. Takes about 30 seconds.",
	},
	{
		q: "How does the auto-scan work?",
		a: "When you create an event, you set the start and end time. After the event, Recapd scans each guest's camera roll for photos and videos taken during that window. No manual sorting needed.",
	},
	{
		q: "What happens to my photos after the event?",
		a: "Media is stored for 14 days. During that time, anyone in the event can browse and download full-resolution copies. After 14 days, the shared data is automatically cleaned up.",
	},
	{
		q: "Is Recapd free?",
		a: "Yes, for events up to 10 people. If you're hosting something bigger, Pro is $2.99/month and only the host needs it. Every guest always joins free.",
	},
	{
		q: "Does it work on both iPhone and Android?",
		a: "Yes. Recapd is available on both the App Store and Google Play. Guests with any phone can contribute to the same event.",
	},
	{
		q: "How is this different from a shared album or Google Photos?",
		a: "Shared albums require everyone to manually upload. Recapd auto-scans the right time window, so guests just approve the photos it finds. No manual uploads, no forgotten photos, no setup headaches.",
	},
];

function StoreBadges({ size = "default" }: { size?: "default" | "large" }) {
	const cls = size === "large" ? "store-badges store-badges-large" : "store-badges";
	return (
		<div className={cls}>
			<a
				href="https://apps.apple.com/no/app/recapd/id6758083751"
				className="store-badge"
				target="_blank"
				rel="noopener noreferrer"
				aria-label="Download Recapd on the App Store"
			>
				<img src="/app-store-badge.svg" alt="Download on the App Store" />
			</a>
			<a
				href="https://play.google.com/store/apps/details?id=com.zaimimran.recapd"
				className="store-badge google-play"
				target="_blank"
				rel="noopener noreferrer"
				aria-label="Get Recapd on Google Play"
			>
				<img src="/google-play-badge.png" alt="Get it on Google Play" />
			</a>
		</div>
	);
}

export default function Home() {
	return (
		<div className="home-page">
			<a className="skip-nav" href="#main-content">
				Skip to main content
			</a>

			<main id="main-content">
				<section className="hero" aria-label="Introduction">
					<div className="hero-backdrop hero-backdrop-left" aria-hidden="true" />
					<div className="hero-backdrop hero-backdrop-right" aria-hidden="true" />
					<div className="container hero-grid">
						<div className="hero-copy">
							<div className="eyebrow">
								<span className="eyebrow-dot" aria-hidden="true" />
								Shared event memories, without the chaos
							</div>
							<img
								src="/icon.png"
								alt="Recapd app icon"
								className="app-icon"
								width="88"
								height="88"
								loading="eager"
								fetchPriority="high"
							/>
							<h1>
								See your party from everyone's eyes.{" "}
								<span className="h1-fade">Not just yours.</span>
							</h1>
							<p className="hero-subtitle">
								10 phones at every party, but you only see your own shots. Recapd gives every event
								one shared feed - guests contribute from their phones, the app collects the right
								photos and videos automatically, and nobody has to ask "can you send me that?" ever
								again.
							</p>
							<div className="hero-actions">
								<a href="#download" className="primary-cta">
									Download free - try it at your next event
								</a>
								<StoreBadges />
							</div>
						</div>

						<div className="hero-visual">
							<div className="orbit-ring orbit-ring-one" aria-hidden="true" />
							<div className="orbit-ring orbit-ring-two" aria-hidden="true" />
							<div className="hero-phone hero-phone-main">
								<div className="hero-phone-topbar" aria-hidden="true" />
								<div className="hero-screen hero-feed-screen">
									<div className="feed-post feed-post-compact">
										<div className="feed-post-header">
											<div className="avatar avatar-teal" aria-hidden="true">
												R
											</div>
											<div>
												<div className="feed-name">Recapd Live</div>
												<div className="feed-meta">The feed updates as uploads finish</div>
											</div>
										</div>
										<div className="feed-media feed-media-hero">
											<img
												src="/screenshots/timeline.png"
												alt="Recapd event feed showing photos and videos in a scrollable timeline"
												fetchPriority="high"
											/>
											<div
												className="media-badge"
												role="img"
												aria-label="Video duration: 1 minute 5 seconds"
											>
												VIDEO 00:01:05
											</div>
										</div>
										<div className="feed-actions" aria-hidden="true">
											<span>Pinch to zoom</span>
											<span>Pan while zoomed</span>
										</div>
									</div>

									<div className="feed-post feed-post-floating">
										<div className="feed-post-header">
											<div className="avatar avatar-coral" aria-hidden="true">
												Z
											</div>
											<div>
												<div className="feed-name">Zaim&apos;s Birthday</div>
												<div className="feed-meta">67 media items from 9 guests</div>
											</div>
										</div>
										<div className="feed-media feed-media-grid">
											<img
												src="/screenshots/found-photos.png"
												alt="Grid of auto-discovered photos from an event"
												loading="lazy"
												decoding="async"
											/>
										</div>
									</div>
								</div>
							</div>

							<div className="hero-stat hero-stat-top">
								<span className="stat-label">Auto-scan</span>
								<span className="stat-value">Finds the right event window</span>
							</div>
							<div className="hero-stat hero-stat-bottom">
								<span className="stat-label">Feed behavior</span>
								<span className="stat-value">Tap, zoom, pan, relive</span>
							</div>
						</div>
					</div>
				</section>

				<section className="trust-strip" aria-label="Key benefits">
					<div className="container trust-strip-inner">
						<div className="trust-item">
							<span className="trust-icon" aria-hidden="true">
								<svg
									width="20"
									height="20"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
									<line x1="12" y1="18" x2="12" y2="18" />
								</svg>
							</span>
							<span>Available on iOS & Android</span>
						</div>
						<div className="trust-divider" aria-hidden="true" />
						<div className="trust-item">
							<span className="trust-icon" aria-hidden="true">
								<svg
									width="20"
									height="20"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
								</svg>
							</span>
							<span>Free for events up to 10 people</span>
						</div>
						<div className="trust-divider" aria-hidden="true" />
						<div className="trust-item">
							<span className="trust-icon" aria-hidden="true">
								<svg
									width="20"
									height="20"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
									<circle cx="12" cy="7" r="4" />
								</svg>
							</span>
							<span>No account needed for guests</span>
						</div>
					</div>
				</section>

				<section className="problem" aria-labelledby="problem-heading">
					<div className="container problem-grid">
						<div className="problem-copy">
							<div className="section-kicker">Why it exists</div>
							<h2 id="problem-heading">
								10 phones at your birthday. Zero photos in your camera roll.
							</h2>
							<p>
								Someone got the perfect shot of the toast. Someone else caught the group photo. Good
								luck getting any of it. Between AirDrop fails, "I'll send it later," and group chat
								chaos - half those memories are already gone.
							</p>
						</div>
						<div className="problem-card">
							<div className="problem-statement">All the memories in one place</div>
							<div className="problem-stack">
								<div className="problem-item">
									<span>Before</span>
									<p>10 phones, 1 group chat, and a mess of missing shots nobody ever sends.</p>
								</div>
								<div className="problem-item problem-item-active">
									<span>With Recapd</span>
									<p>
										One shared feed that pulls the right photos and videos from every guest's phone.
										Automatically.
									</p>
								</div>
							</div>
						</div>
					</div>
				</section>

				<section className="proof" aria-labelledby="proof-heading">
					<div className="container proof-grid">
						<div className="proof-tile proof-tile-large">
							<img
								src="/screenshots/home.png"
								alt="Recapd home screen showing event list with stats and quick sharing"
								loading="lazy"
								decoding="async"
							/>
							<div className="proof-overlay">
								<span>Host view</span>
								<strong>Clean stats, quick sharing, and a feed that feels alive.</strong>
							</div>
						</div>
						<div className="proof-tile proof-tile-side">
							<img
								src="/screenshots/select-photos.png"
								alt="Guest photo selection screen with thumbnail grid and upload controls"
								loading="lazy"
								decoding="async"
							/>
							<div className="proof-overlay">
								<span>Guest flow</span>
								<strong>Fast selection with thumbnails and clear media identity.</strong>
							</div>
						</div>
						<div className="proof-copy">
							<div className="section-kicker">What it feels like</div>
							<h2 id="proof-heading">
								A feed that feels like scrolling Instagram, not digging through a folder.
							</h2>
							<p>
								Full-width cards, zoomable media, video thumbnails with durations - not a grid of
								tiny squares you can't make out. Every memory gets the space it deserves.
							</p>
						</div>
					</div>
				</section>

				<section className="features" aria-labelledby="features-heading">
					<div className="container">
						<div className="section-heading">
							<div className="section-kicker">Core features</div>
							<h2 id="features-heading">Built for real events and real phones.</h2>
						</div>
						<div className="feature-grid">
							{features.map((feature) => (
								<article key={feature.title} className="feature-card">
									<div className="feature-card-top">
										<div className="feature-mark" aria-hidden="true" />
										<h3>{feature.title}</h3>
									</div>
									<p>{feature.copy}</p>
								</article>
							))}
						</div>
					</div>
				</section>

				<section className="workflow" aria-labelledby="workflow-heading">
					<div className="container">
						<div className="section-heading">
							<div className="section-kicker">How it works</div>
							<h2 id="workflow-heading">From invite to feed in four steps.</h2>
						</div>
						<div className="workflow-grid">
							{steps.map((step) => (
								<div key={step.step} className="workflow-card">
									<div className="workflow-step">{step.step}</div>
									<h3>{step.title}</h3>
									<p>{step.copy}</p>
								</div>
							))}
						</div>
						<div className="mid-cta">
							<p className="mid-cta-line">Your next event deserves better than a group chat.</p>
							<div className="mid-cta-actions">
								<a href="#download" className="primary-cta">
									Download Recapd free
								</a>
								<a href="#pricing" className="secondary-cta">
									See pricing
								</a>
							</div>
						</div>
					</div>
				</section>

				<section className="feature-story" aria-labelledby="story-heading">
					<div className="container story-grid">
						<div className="story-copy">
							<div className="section-kicker">The feed</div>
							<h2 id="story-heading">Every photo gets the space it deserves.</h2>
							<p>
								No cramped grids. No thumbnails you have to squint at. Recapd gives every shot a
								full card - tap to zoom, swipe to browse, download what you want to keep.
							</p>
						</div>
						<div className="story-strip">
							<img
								src="/screenshots/timeline.png"
								alt="Timeline feed showing full-width photo cards"
								loading="lazy"
								decoding="async"
							/>
							<img
								src="/screenshots/found-photos.png"
								alt="Auto-discovered photos ready for review"
								loading="lazy"
								decoding="async"
							/>
							<img
								src="/screenshots/share.png"
								alt="Event sharing screen with QR code and invite link"
								loading="lazy"
								decoding="async"
							/>
						</div>
					</div>
				</section>

				<section className="use-cases" aria-labelledby="usecases-heading">
					<div className="container">
						<div className="section-heading">
							<div className="section-kicker">Use cases</div>
							<h2 id="usecases-heading">Built for nights worth remembering.</h2>
						</div>
						<div className="use-case-grid">
							{useCases.map((uc) => (
								<article key={uc.label} className="use-case-card">
									<div className="use-case-label">{uc.label}</div>
									<p>{uc.copy}</p>
								</article>
							))}
						</div>
					</div>
				</section>

				<section className="pricing" id="pricing" aria-labelledby="pricing-heading">
					<div className="container">
						<div className="section-heading">
							<div className="section-kicker">Pricing</div>
							<h2 id="pricing-heading">Less than a coffee. And guests are always free.</h2>
						</div>
						<div className="pricing-grid">
							<div className="pricing-card">
								<div className="pricing-head">
									<h3>Free</h3>
									<div className="pricing-price">$0</div>
								</div>
								<p className="pricing-description">
									Everything you need for a small get-together. Up to 10 friends, all photos
									included.
								</p>
								<ul className="pricing-features">
									<li>Up to 10 participants</li>
									<li>Unlimited photos and videos</li>
									<li>Full-resolution downloads</li>
									<li>14-day storage</li>
									<li>Video uploads up to 30 seconds</li>
								</ul>
							</div>
							<div className="pricing-card pricing-card-featured">
								<div className="pricing-badge">Recommended</div>
								<div className="pricing-head">
									<h3>Pro</h3>
									<div className="pricing-price">
										$2.99 <span>/ month</span>
									</div>
								</div>
								<p className="pricing-description">
									Throwing something bigger? Only the host pays. Every guest joins free, no account
									needed.
								</p>
								<ul className="pricing-features">
									<li>Unlimited participants</li>
									<li>Unlimited photos and videos</li>
									<li>Full-resolution downloads</li>
									<li>14-day storage</li>
									<li>Video uploads up to 5 minutes</li>
								</ul>
							</div>
						</div>
						<div className="pricing-note">
							$2.99/mo is less than one drink at the bar. And unlike that drink, you'll actually
							remember the night. Only the host needs Pro - every guest joins free, without creating
							an account.
						</div>
						<div className="mid-cta">
							<a href="#download" className="primary-cta">
								Start with the free plan
							</a>
						</div>
					</div>
				</section>

				<section className="faq" aria-labelledby="faq-heading">
					<div className="container">
						<div className="section-heading">
							<div className="section-kicker">FAQ</div>
							<h2 id="faq-heading">Questions? Answers.</h2>
						</div>
						<div className="faq-list">
							{faqs.map((faq) => (
								<details key={faq.q} className="faq-item">
									<summary>{faq.q}</summary>
									<p>{faq.a}</p>
								</details>
							))}
						</div>
					</div>
				</section>

				<section className="final-cta" id="download" aria-labelledby="download-heading">
					<div className="container final-cta-shell">
						<div className="final-copy">
							<h2 id="download-heading">Your next event is too good to lose to a group chat.</h2>
							<p>Download Recapd, create the event, share the link. The feed builds itself.</p>
						</div>
						<div className="cta-buttons cta-buttons-large">
							<StoreBadges size="large" />
						</div>
					</div>
				</section>
			</main>

			<footer className="footer">
				<div className="container footer-content">
					<div>
						<img src="/icon.png" alt="Recapd" className="footer-icon" width="56" height="56" />
						<p className="footer-tagline">Shared event memories, built for photos and videos.</p>
					</div>
					<nav aria-label="Footer links" className="footer-links">
						<a href="/privacy">Privacy Policy</a>
						<a href="/support">Support</a>
						<a href="/terms">Terms</a>
					</nav>
					<p className="copyright">&copy; 2026 Recapd. All rights reserved.</p>
				</div>
			</footer>
		</div>
	);
}
