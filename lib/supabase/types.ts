export interface Database {
  public: {
    Tables: {
      sites: {
        Row: {
          id: string;
          name: string;
          domain: string;
          site_key: string;
          timezone: string;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          domain: string;
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
