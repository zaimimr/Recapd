import { useEffect } from "react";
import { LogoLockup, LogoMark } from "../components/Logo";
import { hub, type Occasion, occasions } from "../occasions";
import { StoreBadges } from "./Home";
import "../styles/Home.css";

function OccasionGrid({ items }: { items: Occasion[] }) {
	return (
		<div className="use-case-grid">
			{items.map((occasion) => (
				<a key={occasion.slug} href={`/${occasion.slug}`} className="use-case-card">
					<div className="use-case-label">{occasion.kicker}</div>
					<p>{occasion.h1}</p>
				</a>
			))}
		</div>
	);
}

export default function Occasions() {
	useEffect(() => {
		document.title = hub.metaTitle;
	}, []);

	return (
		<div className="home-page">
			<header className="site-nav">
				<div className="container site-nav-inner">
					<a href="/" className="nav-brand" aria-label="Recapd home">
						<LogoLockup size={34} />
					</a>
					<nav className="nav-links" aria-label="Primary">
						<a href="#download" className="nav-cta">
							Get the app
						</a>
					</nav>
				</div>
			</header>

			<main id="main-content">
				<section className="hero" aria-label={hub.kicker}>
					<div className="hero-backdrop hero-backdrop-left" aria-hidden="true" />
					<div className="hero-backdrop hero-backdrop-right" aria-hidden="true" />
					<div className="container">
						<div className="hero-copy">
							<div className="eyebrow">
								<span className="eyebrow-dot" aria-hidden="true" />
								{hub.kicker}
							</div>
							<div className="hero-mark" aria-hidden="true">
								<LogoMark size={84} />
							</div>
							<h1>{hub.h1}</h1>
							<p className="hero-subtitle">{hub.intro}</p>
						</div>
					</div>
				</section>

				<section className="use-cases" aria-label={hub.kicker}>
					<div className="container">
						<OccasionGrid items={occasions.filter((occasion) => occasion.lang === "en")} />
					</div>
				</section>

				<section className="use-cases" aria-labelledby="nb-heading" lang="nb">
					<div className="container">
						<div className="section-heading">
							<h2 id="nb-heading">{hub.nbHeading}</h2>
						</div>
						<OccasionGrid items={occasions.filter((occasion) => occasion.lang === "nb")} />
					</div>
				</section>

				<section className="final-cta" id="download" aria-labelledby="download-heading">
					<div className="container final-cta-shell">
						<div className="final-copy">
							<h2 id="download-heading">Get Recapd for your next event</h2>
						</div>
						<div className="cta-buttons cta-buttons-large">
							<StoreBadges size="large" />
						</div>
					</div>
				</section>
			</main>

			<footer className="footer">
				<div className="container footer-content">
					<LogoLockup size={40} />
					<nav aria-label="Footer links" className="footer-links">
						<a href="/privacy">Privacy Policy</a>
						<a href="/support">Support</a>
						<a href="/terms">Terms</a>
					</nav>
					<p className="copyright">&copy; 2026 Recapd</p>
				</div>
			</footer>
		</div>
	);
}
