export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type EventMemberRole = "host" | "guest";
export type MediaKind = "photo" | "video";
export type MediaStatus = "pending" | "ready" | "failed" | "deleted";
export type SubscriptionEntitlement = "free" | "pro";
export type SubscriptionBillingPeriod = "per_event" | "monthly" | "yearly";
export type ReminderKind = "host_nudge" | "day_after_auto" | "event_expiry_warning";
export type ReminderChannel = "push" | "email" | "sms";
export type Platform = "ios" | "android" | "web";

export interface ProfileRow {
  id: string;
  display_name: string;
  avatar_color: string | null;
  created_at: string;
  updated_at: string;
  last_seen_at: string;
}

export type ProfileInsert = {
  id: string;
  display_name: string;
  avatar_color?: string | null;
  last_seen_at?: string;
};

export type ProfileUpdate = Partial<Omit<ProfileInsert, "id">> & {
  last_seen_at?: string;
};

export interface SubscriptionRow {
  user_id: string;
  entitlement: SubscriptionEntitlement;
  billing_period: SubscriptionBillingPeriod | null;
  expires_at: string | null;
  revenuecat_app_user_id: string | null;
  revenuecat_entitlement_id: string | null;
  platform: Platform | null;
  product_id: string | null;
  last_synced_at: string;
  created_at: string;
  updated_at: string;
}

export type SubscriptionInsert = {
  user_id: string;
  entitlement?: SubscriptionEntitlement;
  billing_period?: SubscriptionBillingPeriod | null;
  expires_at?: string | null;
  revenuecat_app_user_id?: string | null;
  revenuecat_entitlement_id?: string | null;
  platform?: Platform | null;
  product_id?: string | null;
  last_synced_at?: string;
};

export type SubscriptionUpdate = Partial<Omit<SubscriptionInsert, "user_id">>;

export interface SubscriptionLimitsRow {
  entitlement: SubscriptionEntitlement;
  max_guests: number | null;
  max_event_window_hours: number | null;
  max_video_duration_ms: number | null;
  max_active_events: number | null;
  media_ttl_days: number | null;
  allows_full_resolution_download: boolean;
  allows_multi_host: boolean;
  allows_custom_branding: boolean;
  allows_live_slideshow: boolean;
  updated_at: string;
}

