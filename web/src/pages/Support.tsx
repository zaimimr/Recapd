import '../styles/Page.css'

export default function Support() {
  return (
    <div className="page-container">
      <h1>Support</h1>
      <p className="subtitle">We're here to help</p>

      <h2>Getting Started</h2>
      <p>Recapd makes it easy to share photos with your group. Create an event, share the code with friends, and everyone can contribute photos that are visible to all participants.</p>

      <h2>Frequently Asked Questions</h2>

      <div className="faq-item">
        <p className="question">How do I create an event?</p>
        <p className="answer">Tap "Create Event" on the home screen, enter a name for your event, and optionally set an end date. You'll receive a unique code to share with your group.</p>
      </div>

      <div className="faq-item">
        <p className="question">How do I join an event?</p>
        <p className="answer">Tap "Join Event" and enter the 6-character code shared by the event creator. You can also scan a QR code if one is provided.</p>
      </div>

      <div className="faq-item">
        <p className="question">Who can see my photos?</p>
        <p className="answer">Only people who have joined the same event can see photos shared within that event. Photos are not publicly accessible.</p>
      </div>

      <div className="faq-item">
        <p className="question">How do I delete a photo?</p>
        <p className="answer">Open the event, find your photo, and tap the delete option. You can only delete photos you uploaded.</p>
      </div>

      <div className="faq-item">
        <p className="question">Can I download photos from an event?</p>
        <p className="answer">Yes, you can save any photo from an event to your device's photo library by tapping and holding on the photo.</p>
      </div>

      <h2>Contact Us</h2>
      <p>Can't find what you're looking for? Reach out to our support team.</p>
      <a href="mailto:support@recapd.app" className="contact-btn">Email Support</a>
      <p className="email-hint">support@recapd.app</p>

      <p className="version">Recapd v1.0.0</p>
    </div>
  )
}
