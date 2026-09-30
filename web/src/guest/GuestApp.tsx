import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { normalizeCode } from "../../kit/format";
import Full from "./Full";
import Gallery from "./Gallery";
import NotFound from "./NotFound";
import { useGuestSession } from "./useGuestSession";
import Welcome from "./Welcome";
import "./guest.css";

function GuestScreens({ code, onRetry }: { code: string; onRetry: () => void }) {
	const { state, join } = useGuestSession(code);

	useEffect(() => {
		if ("event" in state) document.title = `${state.event.title} | Recapd`;
	}, [state]);

	switch (state.screen) {
		case "loading":
			return (
				<div className="guest-center" aria-busy="true">
					<output className="guest-spinner" aria-label="Loading event" />
				</div>
			);
		case "error":
			return (
				<div className="guest-center">
					<div className="guest-panel">
						<h1 className="guest-heading">Something went wrong</h1>
						<p className="guest-body">We could not load this event. Check your connection.</p>
						<button type="button" className="guest-button" onClick={onRetry}>
							Try again
						</button>
					</div>
				</div>
			);
		case "notFound":
			return <NotFound />;
		case "full":
			return <Full event={state.event} />;
		case "welcome":
			return <Welcome event={state.event} onJoin={(name) => join(state.event, name)} />;
		case "gallery":
			return <Gallery event={state.event} profileId={state.profileId} session={state.session} />;
	}
}

export default function GuestApp() {
	const params = useParams();
	const code = normalizeCode(params.code);
	const [attempt, setAttempt] = useState(0);
	return (
		<div className="guest">
			{code ? (
				<GuestScreens
					key={`${code}-${attempt}`}
					code={code}
					onRetry={() => setAttempt((value) => value + 1)}
				/>
			) : (
				<NotFound />
			)}
		</div>
	);
}
