import type { MediaItemWithUser } from "@/types/database";

/**
 * A media item as the feed sees it: either a row from the database or a local
 * item still working its way through the upload queue.
 */
export interface MergedMediaItem extends MediaItemWithUser {
	isPending?: boolean;
	isSkeleton?: boolean;
	localUri?: string;
	localThumbnailUri?: string | null;
	syncStatus?: string;
	retryCount?: number;
	error?: string;
	failureReason?: string;
	startedAt?: string;
	lastAttemptAt?: string;
	finishedAt?: string;
}
