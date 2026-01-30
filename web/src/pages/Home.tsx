import "../styles/Home.css";

export default function Home() {
	return (
		<>
			<section className="hero">
				<div className="container">
					<div className="hero-content">
						<div className="hero-text">
							<img
								src="/icon.png"
								alt="Recapd app icon - green camera logo for event photo sharing"
								className="app-icon"
							/>
							<h1>Recapd - The #1 Photo Sharing App for Events</h1>
							<p className="hero-subtitle">
								See the night from everyone's eyes. Automatically collect and share photos from
								weddings, parties, concerts, and festivals into one beautiful timeline.
							</p>
							<div className="cta-buttons">
								<a
									href="https://apps.apple.com/no/app/recapd/id6758083751"
									className="store-badge"
									target="_blank"
									rel="noopener noreferrer"
								>
									<img src="/app-store-badge.svg" alt="Download on the App Store" />
								</a>
								<a
									href="https://play.google.com/store/apps/details?id=app.recapd"
									className="store-badge google-play"
									target="_blank"
									rel="noopener noreferrer"
								>
									<img src="/google-play-badge.png" alt="Get it on Google Play" />
								</a>
							</div>
						</div>
						<div className="hero-visual">
							<div className="phone-mockup">
								<div className="phone-screen hero-screen">
									<div className="screen-header">
										<div>
											<div className="event-title">Zaim's Birthday</div>
											<div className="event-meta">Dec 13, 2025 · 8PM - 2AM</div>
										</div>
									</div>
									<div className="expiry-badge">14 days left</div>
									<div className="stats-row">
										<div className="stat-box">
											<div className="stat-number">67</div>
											<div className="stat-label">Photos</div>
										</div>
										<div className="stat-box">
											<div className="stat-number">9</div>
											<div className="stat-label">Guests</div>
										</div>
									</div>
									<div className="photo-grid">
										<div className="grid-photo"></div>
										<div className="grid-photo"></div>
										<div className="grid-photo"></div>
										<div className="grid-photo"></div>
										<div className="grid-photo"></div>
										<div className="grid-photo"></div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</section>

			<section className="problem">
				<div className="container">
					<h2>Group photos scattered across 10 different phones?</h2>
					<p>
						Forget the chaos of group chats, AirDrop requests, and "can you send me that photo?"
						texts. Recapd automatically collects everyone's event photos into one shared timeline.
					</p>
				</div>
			</section>

			<section className="how-it-works">
				<div className="container">
					<h2>How It Works</h2>
					<div className="steps">
						<div className="step">
							<div className="step-number">1</div>
							<div className="step-phone">
								<div className="step-screen screen-create">
									<div className="input-mock"></div>
									<div className="input-mock"></div>
									<div className="input-mock"></div>
									<div className="btn-mock"></div>
								</div>
							</div>
							<h3>Create</h3>
							<p>
								Before your event, set the time window. Recapd will know exactly when to look for
								photos.
							</p>
						</div>
						<div className="step">
							<div className="step-number">2</div>
							<div className="step-phone">
								<div className="step-screen screen-share">
									<div className="qr-mock">
										{[...Array(25)].map((_, i) => (
											<div key={i} className="qr-cell"></div>
										))}
									</div>
									<div className="share-label">Scan to join event</div>
								</div>
							</div>
							<h3>Share</h3>
							<p>Send guests a QR code or link to join. No account needed — just scan and go.</p>
						</div>
						<div className="step">
							<div className="step-number">3</div>
							<div className="step-phone">
								<div className="step-screen screen-upload">
									<div className="notif-mock">
										<div className="notif-icon">
											<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
												<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
												<polyline points="22 4 12 14.01 9 11.01" />
											</svg>
										</div>
										<div className="notif-text">We found 6 photos!</div>
										<div className="notif-sub">From your event last night</div>
									</div>
									<div className="photo-dots">
										<div className="photo-dot"></div>
										<div className="photo-dot"></div>
										<div className="photo-dot"></div>
									</div>
								</div>
							</div>
							<h3>Upload</h3>
							<p>
								After the party, everyone gets reminded. Photos are pre-selected automatically —
								just tap to share.
							</p>
						</div>
						<div className="step">
							<div className="step-number">4</div>
							<div className="step-phone">
								<div className="step-screen screen-relive">
									<div className="timeline-mock">
										{[...Array(9)].map((_, i) => (
											<div key={i} className="photo-mock"></div>
										))}
									</div>
								</div>
							</div>
							<h3>Relive</h3>
							<p>See the night from everyone's eyes. All photos in one beautiful timeline.</p>
						</div>
					</div>
				</div>
			</section>

			<section className="features">
				<div className="container">
					<h2>Why Recapd?</h2>
					<div className="feature-grid">
						<div className="feature-card with-screenshot">
							<div className="feature-text">
								<div className="feature-icon">
									<svg
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2"
										strokeLinecap="round"
										strokeLinejoin="round"
									>
										<path d="M12 2L2 7l10 5 10-5-10-5z" />
										<path d="M2 17l10 5 10-5" />
										<path d="M2 12l10 5 10-5" />
									</svg>
								</div>
								<h3>Auto-Magic Selection</h3>
								<p>
									Recapd automatically finds photos taken during your event's time window. No manual
									sorting required.
								</p>
							</div>
							<div className="feature-wireframe">
								<div className="feature-wireframe-screen screen-upload">
									<div className="notif-mock">
										<div className="notif-icon">
											<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
												<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
												<polyline points="22 4 12 14.01 9 11.01" />
											</svg>
										</div>
										<div className="notif-text">We found 6 photos!</div>
										<div className="notif-sub">From your event last night</div>
									</div>
									<div className="photo-dots">
										<div className="photo-dot"></div>
										<div className="photo-dot"></div>
										<div className="photo-dot"></div>
									</div>
								</div>
							</div>
						</div>
						<div className="feature-card with-screenshot">
							<div className="feature-text">
								<div className="feature-icon">
									<svg
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2"
										strokeLinecap="round"
										strokeLinejoin="round"
									>
										<rect x="3" y="3" width="18" height="18" rx="2" />
										<circle cx="8.5" cy="8.5" r="1.5" />
										<path d="M21 15l-5-5L5 21" />
									</svg>
								</div>
								<h3>Unified Timeline</h3>
								<p>
									See the entire event unfold from everyone's perspective in one beautiful,
									chronological timeline.
								</p>
							</div>
							<div className="feature-wireframe">
								<div className="feature-wireframe-screen screen-relive">
									<div className="timeline-mock">
										{[...Array(9)].map((_, i) => (
											<div key={i} className="photo-mock"></div>
										))}
									</div>
								</div>
							</div>
						</div>
						<div className="feature-card">
							<div className="feature-icon">
								<svg
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
									<polyline points="7 10 12 15 17 10" />
									<line x1="12" y1="15" x2="12" y2="3" />
								</svg>
							</div>
							<h3>One-Tap Download</h3>
							<p>
								Save all the photos you want to your camera roll instantly. No compression, full
								quality.
							</p>
						</div>
						<div className="feature-card">
							<div className="feature-icon">
								<svg
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<circle cx="12" cy="12" r="10" />
									<polyline points="12 6 12 12 16 14" />
								</svg>
							</div>
							<h3>No Storage Bloat</h3>
							<p>
								Shared photos expire after 2 weeks. Your photos stay on your device, but shared
								links clean themselves up.
							</p>
						</div>
					</div>
				</div>
			</section>

			<section className="final-cta" id="beta">
				<div className="container">
					<h2>Be the first to try Recapd</h2>
					<p>Join our beta program and help shape the future of event photo sharing.</p>
					<div className="cta-buttons">
						<a
							href="https://forms.gle/ueGTwhM4Vz3K2mBL9"
							target="_blank"
							rel="noopener noreferrer"
							className="btn btn-beta"
						>
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
								<circle cx="8.5" cy="7" r="4" />
								<line x1="20" y1="8" x2="20" y2="14" />
								<line x1="23" y1="11" x2="17" y2="11" />
							</svg>
							Join the Beta
						</a>
					</div>
					<p className="cta-subtext">Get early access and exclusive features</p>
				</div>
			</section>

			<footer>
				<div className="container">
					<div className="footer-content">
						<div className="footer-links">
							<a href="/privacy">Privacy Policy</a>
							<a href="/support">Support</a>
						</div>
						<p className="copyright">&copy; 2026 Recapd. All rights reserved.</p>
						<p className="legal-attribution">
							Apple and the Apple logo are trademarks of Apple Inc. Google Play and the Google Play
							logo are trademarks of Google LLC.
						</p>
					</div>
				</div>
			</footer>
		</>
	);
}
