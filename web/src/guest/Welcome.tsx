import { type FormEvent, useId, useState } from "react";
import { formatDateLabel, resolveTimeZone } from "../../kit/format";
import { NAME_MAX } from "./joinFlow";
import type { GuestEvent } from "./types";

type WelcomeProps = {
	event: GuestEvent;
	onJoin: (name: string) => Promise<string | null>;
};

function peopleLabel(count: number): string {
	return count === 1 ? "1 person is in" : `${count} people are in`;
}

export default function Welcome({ event, onJoin }: WelcomeProps) {
	const inputId = useId();
	const hintId = useId();
	const [name, setName] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [joining, setJoining] = useState(false);

	async function handleSubmit(submitEvent: FormEvent<HTMLFormElement>) {
		submitEvent.preventDefault();
		if (joining) return;
		setJoining(true);
		setError(null);
		const message = await onJoin(name);
		setError(message);
		setJoining(false);
	}

	return (
		<main className="guest-welcome">
			<div className="guest-brand">
				<span className="guest-brand-dot" aria-hidden="true" />
				Recapd
			</div>

			<section className="guest-hero">
				<p className="guest-eyebrow">You're invited to</p>
				<h1 className="guest-title">{event.title}</h1>
				<ul className="guest-meta">
					<li>{formatDateLabel(event.starts_at, resolveTimeZone(event.timezone))}</li>
					<li>{peopleLabel(event.participant_count)}</li>
				</ul>
			</section>

			<form className="guest-form" onSubmit={handleSubmit} noValidate>
				<label className="guest-label" htmlFor={inputId}>
					Your first name
				</label>
				<input
					id={inputId}
					className="guest-input"
					type="text"
					name="name"
					autoComplete="given-name"
					autoCapitalize="words"
					enterKeyHint="go"
					maxLength={NAME_MAX}
					placeholder="e.g. Sara"
					value={name}
					onChange={(changeEvent) => setName(changeEvent.target.value)}
					aria-invalid={error ? true : undefined}
					aria-describedby={hintId}
					disabled={joining}
				/>
				<p
					id={hintId}
					className={error ? "guest-hint guest-hint-error" : "guest-hint"}
					role={error ? "alert" : undefined}
				>
					{error ?? "Shown next to the photos you share. No account needed."}
				</p>
				<button type="submit" className="guest-button" disabled={joining}>
					{joining ? "Joining..." : "Join event"}
				</button>
			</form>

			<p className="guest-app-link">
				Have the app? <a href={`recapd://join/${event.join_code}`}>Open in Recapd</a>
			</p>
		</main>
	);
}
