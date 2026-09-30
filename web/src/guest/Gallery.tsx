import type { GalleryProps } from "./types";
import UploadTray, { AddMediaButton } from "./upload/UploadTray";
import { useUploadQueue } from "./upload/useUploadQueue";

export type { GalleryProps };

export default function Gallery({ event, profileId }: GalleryProps) {
	const uploads = useUploadQueue(event.id, profileId);
	return (
		<main className="guest-page">
			<header className="guest-gallery-header">
				<p className="guest-eyebrow">You're in</p>
				<h1 className="guest-title">{event.title}</h1>
			</header>
			<AddMediaButton onFiles={uploads.add} />
			<UploadTray queue={uploads} />
			<p className="guest-body">Photos from everyone will show up here.</p>
		</main>
	);
}
