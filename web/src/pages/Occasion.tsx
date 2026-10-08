import { useEffect } from "react";
import { LogoLockup, LogoMark } from "../components/Logo";
import { type Occasion as OccasionData, occasions } from "../occasions";
import { StoreBadges } from "./Home";
import "../styles/Home.css";

const labels = {
	en: { faq: "FAQ", getApp: "Get the app", privacy: "Privacy Policy", more: "More occasions" },
	nb: { faq: "Spørsmål", getApp: "Last ned appen", privacy: "Personvern", more: "Flere anledninger" },
};

export default function Occasion({ occasion }: { occasion: OccasionData }) {
	const text = labels[occasion.lang];

	useEffect(() => {
		document.title = occasion.metaTitle;
		document.documentElement.lang = occasion.lang;
		return () => {
			document.documentElement.lang = "en";
		};
	}, [occasion]);

	return (
		<div className="home-page">
			<header className="site-nav">
				<div className="container site-nav-inner">
					<a href="/" className="nav-brand" aria-label="Recapd home">
						<LogoLockup size={34} />
					</a>
					<nav className="nav-links" aria-label="Primary">
						<a href="#faq">{text.faq}</a>
						<a href="#download" className="nav-cta">
							{text.getApp}
						</a>
					</nav>
				</div>
			</header>

			<main id="main-content">
				<section className="hero" aria-label={occasion.kicker}>
					<div className="hero-backdrop hero-backdrop-left" aria-hidden="true" />
					<div className="hero-backdrop hero-backdrop-right" aria-hidden="true" />
					<div className="container">
						<div className="hero-copy">
							<div className="eyebrow">
								<span className="eyebrow-dot" aria-hidden="true" />
								{occasion.kicker}
							</div>
							<div className="hero-mark" aria-hidden="true">
								<LogoMark size={84} />
							</div>
							<h1>{occasion.h1}</h1>
							<p className="hero-subtitle">{occasion.intro}</p>
							<div className="hero-actions">
								<a href="#download" className="primary-cta">
									{occasion.cta}
								</a>
								<StoreBadges />
							</div>
						</div>
					</div>
				</section>

				<section className="features" aria-label={occasion.kicker}>
					<div className="container">
						<div className="feature-grid">
							{occasion.points.map((point) => (
								<article key={point.title} className="feature-card">
									<div className="feature-card-top">
										<div className="feature-mark" aria-hidden="true" />
										<h3>{point.title}</h3>
									</div>
									<p>{point.copy}</p>
								</article>
							))}
						</div>
					</div>
				</section>

				<section className="faq" id="faq" aria-labelledby="faq-heading">
					<div className="container">
						<div className="section-heading">
							<h2 id="faq-heading">{text.faq}</h2>
						</div>
						<div className="faq-list">
							{occasion.faqs.map((faq) => (
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
							<h2 id="download-heading">{occasion.cta}</h2>
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
					<nav aria-label={text.more} className="footer-links">
						{occasions
							.filter((other) => other.slug !== occasion.slug && other.lang === occasion.lang)
							.map((other) => (
								<a key={other.slug} href={`/${other.slug}`}>
									{other.kicker}
								</a>
							))}
					</nav>
					<nav aria-label="Footer links" className="footer-links">
						<a href="/privacy">{text.privacy}</a>
						<a href="/support">Support</a>
						<a href="/terms">Terms</a>
					</nav>
					<p className="copyright">&copy; 2026 Recapd</p>
				</div>
			</footer>
		</div>
	);
}
