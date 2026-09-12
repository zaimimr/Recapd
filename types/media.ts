import type { MediaItemWithUser } from "@/types/database";

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
