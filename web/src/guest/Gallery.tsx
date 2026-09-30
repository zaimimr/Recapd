import type { GalleryProps } from "./types";

export type { GalleryProps };

export default function Gallery({ event }: GalleryProps) {
	return (
		<main className="guest-page">
			<header className="guest-gallery-header">
				<p className="guest-eyebrow">You're in</p>
				<h1 className="guest-title">{event.title}</h1>
			</header>
			<p className="guest-body">Photos from everyone will show up here.</p>
		</main>
	);
}
