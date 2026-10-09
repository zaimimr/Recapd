import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { normalizeCode } from "../../kit/format";
import AppPrompt from "./AppPrompt";
import DownloadSheet from "./download/DownloadSheet";
import Full from "./Full";
import Gallery from "./gallery/Gallery";
import NotFound from "./NotFound";
import type { GalleryProps } from "./types";
import { useGuestSession } from "./useGuestSession";
import ViewOnlyGallery from "./view/ViewOnlyGallery";
import Welcome from "./Welcome";
import "./guest.css";

function GalleryScreen(props: GalleryProps) {
	return (
		<DownloadSheet event={props.event}>
			{({ saveOne, downloadAll }) => (
				<Gallery {...props} onSave={saveOne} onDownloadAll={downloadAll} />
			)}
		</DownloadSheet>
	);
}

function GuestScreens({ code, onRetry }: { code: string; onRetry: () => void }) {
	const { state, join } = useGuestSession(code);
	const [viewingPhotos, setViewingPhotos] = useState(false);

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
			return viewingPhotos ? (
				<ViewOnlyGallery event={state.event} />
			) : (
				<Full event={state.event} onViewPhotos={() => setViewingPhotos(true)} />
			);
		case "welcome":
			return (
				<Welcome
					event={state.event}
					existingName={state.existingName}
					onJoin={(name) => join(state.event, name)}
				/>
			);
		case "gallery":
			return (
				<GalleryScreen event={state.event} profileId={state.profileId} session={state.session} />
			);
	}
}

export default function GuestApp() {
	const params = useParams();
	const code = normalizeCode(params.code);
	const [attempt, setAttempt] = useState(0);
	return (
		<div className="guest">
			{code ? (
				<>
					<GuestScreens
						key={`${code}-${attempt}`}
						code={code}
						onRetry={() => setAttempt((value) => value + 1)}
					/>
					<AppPrompt code={code} />
				</>
			) : (
				<NotFound />
			)}
		</div>
	);
}
