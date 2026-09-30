import { useCallback, useEffect, useRef, useState } from "react";
import { guestSupabase } from "../supabase";
import {
	applyMediaChange,
	createLoadBuffer,
	type GalleryItem,
	type MediaChange,
	sortNewestFirst,
} from "./mediaList";

type LoadStatus = "loading" | "ready" | "error";

async function fetchMedia(eventId: string): Promise<GalleryItem[]> {
	const { data, error } = await guestSupabase
		.from("media_items")
		.select("*, uploader:users!uploaded_by_user_id(display_name)")
		.eq("event_id", eventId)
		.eq("visibility", "shared")
		.is("deleted_at", null)
		.order("captured_at", { ascending: false });
	if (error) throw error;
	return sortNewestFirst((data ?? []) as GalleryItem[]);
}

async function fetchParticipantCount(eventId: string): Promise<number> {
	const { count, error } = await guestSupabase
		.from("event_participants")
		.select("id", { count: "exact", head: true })
		.eq("event_id", eventId);
	if (error) throw error;
	return count ?? 0;
}

async function fetchUploaderName(userId: string): Promise<string | null> {
	const { data } = await guestSupabase
		.from("users")
		.select("display_name")
		.eq("id", userId)
		.maybeSingle();
	return data?.display_name ?? null;
}

export function useEventMedia(eventId: string, initialParticipantCount: number) {
	const [items, setItems] = useState<GalleryItem[]>([]);
	const [status, setStatus] = useState<LoadStatus>("loading");
	const [participantCount, setParticipantCount] = useState(initialParticipantCount);
	const names = useRef(new Map<string, string>());
	const loadSeq = useRef(0);
	const buffer = useRef(createLoadBuffer());

	const rememberNames = useCallback((list: GalleryItem[]) => {
		for (const entry of list) {
			if (entry.uploaded_by_user_id && entry.uploader?.display_name) {
				names.current.set(entry.uploaded_by_user_id, entry.uploader.display_name);
			}
		}
	}, []);

	const refreshCount = useCallback(() => {
		fetchParticipantCount(eventId)
			.then(setParticipantCount)
			.catch(() => undefined);
	}, [eventId]);

	const load = useCallback(async () => {
		const seq = ++loadSeq.current;
		buffer.current.begin();
		try {
			const fetched = await fetchMedia(eventId);
			if (seq !== loadSeq.current) return;
			rememberNames(fetched);
			const list = buffer.current.finish(fetched);
			setItems(list);
			setStatus("ready");
		} catch {
			if (seq !== loadSeq.current) return;
			buffer.current.cancel();
			setStatus((current) => (current === "ready" ? current : "error"));
		}
		refreshCount();
	}, [eventId, rememberNames, refreshCount]);

	const apply = useCallback((change: MediaChange) => {
		buffer.current.record(change);
		setItems((current) => applyMediaChange(current, change));
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	useEffect(() => {
		let subscribedOnce = false;
		const withUploader = async (row: GalleryItem): Promise<GalleryItem> => {
			const userId = row.uploaded_by_user_id;
			if (!userId) return { ...row, uploader: null };
			const known = names.current.get(userId);
			if (known) return { ...row, uploader: { display_name: known } };
			const fetched = await fetchUploaderName(userId);
			if (fetched) names.current.set(userId, fetched);
			return { ...row, uploader: fetched ? { display_name: fetched } : null };
		};
		const mediaChannel = guestSupabase
			.channel(`media_items:${eventId}`)
			.on(
				"postgres_changes",
				{
					event: "INSERT",
					schema: "public",
					table: "media_items",
					filter: `event_id=eq.${eventId}`,
				},
				(payload) => {
					void withUploader(payload.new as GalleryItem).then((row) =>
						apply({ type: "INSERT", row })
					);
				}
			)
			.on(
				"postgres_changes",
				{
					event: "UPDATE",
					schema: "public",
					table: "media_items",
					filter: `event_id=eq.${eventId}`,
				},
				(payload) => {
					void withUploader(payload.new as GalleryItem).then((row) =>
						apply({ type: "UPDATE", row })
					);
				}
			)
			.on(
				"postgres_changes",
				{ event: "DELETE", schema: "public", table: "media_items" },
				(payload) => {
					const id = (payload.old as { id?: string }).id;
					if (id) apply({ type: "DELETE", id });
				}
			)
			.subscribe((state) => {
				if (state !== "SUBSCRIBED") return;
				if (subscribedOnce) void load();
				subscribedOnce = true;
			});
		const participantChannel = guestSupabase
			.channel(`participants:${eventId}`)
			.on(
				"postgres_changes",
				{
					event: "*",
					schema: "public",
					table: "event_participants",
					filter: `event_id=eq.${eventId}`,
				},
				() => refreshCount()
			)
			.subscribe();
		return () => {
			void guestSupabase.removeChannel(mediaChannel);
			void guestSupabase.removeChannel(participantChannel);
		};
	}, [eventId, apply, load, refreshCount]);

	useEffect(() => {
		const onVisible = () => {
			if (document.visibilityState === "visible") void load();
		};
		document.addEventListener("visibilitychange", onVisible);
		return () => document.removeEventListener("visibilitychange", onVisible);
	}, [load]);

	const remove = useCallback(
		async (target: GalleryItem): Promise<boolean> => {
			apply({ type: "DELETE", id: target.id });
			try {
				const { error: storageError } = await guestSupabase.storage
					.from("event-photos")
					.remove([target.storage_path]);
				if (storageError) throw storageError;
				if (target.thumbnail_path) {
					const { error: thumbError } = await guestSupabase.storage
						.from("thumbnails")
						.remove([target.thumbnail_path]);
					if (thumbError) throw thumbError;
				}
				const { data: deleted, error: rowError } = await guestSupabase
					.from("media_items")
					.delete()
					.eq("id", target.id)
					.select("id");
				if (rowError) throw rowError;
				if (!deleted || deleted.length === 0) throw new Error("Media item was not deleted");
				return true;
			} catch {
				apply({ type: "INSERT", row: target });
				return false;
			}
		},
		[apply]
	);

	return { items, status, participantCount, reload: load, remove };
}
