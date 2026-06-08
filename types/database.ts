export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type EventStatus = "scheduled" | "live" | "ended" | "expired";
export type ParticipantRole = "host" | "guest";
export type MediaType = "photo" | "video";
export type MediaVisibility = "shared" | "hidden" | "deleted";
export type VideoStatus = "pending" | "processing" | "ready" | "failed";
export type SubscriptionTier = "free" | "pro";
export type SubscriptionPlatform = "ios" | "android" | "web";
export type TelemetryEventKind = "error" | "trace";
export type TelemetrySeverity = "debug" | "info" | "warn" | "error" | "fatal";

export interface Database {
	public: {
		Tables: {
			users: {
				Row: {
					id: string;
					auth_user_id: string | null;
					display_name: string;
					subscription_tier: SubscriptionTier;
					created_at: string;
					last_seen_at: string;
				};
				Insert: {
					id?: string;
					auth_user_id?: string | null;
					display_name: string;
					subscription_tier?: SubscriptionTier;
					created_at?: string;
					last_seen_at?: string;
				};
				Update: {
					id?: string;
					auth_user_id?: string | null;
					display_name?: string;
					subscription_tier?: SubscriptionTier;
					created_at?: string;
					last_seen_at?: string;
				};
				Relationships: [];
			};
			subscription_plans: {
				Row: {
					id: string;
					display_name: string;
					description: string | null;
					is_active: boolean;
					sort_order: number;
					revenuecat_entitlement_identifier: string | null;
					revenuecat_offering_identifier: string | null;
					capabilities: Json;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id: string;
					display_name: string;
					description?: string | null;
					is_active?: boolean;
					sort_order?: number;
					revenuecat_entitlement_identifier?: string | null;
					revenuecat_offering_identifier?: string | null;
					capabilities?: Json;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					display_name?: string;
					description?: string | null;
					is_active?: boolean;
					sort_order?: number;
					revenuecat_entitlement_identifier?: string | null;
					revenuecat_offering_identifier?: string | null;
					capabilities?: Json;
					created_at?: string;
					updated_at?: string;
				};
				Relationships: [];
			};
			telemetry_events: {
				Row: {
					id: string;
					created_at: string;
					occurred_at: string;
					event_kind: TelemetryEventKind;
					severity: TelemetrySeverity;
					name: string;
					message: string | null;
					stack_trace: string | null;
					source: string | null;
					platform: SubscriptionPlatform;
					app_version: string | null;
					build_number: string | null;
					session_id: string | null;
					trace_id: string | null;
					span_id: string | null;
					parent_span_id: string | null;
					route: string | null;
					screen: string | null;
					actor_user_id: string;
					event_id: string | null;
					metadata: Json;
				};
				Insert: {
					id?: string;
					created_at?: string;
					occurred_at?: string;
					event_kind: TelemetryEventKind;
					severity?: TelemetrySeverity;
					name: string;
					message?: string | null;
					stack_trace?: string | null;
					source?: string | null;
					platform: SubscriptionPlatform;
					app_version?: string | null;
					build_number?: string | null;
					session_id?: string | null;
					trace_id?: string | null;
					span_id?: string | null;
					parent_span_id?: string | null;
					route?: string | null;
					screen?: string | null;
					actor_user_id: string;
					event_id?: string | null;
					metadata?: Json;
				};
				Update: {
					id?: string;
					created_at?: string;
					occurred_at?: string;
					event_kind?: TelemetryEventKind;
					severity?: TelemetrySeverity;
					name?: string;
					message?: string | null;
					stack_trace?: string | null;
					source?: string | null;
					platform?: SubscriptionPlatform;
					app_version?: string | null;
					build_number?: string | null;
					session_id?: string | null;
					trace_id?: string | null;
					span_id?: string | null;
					parent_span_id?: string | null;
					route?: string | null;
					screen?: string | null;
					actor_user_id?: string;
					event_id?: string | null;
					metadata?: Json;
				};
				Relationships: [
					{
						foreignKeyName: "telemetry_events_actor_user_id_fkey";
						columns: ["actor_user_id"];
						referencedRelation: "users";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "telemetry_events_event_id_fkey";
						columns: ["event_id"];
						referencedRelation: "events";
						referencedColumns: ["id"];
					},
				];
			};
			user_private_data: {
				Row: {
					user_id: string;
					device_id: string | null;
					push_token: string | null;
					subscription_expires_at: string | null;
					subscription_platform: SubscriptionPlatform | null;
					subscription_id: string | null;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					user_id: string;
					device_id?: string | null;
					push_token?: string | null;
					subscription_expires_at?: string | null;
					subscription_platform?: SubscriptionPlatform | null;
					subscription_id?: string | null;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					user_id?: string;
					device_id?: string | null;
					push_token?: string | null;
					subscription_expires_at?: string | null;
					subscription_platform?: SubscriptionPlatform | null;
					subscription_id?: string | null;
					created_at?: string;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: "user_private_data_user_id_fkey";
						columns: ["user_id"];
						referencedRelation: "users";
						referencedColumns: ["id"];
					},
				];
			};
			events: {
				Row: {
					id: string;
					title: string;
					starts_at: string;
					ends_at: string;
					timezone: string;
					join_code: string;
					created_by_user_id: string | null;
					status: EventStatus;
					expires_at: string;
					created_at: string;
					updated_at: string;
					last_host_reminder_at: string | null;
				};
				Insert: {
					id?: string;
					title: string;
					starts_at: string;
					ends_at: string;
					timezone?: string;
					join_code: string;
					created_by_user_id?: string | null;
					status?: EventStatus;
					expires_at: string;
					created_at?: string;
					updated_at?: string;
					last_host_reminder_at?: string | null;
				};
				Update: {
					id?: string;
					title?: string;
					starts_at?: string;
					ends_at?: string;
					timezone?: string;
					join_code?: string;
					created_by_user_id?: string | null;
					status?: EventStatus;
					expires_at?: string;
					created_at?: string;
					updated_at?: string;
					last_host_reminder_at?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: "events_created_by_user_id_fkey";
						columns: ["created_by_user_id"];
						referencedRelation: "users";
						referencedColumns: ["id"];
					},
				];
			};
			event_participants: {
				Row: {
					id: string;
					event_id: string;
					user_id: string;
					role: ParticipantRole;
					nickname: string | null;
					joined_at: string;
					no_photos_to_upload: boolean;
					last_reminder_sent_at: string | null;
				};
				Insert: {
					id?: string;
					event_id: string;
					user_id: string;
					role?: ParticipantRole;
					nickname?: string | null;
					joined_at?: string;
					no_photos_to_upload?: boolean;
					last_reminder_sent_at?: string | null;
				};
				Update: {
					id?: string;
					event_id?: string;
					user_id?: string;
					role?: ParticipantRole;
					nickname?: string | null;
					joined_at?: string;
					no_photos_to_upload?: boolean;
					last_reminder_sent_at?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: "event_participants_event_id_fkey";
						columns: ["event_id"];
						referencedRelation: "events";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "event_participants_user_id_fkey";
						columns: ["user_id"];
						referencedRelation: "users";
						referencedColumns: ["id"];
					},
				];
			};
			media_items: {
				Row: {
					id: string;
					event_id: string;
					uploaded_by_user_id: string | null;
					captured_at: string;
					uploaded_at: string;
					media_type: MediaType;
					width: number | null;
					height: number | null;
					duration_milliseconds: number | null;
					file_size_bytes: number | null;
					storage_path: string;
					thumbnail_path: string | null;
					blurhash: string | null;
					hls_path: string | null;
					playback_hls_path: string | null;
					rendition_path: string | null;
					video_status: VideoStatus;
					video_processed_at: string | null;
					visibility: MediaVisibility;
					deleted_at: string | null;
					latitude: number | null;
					longitude: number | null;
				};
				Insert: {
					id?: string;
					event_id: string;
					uploaded_by_user_id?: string | null;
					captured_at: string;
					uploaded_at?: string;
					media_type?: MediaType;
					width?: number | null;
					height?: number | null;
					duration_milliseconds?: number | null;
					file_size_bytes?: number | null;
					storage_path: string;
					thumbnail_path?: string | null;
					blurhash?: string | null;
					hls_path?: string | null;
					playback_hls_path?: string | null;
					rendition_path?: string | null;
					video_status?: VideoStatus;
					video_processed_at?: string | null;
					visibility?: MediaVisibility;
					deleted_at?: string | null;
					latitude?: number | null;
					longitude?: number | null;
				};
				Update: {
					id?: string;
					event_id?: string;
					uploaded_by_user_id?: string | null;
					captured_at?: string;
					uploaded_at?: string;
					media_type?: MediaType;
					width?: number | null;
					height?: number | null;
					duration_milliseconds?: number | null;
					file_size_bytes?: number | null;
					storage_path?: string;
					thumbnail_path?: string | null;
					blurhash?: string | null;
					hls_path?: string | null;
					playback_hls_path?: string | null;
					rendition_path?: string | null;
					video_status?: VideoStatus;
					video_processed_at?: string | null;
					visibility?: MediaVisibility;
					deleted_at?: string | null;
					latitude?: number | null;
					longitude?: number | null;
				};
				Relationships: [
					{
						foreignKeyName: "media_items_event_id_fkey";
						columns: ["event_id"];
						referencedRelation: "events";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "media_items_uploaded_by_user_id_fkey";
						columns: ["uploaded_by_user_id"];
						referencedRelation: "users";
						referencedColumns: ["id"];
					},
				];
			};
		};
		Views: {};
		Functions: {
			is_telemetry_admin: {
				Args: Record<string, never>;
				Returns: boolean;
			};
			get_event_preview: {
				Args: {
					join_code_input: string;
				};
				Returns: {
					id: string;
					title: string;
					starts_at: string;
					ends_at: string;
					timezone: string;
					join_code: string;
					created_by_user_id: string | null;
					status: EventStatus;
					expires_at: string;
					created_at: string;
					updated_at: string;
					participant_count: number;
					host_plan_id: string;
					host_is_pro: boolean;
				}[];
			};
		};
		Enums: {
			telemetry_event_kind: TelemetryEventKind;
			telemetry_severity: TelemetrySeverity;
		};
		CompositeTypes: {};
	};
}

