import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { GalleryMediaItem, Moment } from "@/types/media";

type State = {
	items: GalleryMediaItem[];
	moments: Moment[];
	loading: boolean;
	error: string | null;
};

const MEDIA_COLUMNS =
	"id,event_id,owner_id,capture_time,upload_time,is_video,duration_ms,storage_path,thumb_path,width,height,status,hidden_by_host_at";

export function useEventGalleryData(eventId: string | null | undefined) {
	const [state, setState] = useState<State>({ items: [], moments: [], loading: true, error: null });

	const load = useCallback(async () => {
		if (!eventId) return;
		setState((prev) => ({ ...prev, loading: true, error: null }));
		const itemsResult = await supabase
			.from("media_items")
			.select(MEDIA_COLUMNS)
			.eq("event_id", eventId)
			.is("hidden_by_host_at", null)
			.eq("status", "ready")
			.order("capture_time", { ascending: true });
		setState({
			items: (itemsResult.data ?? []) as GalleryMediaItem[],
			moments: [],
			loading: false,
			error: itemsResult.error?.message ?? null,
		});
	}, [eventId]);

	useEffect(() => {
		void load();
	}, [load]);

	useEffect(() => {
		if (!eventId) return;
		const channel = supabase
			.channel(`media-${eventId}`)
			.on(
				"postgres_changes",
				{ event: "*", schema: "public", table: "media_items", filter: `event_id=eq.${eventId}` },
				() => {
					void load();
				}
			)
			.subscribe();
		return () => {
			void supabase.removeChannel(channel);
		};
	}, [eventId, load]);

	return { ...state, refresh: load };
}
