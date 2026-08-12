export interface Database {
  public: {
    Tables: {
      sites: {
        Row: {
          id: string;
          name: string;
          domain: string | null;
          site_key: string;
          timezone: string;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          domain?: string | null;
          site_key?: string;
          timezone?: string;
          active?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["sites"]["Insert"]>;
        Relationships: [];
      };
      site_conversion_events: {
        Row: {
          site_id: string;
          event_name: string;
          created_at: string;
        };
        Insert: {
          site_id: string;
          event_name: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["site_conversion_events"]["Insert"]>;
        Relationships: [];
      };
      sessions: {
        Row: {
          id: string;
          site_id: string;
          visitor_hash: string;
          started_at: string;
          last_seen_at: string;
          entry_pathname: string | null;
          referrer_raw: string | null;
          referrer_domain: string | null;
          utm_source: string | null;
          utm_medium: string | null;
          utm_campaign: string | null;
          utm_content: string | null;
          utm_term: string | null;
          traffic_source: string;
          device_type: string | null;
          browser: string | null;
          os: string | null;
          current_pathname: string | null;
          is_bot: boolean;
        };
        Insert: Partial<Database["public"]["Tables"]["sessions"]["Row"]> & {
          site_id: string;
          visitor_hash: string;
        };
        Update: Partial<Database["public"]["Tables"]["sessions"]["Row"]>;
        Relationships: [];
      };
      page_views: {
        Row: {
          id: number;
          site_id: string;
          session_id: string;
          visitor_hash: string;
          url: string;
          pathname: string;
          page_title: string | null;
          referrer_raw: string | null;
          query_params: Record<string, string>;
          utm_source: string | null;
          utm_medium: string | null;
          utm_campaign: string | null;
          utm_content: string | null;
          utm_term: string | null;
          traffic_source: string;
          is_landing: boolean;
          occurred_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["page_views"]["Row"]> & {
          site_id: string;
          session_id: string;
          visitor_hash: string;
          url: string;
          pathname: string;
        };
        Update: Partial<Database["public"]["Tables"]["page_views"]["Row"]>;
        Relationships: [];
      };
      events: {
        Row: {
          id: number;
          site_id: string;
          session_id: string;
          visitor_hash: string;
          event_name: string;
          properties: Record<string, unknown>;
          pathname: string | null;
          traffic_source: string;
          is_conversion: boolean;
          occurred_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["events"]["Row"]> & {
          site_id: string;
          session_id: string;
          visitor_hash: string;
          event_name: string;
        };
        Update: Partial<Database["public"]["Tables"]["events"]["Row"]>;
        Relationships: [];
      };
      rate_limit_counters: {
        Row: {
          site_id: string;
          minute_bucket: string;
          request_count: number;
        };
        Insert: {
          site_id: string;
          minute_bucket: string;
          request_count?: number;
        };
        Update: Partial<Database["public"]["Tables"]["rate_limit_counters"]["Insert"]>;
        Relationships: [];
      };
      daily_salts: {
        Row: {
          day: string;
          salt: string;
        };
        Insert: {
          day: string;
          salt?: string;
        };
        Update: Partial<Database["public"]["Tables"]["daily_salts"]["Insert"]>;
        Relationships: [];
      };
      site_modules: {
        Row: {
          site_id: string;
          module_key: string;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          site_id: string;
          module_key: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["site_modules"]["Insert"]>;
        Relationships: [];
      };
      podcasts: {
        Row: {
          id: string;
          site_id: string;
          name: string;
          description: string | null;
          artwork_url: string | null;
          website_url: string | null;
          rss_url: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          name: string;
          description?: string | null;
          artwork_url?: string | null;
          website_url?: string | null;
          rss_url?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["podcasts"]["Insert"]>;
        Relationships: [];
      };
      episodes: {
        Row: {
          id: string;
          podcast_id: string;
          title: string;
          episode_number: number | null;
          description: string | null;
          published_at: string | null;
          duration_seconds: number | null;
          artwork_url: string | null;
          page_url: string | null;
          audio_url: string | null;
          spotify_url: string | null;
          apple_podcasts_url: string | null;
          youtube_url: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          podcast_id: string;
          title: string;
          episode_number?: number | null;
          description?: string | null;
          published_at?: string | null;
          duration_seconds?: number | null;
          artwork_url?: string | null;
          page_url?: string | null;
          audio_url?: string | null;
          spotify_url?: string | null;
          apple_podcasts_url?: string | null;
          youtube_url?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["episodes"]["Insert"]>;
        Relationships: [];
      };
      podcast_events: {
        Row: {
          id: number;
          site_id: string;
          podcast_id: string;
          episode_id: string | null;
          session_id: string;
          visitor_hash: string;
          event_name: string;
          properties: Record<string, unknown>;
          traffic_source: string;
          occurred_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["podcast_events"]["Row"]> & {
          site_id: string;
          podcast_id: string;
          session_id: string;
          visitor_hash: string;
          event_name: string;
        };
        Update: Partial<Database["public"]["Tables"]["podcast_events"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      increment_rate_limit: {
        Args: { p_site_id: string; p_minute_bucket: string };
        Returns: number;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