export type User = Database["public"]["Tables"]["users"]["Row"];
export type SubscriptionPlan = Database["public"]["Tables"]["subscription_plans"]["Row"];
export type UserPrivateData = Database["public"]["Tables"]["user_private_data"]["Row"];
export type Event = Database["public"]["Tables"]["events"]["Row"];
export type EventParticipant = Database["public"]["Tables"]["event_participants"]["Row"];
export type MediaItem = Database["public"]["Tables"]["media_items"]["Row"];

export type UserInsert = Database["public"]["Tables"]["users"]["Insert"];
export type SubscriptionPlanInsert = Database["public"]["Tables"]["subscription_plans"]["Insert"];
export type UserPrivateDataInsert = Database["public"]["Tables"]["user_private_data"]["Insert"];
export type EventInsert = Database["public"]["Tables"]["events"]["Insert"];
export type EventParticipantInsert = Database["public"]["Tables"]["event_participants"]["Insert"];
export type MediaItemInsert = Database["public"]["Tables"]["media_items"]["Insert"];

export type UserUpdate = Database["public"]["Tables"]["users"]["Update"];
export type SubscriptionPlanUpdate = Database["public"]["Tables"]["subscription_plans"]["Update"];
export type UserPrivateDataUpdate = Database["public"]["Tables"]["user_private_data"]["Update"];
export type EventUpdate = Database["public"]["Tables"]["events"]["Update"];
export type EventParticipantUpdate = Database["public"]["Tables"]["event_participants"]["Update"];
export type MediaItemUpdate = Database["public"]["Tables"]["media_items"]["Update"];

export interface MediaItemWithUser extends MediaItem {
	uploader?: {
		display_name: string;
	} | null;
}

export interface EventPreviewResult {
	id: string;
	title: string;
	starts_at: string;
	ends_at: string;
	timezone: string;
	join_code: string;
	created_by_user_id: string | null;
	status: EventStatus;
	expires_at: string;
	created_at: string;
	updated_at: string;
	last_host_reminder_at: string | null;
	participant_count: number;
	host_plan_id: string;
	host_is_pro: boolean;
}
