export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type EventStatus = 'scheduled' | 'live' | 'ended' | 'expired';
export type ParticipantRole = 'host' | 'guest';
export type MediaType = 'photo' | 'video';
export type MediaVisibility = 'shared' | 'hidden' | 'deleted';

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          display_name: string;
          device_id: string | null;
          push_token: string | null;
          created_at: string;
          last_seen_at: string;
        };
        Insert: {
          id?: string;
          display_name: string;
          device_id?: string | null;
          push_token?: string | null;
          created_at?: string;
          last_seen_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string;
          device_id?: string | null;
          push_token?: string | null;
          created_at?: string;
          last_seen_at?: string;
        };
        Relationships: [];
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
        };
        Relationships: [
          {
            foreignKeyName: 'events_created_by_user_id_fkey';
            columns: ['created_by_user_id'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
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
        };
        Insert: {
          id?: string;
          event_id: string;
          user_id: string;
          role?: ParticipantRole;
          nickname?: string | null;
          joined_at?: string;
        };
        Update: {
          id?: string;
          event_id?: string;
          user_id?: string;
          role?: ParticipantRole;
          nickname?: string | null;
          joined_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'event_participants_event_id_fkey';
            columns: ['event_id'];
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_participants_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
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
          duration_seconds: number | null;
          file_size_bytes: number | null;
          storage_path: string;
          thumbnail_path: string | null;
          visibility: MediaVisibility;
          deleted_at: string | null;
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
          duration_seconds?: number | null;
          file_size_bytes?: number | null;
          storage_path: string;
          thumbnail_path?: string | null;
          visibility?: MediaVisibility;
          deleted_at?: string | null;
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
          duration_seconds?: number | null;
          file_size_bytes?: number | null;
          storage_path?: string;
          thumbnail_path?: string | null;
          visibility?: MediaVisibility;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'media_items_event_id_fkey';
            columns: ['event_id'];
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'media_items_uploaded_by_user_id_fkey';
            columns: ['uploaded_by_user_id'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
    };
    Views: {};
    Functions: {};
    Enums: {};
    CompositeTypes: {};
  };
}

export type User = Database['public']['Tables']['users']['Row'];
export type Event = Database['public']['Tables']['events']['Row'];
export type EventParticipant = Database['public']['Tables']['event_participants']['Row'];
export type MediaItem = Database['public']['Tables']['media_items']['Row'];

export type UserInsert = Database['public']['Tables']['users']['Insert'];
export type EventInsert = Database['public']['Tables']['events']['Insert'];
export type EventParticipantInsert = Database['public']['Tables']['event_participants']['Insert'];
export type MediaItemInsert = Database['public']['Tables']['media_items']['Insert'];

export type UserUpdate = Database['public']['Tables']['users']['Update'];
export type EventUpdate = Database['public']['Tables']['events']['Update'];
export type EventParticipantUpdate = Database['public']['Tables']['event_participants']['Update'];
export type MediaItemUpdate = Database['public']['Tables']['media_items']['Update'];
