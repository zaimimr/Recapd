export type GalleryMediaStatus = "pending" | "ready" | "failed" | "deleted";

export type GalleryMediaItem = {
	id: string;
	event_id: string;
	owner_id: string;
	capture_time: string;
	upload_time: string;
	is_video: boolean;
	duration_ms: number | null;
	storage_path: string;
	thumb_path: string | null;
	width: number | null;
	height: number | null;
	status: GalleryMediaStatus;
	hidden_by_host_at: string | null;
	deleted_at: string | null;
};

export type Moment = {
	id: string;
	event_id: string;
	title: string;
	starts_at: string;
};
