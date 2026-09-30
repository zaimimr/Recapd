export default function NotFound() {
	return (
		<div className="guest-center">
			<div className="guest-panel">
				<div className="guest-mark" aria-hidden="true" />
				<h1 className="guest-heading">This link does not work</h1>
				<p className="guest-body">
					The event may have ended and been cleaned up, or the code is wrong. Ask your host for a
					fresh link.
				</p>
				<a className="guest-button guest-button-quiet" href="/">
					Go to recapd.app
				</a>
			</div>
		</div>
	);
}
