import { resolveTimeZone } from "../../../kit/format";
import type { GuestEvent } from "../types";
import { mapsUrl, scheduleItems } from "./eventInfoModel";

export default function EventInfo({ event }: { event: GuestEvent }) {
	const location = event.location?.trim();
	const dressCode = event.dress_code?.trim();
	const details = event.details?.trim();
	const schedule = scheduleItems(event.schedule);
	if (!location && !dressCode && !details && schedule.length === 0) return null;

	const time = new Intl.DateTimeFormat(undefined, {
		hour: "numeric",
		minute: "2-digit",
		timeZone: resolveTimeZone(event.timezone),
	});

	return (
		<section className="event-info" aria-label="Event info">
			{location ? (
				<a className="event-info-row" href={mapsUrl(location)} target="_blank" rel="noreferrer">
					<span className="event-info-label">Where</span>
					<span className="event-info-value event-info-link">{location}</span>
				</a>
			) : null}
			{dressCode ? (
				<div className="event-info-row">
					<span className="event-info-label">Dress code</span>
					<span className="event-info-value">{dressCode}</span>
				</div>
			) : null}
			{details ? <p className="event-info-note">{details}</p> : null}
			{schedule.length > 0 ? (
				<ol className="event-info-schedule">
					{schedule.map((item) => (
						<li key={`${item.time}-${item.title}`}>
							<time dateTime={item.time}>{time.format(new Date(item.time))}</time>
							<span>{item.title}</span>
						</li>
					))}
				</ol>
			) : null}
		</section>
	);
}
