import "../styles/Page.css";

export default function Privacy() {
	return (
		<div className="page-container">
			<h1>Privacy Policy</h1>
			<p className="updated">Last updated: January 2026</p>

			<h2>Information We Collect</h2>
			<p>Recapd collects the following information to provide our photo sharing service:</p>
			<ul>
				<li>Photos and media you choose to share with events</li>
				<li>Device identifiers for anonymous authentication</li>
				<li>Push notification tokens (if you enable notifications)</li>
			</ul>

			<h2>Device Permissions</h2>
			<p>Recapd requests the following device permissions to provide its core functionality:</p>
			<ul>
				<li>
					<strong>Camera:</strong> Used solely to scan QR codes for quickly joining events. No
					photos or videos are captured through the camera.
				</li>
				<li>
					<strong>Photo Library / Media Storage:</strong> Used to access existing photos and videos
					from your device library that you choose to share with events, and to save downloaded
					media to your device.
				</li>
				<li>
					<strong>Notifications:</strong> Used to alert you about event activity, such as when new
					photos are shared or when you're invited to an event.
				</li>
			</ul>
			<p>
				All permissions are optional and requested only when needed. You can manage these
				permissions at any time through your device settings.
			</p>

			<h2>How We Use Your Information</h2>
			<p>Your information is used to:</p>
			<ul>
				<li>Enable photo sharing within events you create or join</li>
				<li>Send notifications about event activity</li>
				<li>Improve app functionality and user experience</li>
			</ul>

			<h2>Data Storage</h2>
			<p>
				Your photos and data are stored securely using Supabase cloud services. Event photos are
				accessible only to participants who have the event code.
			</p>

			<h2>Data Sharing</h2>
			<p>
				We do not sell your personal information. Photos you share are only visible to other
				participants within the same event. We may share anonymized analytics data to improve our
				services.
			</p>

			<h2>Your Rights</h2>
			<p>
				You can delete your photos from events at any time. You can leave events to remove your
				association with shared content. Contact us to request deletion of your account data.
			</p>

			<h2>Contact Us</h2>
			<p>
				If you have questions about this Privacy Policy, please contact us at{" "}
				<a href="mailto:support@recapd.app">support@recapd.app</a>
			</p>
		</div>
	);
}
