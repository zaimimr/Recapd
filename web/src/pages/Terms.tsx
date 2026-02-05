import "../styles/Page.css";

export default function Terms() {
	return (
		<div className="page-container">
			<h1>Terms of Service</h1>
			<p className="updated">Last updated: February 2026</p>

			<h2>Acceptance of Terms</h2>
			<p>
				By downloading, installing, or using Recapd, you agree to be bound by these Terms of
				Service. If you do not agree to these terms, please do not use the app.
			</p>

			<h2>Description of Service</h2>
			<p>
				Recapd is a photo sharing application that allows users to create and join events, share
				photos and videos with event participants, and download shared media. The service is
				provided "as is" and may be modified or discontinued at any time.
			</p>

			<h2>User Responsibilities</h2>
			<p>When using Recapd, you agree to:</p>
			<ul>
				<li>Only share content that you have the right to share</li>
				<li>Not upload illegal, harmful, or offensive content</li>
				<li>Not use the service for any unlawful purpose</li>
				<li>Respect the privacy and rights of other users</li>
				<li>Keep event codes confidential when appropriate</li>
			</ul>

			<h2>Content Ownership</h2>
			<p>
				You retain ownership of all photos and videos you upload to Recapd. By sharing content, you
				grant Recapd a limited license to store, display, and distribute your content to other event
				participants. This license ends when you delete your content or leave the event.
			</p>

			<h2>Prohibited Content</h2>
			<p>The following content is strictly prohibited:</p>
			<ul>
				<li>Content that infringes on intellectual property rights</li>
				<li>Explicit, violent, or harmful material</li>
				<li>Content that harasses, threatens, or harms others</li>
				<li>Spam, malware, or deceptive content</li>
				<li>Content that violates any applicable laws</li>
			</ul>

			<h2>Account Termination</h2>
			<p>
				We reserve the right to suspend or terminate access to Recapd for users who violate these
				terms, abuse the service, or engage in harmful behavior. You may stop using the service at
				any time.
			</p>

			<h2>Limitation of Liability</h2>
			<p>
				Recapd is provided without warranties of any kind. We are not liable for any damages arising
				from your use of the service, including but not limited to data loss, service interruptions,
				or unauthorized access to your content.
			</p>

			<h2>Changes to Terms</h2>
			<p>
				We may update these Terms of Service from time to time. Continued use of Recapd after
				changes constitutes acceptance of the new terms. We encourage you to review these terms
				periodically.
			</p>

			<h2>Contact Us</h2>
			<p>
				If you have questions about these Terms of Service, please contact us at{" "}
				<a href="mailto:support@recapd.app">support@recapd.app</a>
			</p>
		</div>
	);
}
