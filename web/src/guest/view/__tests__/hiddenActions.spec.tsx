import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Viewer from "../../gallery/Viewer";
import {
	REFRESH_ERROR,
	VIDEO_NOTICE,
	VIEW_ONLY_BANNER,
	ViewOnlyGalleryView,
} from "../ViewOnlyGallery";
import { parseViewResponse, thumbUrlMap } from "../viewModel";

const data = parseViewResponse({
	event: {
		title: "Summer party",
		starts_at: "2026-09-01T08:00:00Z",
		ends_at: "2026-09-01T23:00:00Z",
		timezone: "Europe/Oslo",
		participant_count: 12,
	},
	items: [
		{
			id: "p1",
			media_type: "photo",
			captured_at: "2026-09-01T10:00:00Z",
			uploader: { display_name: "Ada" },
			thumb: "https://x/thumb-p1",
			display: "https://x/display-p1",
		},
		{
			id: "v1",
			media_type: "video",
			duration_milliseconds: 12000,
			captured_at: "2026-09-01T09:00:00Z",
			uploader: null,
			thumb: "https://x/thumb-v1",
			display: null,
		},
	],
});

const noop = () => undefined;
const loadFull = () => Promise.resolve("https://x/display");

function renderView(refreshFailed = false) {
	return renderToStaticMarkup(
		<ViewOnlyGalleryView
			title={data.event.title}
			startsAt={data.event.starts_at}
			timezone={data.event.timezone}
			status="ready"
			items={data.items}
			participantCount={data.event.participant_count}
			refreshing={false}
			refreshFailed={refreshFailed}
			onRefresh={noop}
		/>
	);
}

describe("view-only gallery", () => {
	it("shows the full-event banner, the grid and a refresh button", () => {
		const html = renderView();
		expect(html).toContain(VIEW_ONLY_BANNER);
		expect(html).toContain("https://x/thumb-p1");
		expect(html).toContain("https://x/thumb-v1");
		expect(html).toContain("Refresh");
		expect(html).toContain("2 items · 12 guests");
	});

	it("has no upload, save, download or delete controls", () => {
		const html = renderView();
		expect(html).not.toContain("Add photos");
		expect(html).not.toContain('type="file"');
		expect(html).not.toContain("Download all");
		expect(html).not.toContain("Save");
		expect(html).not.toContain("Delete");
	});

	it("shows an inline error only after a failed refresh", () => {
		expect(renderView()).not.toContain(REFRESH_ERROR);
		const html = renderView(true);
		expect(html).toContain(REFRESH_ERROR);
		expect(html).toContain("https://x/thumb-p1");
	});

	it("marks thumbnails as not draggable", () => {
		expect(renderView()).toContain('draggable="false"');
	});
});

describe("viewer in view-only mode", () => {
	it("renders no save or delete actions for a photo", () => {
		const html = renderToStaticMarkup(
			<Viewer
				items={data.items}
				index={0}
				thumbUrls={thumbUrlMap(data.items)}
				loadFull={loadFull}
				videoNotice={VIDEO_NOTICE}
				onIndexChange={noop}
				onClose={noop}
			/>
		);
		expect(html).toContain("Ada");
		expect(html).not.toContain("Save");
		expect(html).not.toContain("Delete");
	});

	it("shows the poster and notice instead of playing a video", () => {
		const html = renderToStaticMarkup(
			<Viewer
				items={data.items}
				index={1}
				thumbUrls={thumbUrlMap(data.items)}
				loadFull={loadFull}
				videoNotice={VIDEO_NOTICE}
				onIndexChange={noop}
				onClose={noop}
			/>
		);
		expect(html).toContain(VIDEO_NOTICE);
		expect(html).toContain("https://x/thumb-v1");
		expect(html).not.toContain("<video");
	});

	it("still renders save and delete for a guest who owns the photo", () => {
		const owned = [{ ...data.items[0], uploaded_by_user_id: "me" }];
		const html = renderToStaticMarkup(
			<Viewer
				items={owned}
				index={0}
				thumbUrls={{}}
				loadFull={loadFull}
				profileId="me"
				onIndexChange={noop}
				onClose={noop}
				onSave={noop}
				onDelete={() => Promise.resolve(true)}
			/>
		);
		expect(html).toContain("Save");
		expect(html).toContain("Delete");
	});
});