export interface EventRow {
  id: string;
  host_id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  timezone: string;
  join_code: string;
  allow_outside_window: boolean;
  cover_image_url: string | null;
  cover_media_id: string | null;
  archived_at: string | null;
  media_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export type EventInsert = {
  id?: string;
  host_id: string;
  title: string;
  description?: string | null;
  starts_at: string;
  ends_at: string;
  timezone?: string;
  join_code: string;
  allow_outside_window?: boolean;
  cover_image_url?: string | null;
  cover_media_id?: string | null;
};

export type EventUpdate = Partial<Omit<EventInsert, "id" | "host_id">> & {
  archived_at?: string | null;
};

export interface EventMemberRow {
  id: string;
  event_id: string;
  user_id: string;
  role: EventMemberRole;
  display_name: string;
  joined_at: string;
  last_uploaded_at: string | null;
  no_photos_to_upload: boolean;
  notifications_opt_in: boolean;
  push_token: string | null;
}

export type EventMemberInsert = {
  id?: string;
  event_id: string;
  user_id: string;
  role?: EventMemberRole;
  display_name: string;
  no_photos_to_upload?: boolean;
  notifications_opt_in?: boolean;
  push_token?: string | null;
};

export type EventMemberUpdate = Partial<
  Omit<EventMemberInsert, "id" | "event_id" | "user_id">
> & {
  last_uploaded_at?: string | null;
};

export interface MediaItemRow {
  id: string;
  event_id: string;
  owner_id: string;
  capture_time: string;
  upload_time: string;
  is_video: boolean;
  kind: MediaKind;
  duration_ms: number | null;
  width: number | null;
  height: number | null;
  storage_path: string;
  thumb_path: string | null;
  size_bytes: number;
  thumb_size_bytes: number;
  content_type: string | null;
  status: MediaStatus;
  hidden_by_host_at: string | null;
  deleted_at: string | null;
  latitude: number | null;
  longitude: number | null;
  outside_window: boolean;
  created_at: string;
  updated_at: string;
}

export type MediaItemInsert = {
  id?: string;
  event_id: string;
  owner_id: string;
  capture_time: string;
  is_video?: boolean;
  duration_ms?: number | null;
  width?: number | null;
  height?: number | null;
  storage_path: string;
  thumb_path?: string | null;
  size_bytes?: number;
  thumb_size_bytes?: number;
  content_type?: string | null;
  status?: MediaStatus;
  outside_window?: boolean;
  latitude?: number | null;
  longitude?: number | null;
};

export type MediaItemUpdate = Partial<
  Omit<MediaItemInsert, "id" | "event_id" | "owner_id">
> & {
  hidden_by_host_at?: string | null;
  deleted_at?: string | null;
};

export interface NudgeRow {
  id: string;
  event_id: string;
  sent_by: string;
  sent_at: string;
  message: string | null;
  recipient_count: number;
}

export type NudgeInsert = {
  id?: string;
  event_id: string;
  sent_by: string;
  message?: string | null;
  recipient_count?: number;
};

export interface ReminderLogRow {
  id: string;
  event_id: string | null;
  user_id: string | null;
  kind: ReminderKind;
  sent_at: string;
  channel: ReminderChannel;
  delivered: boolean;
  error: string | null;
  payload: Json;
}

export interface EventProUnlockRow {
  user_id: string;
  event_id: string;
  unlocked_at: string;
  rc_transaction_id: string | null;
  rc_product_id: string | null;
  platform: Platform | null;
}

export type EventProUnlockInsert = {
  user_id: string;
  event_id: string;
  unlocked_at?: string;
  rc_transaction_id?: string | null;
  rc_product_id?: string | null;
  platform?: Platform | null;
};

export interface EventStorageUsage {
  event_id: string;
  total_bytes: number;
  total_originals_bytes: number;
  total_thumbs_bytes: number;
  item_count: number;
  photo_count: number;
  video_count: number;
}

export interface EventPreview {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  timezone: string;
  cover_image_url: string | null;
  host_display_name: string;
  guest_count: number;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: ProfileInsert;
        Update: ProfileUpdate;
      };
      subscriptions: {
        Row: SubscriptionRow;
        Insert: SubscriptionInsert;
        Update: SubscriptionUpdate;
      };
      subscription_limits: {
        Row: SubscriptionLimitsRow;
        Insert: SubscriptionLimitsRow;
        Update: Partial<SubscriptionLimitsRow>;
      };
      events: {
        Row: EventRow;
        Insert: EventInsert;
        Update: EventUpdate;
      };
      event_members: {
        Row: EventMemberRow;
        Insert: EventMemberInsert;
        Update: EventMemberUpdate;
      };
      media_items: {
        Row: MediaItemRow;
        Insert: MediaItemInsert;
        Update: MediaItemUpdate;
      };
      nudges: {
        Row: NudgeRow;
        Insert: NudgeInsert;
        Update: Partial<NudgeInsert>;
      };
      reminders_log: {
        Row: ReminderLogRow;
        Insert: Omit<ReminderLogRow, "id" | "sent_at"> & { sent_at?: string };
        Update: Partial<ReminderLogRow>;
      };
      event_pro_unlocks: {
        Row: EventProUnlockRow;
        Insert: EventProUnlockInsert;
        Update: Partial<EventProUnlockInsert>;
      };
    };
    Functions: {
      current_entitlement: {
        Args: { target_user_id: string };
        Returns: SubscriptionEntitlement;
      };
      is_event_member: {
        Args: { target_event_id: string };
        Returns: boolean;
      };
      is_event_host: {
        Args: { target_event_id: string };
        Returns: boolean;
      };
      event_storage_usage: {
        Args: { target_event_id: string };
        Returns: EventStorageUsage[];
      };
      can_download_full_resolution: {
        Args: { target_event_id: string };
        Returns: boolean;
      };
      event_is_pro: {
        Args: { target_event_id: string };
        Returns: boolean;
      };
      event_preview_by_code: {
        Args: { p_code: string };
        Returns: EventPreview[];
      };
      rpc_join_event: {
        Args: { p_code: string; p_display_name: string };
        Returns: EventRow;
      };
    };
    Enums: {
      event_member_role: EventMemberRole;
      media_kind: MediaKind;
      media_status: MediaStatus;
      subscription_entitlement: SubscriptionEntitlement;
      subscription_billing_period: SubscriptionBillingPeriod;
      reminder_kind: ReminderKind;
    };
  };
}
