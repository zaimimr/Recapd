import type { GuestEvent } from "./types";

export default function Full({
	event,
	onViewPhotos,
}: {
	event: GuestEvent;
	onViewPhotos: () => void;
}) {
	return (
		<div className="guest-center">
			<div className="guest-panel">
				<div className="guest-mark" aria-hidden="true" />
				<p className="guest-eyebrow">{event.title}</p>
				<h1 className="guest-heading">This event is full</h1>
				<p className="guest-body">
					It has reached its guest limit. Ask the host to upgrade the event so more people can join.
				</p>
				<button type="button" className="guest-button" onClick={onViewPhotos}>
					View photos
				</button>
			</div>
		</div>
	);
}
