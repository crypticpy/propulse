export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      accessories: {
        Row: {
          bands: string[]
          category: string
          created_at: string
          id: string
          manufacturer: string | null
          model: string
          notes: string | null
          specs: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bands?: string[]
          category: string
          created_at?: string
          id: string
          manufacturer?: string | null
          model: string
          notes?: string | null
          specs?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bands?: string[]
          category?: string
          created_at?: string
          id?: string
          manufacturer?: string | null
          model?: string
          notes?: string | null
          specs?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accessories_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      achievements: {
        Row: {
          badge_id: string
          created_at: string
          earned_at: string | null
          id: string
          progress: number
          tier: string
          updated_at: string
          user_id: string
        }
        Insert: {
          badge_id: string
          created_at?: string
          earned_at?: string | null
          id: string
          progress?: number
          tier?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          badge_id?: string
          created_at?: string
          earned_at?: string | null
          id?: string
          progress?: number
          tier?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "achievements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_feed: {
        Row: {
          created_at: string
          event_data: Json
          event_type: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_data: Json
          event_type: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_data?: Json
          event_type?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_feed_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_rules: {
        Row: {
          conditions: Json
          created_at: string
          enabled: boolean
          id: string
          name: string
          notification: Json
          user_id: string
        }
        Insert: {
          conditions: Json
          created_at?: string
          enabled?: boolean
          id: string
          name: string
          notification: Json
          user_id: string
        }
        Update: {
          conditions?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          name?: string
          notification?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_rules_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      antennas: {
        Row: {
          azimuth: number | null
          bands: string[]
          beamwidth_deg: number | null
          created_at: string
          feedpoint_impedance: number | null
          front_to_back_db: number | null
          gain_dbi: Json | null
          height_agl: number | null
          id: string
          installation_date: string | null
          is_portable: boolean
          is_rotatable: boolean
          manufacturer: string | null
          mounting: string | null
          name: string
          notes: string | null
          polarization: string | null
          radial_count: number | null
          radial_length_m: number | null
          swr_data: Json | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          azimuth?: number | null
          bands?: string[]
          beamwidth_deg?: number | null
          created_at?: string
          feedpoint_impedance?: number | null
          front_to_back_db?: number | null
          gain_dbi?: Json | null
          height_agl?: number | null
          id: string
          installation_date?: string | null
          is_portable?: boolean
          is_rotatable?: boolean
          manufacturer?: string | null
          mounting?: string | null
          name: string
          notes?: string | null
          polarization?: string | null
          radial_count?: number | null
          radial_length_m?: number | null
          swr_data?: Json | null
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          azimuth?: number | null
          bands?: string[]
          beamwidth_deg?: number | null
          created_at?: string
          feedpoint_impedance?: number | null
          front_to_back_db?: number | null
          gain_dbi?: Json | null
          height_agl?: number | null
          id?: string
          installation_date?: string | null
          is_portable?: boolean
          is_rotatable?: boolean
          manufacturer?: string | null
          mounting?: string | null
          name?: string
          notes?: string | null
          polarization?: string | null
          radial_count?: number | null
          radial_length_m?: number | null
          swr_data?: Json | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "antennas_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contest_qsos: {
        Row: {
          band: string
          callsign: string
          created_at: string
          exchange_received: string
          exchange_sent: string
          frequency_khz: number | null
          id: string
          is_dupe: boolean
          is_multiplier: boolean
          mode: string
          multiplier_value: string | null
          points: number
          rst_received: string
          rst_sent: string
          serial_received: number | null
          serial_sent: number | null
          session_id: string
          timestamp: string
          user_id: string
        }
        Insert: {
          band: string
          callsign: string
          created_at?: string
          exchange_received: string
          exchange_sent: string
          frequency_khz?: number | null
          id: string
          is_dupe?: boolean
          is_multiplier?: boolean
          mode: string
          multiplier_value?: string | null
          points?: number
          rst_received: string
          rst_sent: string
          serial_received?: number | null
          serial_sent?: number | null
          session_id: string
          timestamp: string
          user_id: string
        }
        Update: {
          band?: string
          callsign?: string
          created_at?: string
          exchange_received?: string
          exchange_sent?: string
          frequency_khz?: number | null
          id?: string
          is_dupe?: boolean
          is_multiplier?: boolean
          mode?: string
          multiplier_value?: string | null
          points?: number
          rst_received?: string
          rst_sent?: string
          serial_received?: number | null
          serial_sent?: number | null
          session_id?: string
          timestamp?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contest_qsos_session_fk"
            columns: ["user_id", "session_id"]
            isOneToOne: false
            referencedRelation: "contest_sessions"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "contest_qsos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contest_sessions: {
        Row: {
          cabrillo_meta: Json | null
          categories: Json
          contest_id: string
          created_at: string
          current_serial: number
          end_time: string | null
          id: string
          is_active: boolean
          my_exchange: string
          start_time: string
          total_multipliers: number
          total_points: number
          total_score: number
          updated_at: string
          user_id: string
        }
        Insert: {
          cabrillo_meta?: Json | null
          categories: Json
          contest_id: string
          created_at?: string
          current_serial?: number
          end_time?: string | null
          id: string
          is_active?: boolean
          my_exchange: string
          start_time: string
          total_multipliers?: number
          total_points?: number
          total_score?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          cabrillo_meta?: Json | null
          categories?: Json
          contest_id?: string
          created_at?: string
          current_serial?: number
          end_time?: string | null
          id?: string
          is_active?: boolean
          my_exchange?: string
          start_time?: string
          total_multipliers?: number
          total_points?: number
          total_score?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contest_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feedlines: {
        Row: {
          condition: string | null
          connectors: Json | null
          created_at: string
          id: string
          installation_date: string | null
          length_meters: number
          manufacturer: string | null
          notes: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          condition?: string | null
          connectors?: Json | null
          created_at?: string
          id: string
          installation_date?: string | null
          length_meters: number
          manufacturer?: string | null
          notes?: string | null
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          condition?: string | null
          connectors?: Json | null
          created_at?: string
          id?: string
          installation_date?: string | null
          length_meters?: number
          manufacturer?: string | null
          notes?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedlines_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      log_entries: {
        Row: {
          band: string | null
          callsign: string
          created_at: string
          date: string
          deleted_at: string | null
          eqsl_status: boolean | null
          frequency: number | null
          grid: string | null
          guest_session_id: string | null
          id: string
          is_guest_entry: boolean
          lotw_status: boolean | null
          mode: string | null
          name: string | null
          notes: string | null
          operator_callsign: string | null
          qsl_rcvd: string | null
          qsl_sent: string | null
          qth: string | null
          rst_rcvd: string | null
          rst_sent: string | null
          station_callsign: string | null
          time_off: string | null
          time_on: string
          updated_at: string
          user_id: string
        }
        Insert: {
          band?: string | null
          callsign: string
          created_at?: string
          date: string
          deleted_at?: string | null
          eqsl_status?: boolean | null
          frequency?: number | null
          grid?: string | null
          guest_session_id?: string | null
          id: string
          is_guest_entry?: boolean
          lotw_status?: boolean | null
          mode?: string | null
          name?: string | null
          notes?: string | null
          operator_callsign?: string | null
          qsl_rcvd?: string | null
          qsl_sent?: string | null
          qth?: string | null
          rst_rcvd?: string | null
          rst_sent?: string | null
          station_callsign?: string | null
          time_off?: string | null
          time_on: string
          updated_at?: string
          user_id: string
        }
        Update: {
          band?: string | null
          callsign?: string
          created_at?: string
          date?: string
          deleted_at?: string | null
          eqsl_status?: boolean | null
          frequency?: number | null
          grid?: string | null
          guest_session_id?: string | null
          id?: string
          is_guest_entry?: boolean
          lotw_status?: boolean | null
          mode?: string | null
          name?: string | null
          notes?: string | null
          operator_callsign?: string | null
          qsl_rcvd?: string | null
          qsl_sent?: string | null
          qth?: string | null
          rst_rcvd?: string | null
          rst_sent?: string | null
          station_callsign?: string | null
          time_off?: string | null
          time_on?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "log_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      map_pins: {
        Row: {
          category: string
          color: string | null
          created_at: string
          expires_at: string | null
          grid: string
          id: string
          lat: number
          lon: number
          name: string | null
          notes: string | null
          user_id: string
        }
        Insert: {
          category?: string
          color?: string | null
          created_at?: string
          expires_at?: string | null
          grid: string
          id: string
          lat: number
          lon: number
          name?: string | null
          notes?: string | null
          user_id: string
        }
        Update: {
          category?: string
          color?: string | null
          created_at?: string
          expires_at?: string | null
          grid?: string
          id?: string
          lat?: number
          lon?: number
          name?: string | null
          notes?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "map_pins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active_location_id: string | null
          avatar_url: string | null
          bio: string | null
          callsign: string | null
          callsign_verified: boolean
          created_at: string
          grid: string | null
          home_location_id: string | null
          id: string
          last_active_at: string | null
          lat: number | null
          license: Json | null
          lon: number | null
          operator_name: string | null
          social_links: Json | null
          stats_cache: Json | null
          timezone: string | null
          updated_at: string
          visibility_settings: Json
        }
        Insert: {
          active_location_id?: string | null
          avatar_url?: string | null
          bio?: string | null
          callsign?: string | null
          callsign_verified?: boolean
          created_at?: string
          grid?: string | null
          home_location_id?: string | null
          id: string
          last_active_at?: string | null
          lat?: number | null
          license?: Json | null
          lon?: number | null
          operator_name?: string | null
          social_links?: Json | null
          stats_cache?: Json | null
          timezone?: string | null
          updated_at?: string
          visibility_settings?: Json
        }
        Update: {
          active_location_id?: string | null
          avatar_url?: string | null
          bio?: string | null
          callsign?: string | null
          callsign_verified?: boolean
          created_at?: string
          grid?: string | null
          home_location_id?: string | null
          id?: string
          last_active_at?: string | null
          lat?: number | null
          license?: Json | null
          lon?: number | null
          operator_name?: string | null
          social_links?: Json | null
          stats_cache?: Json | null
          timezone?: string | null
          updated_at?: string
          visibility_settings?: Json
        }
        Relationships: []
      }
      saved_locations: {
        Row: {
          activation_ref: string | null
          created_at: string
          grid: string
          id: string
          lat: number
          lon: number
          name: string
          timezone: string | null
          type: string
          user_id: string
        }
        Insert: {
          activation_ref?: string | null
          created_at?: string
          grid: string
          id: string
          lat: number
          lon: number
          name: string
          timezone?: string | null
          type?: string
          user_id: string
        }
        Update: {
          activation_ref?: string | null
          created_at?: string
          grid?: string
          id?: string
          lat?: number
          lon?: number
          name?: string
          timezone?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_locations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_targets: {
        Row: {
          callsign: string
          created_at: string
          grid: string | null
          id: string
          lat: number | null
          lon: number | null
          name: string | null
          user_id: string
        }
        Insert: {
          callsign: string
          created_at?: string
          grid?: string | null
          id: string
          lat?: number | null
          lon?: number | null
          name?: string | null
          user_id: string
        }
        Update: {
          callsign?: string
          created_at?: string
          grid?: string | null
          id?: string
          lat?: number | null
          lon?: number | null
          name?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_targets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      skeds: {
        Row: {
          created_at: string
          date_range: Json
          id: string
          notes: string | null
          preferred_band: string
          preferred_mode: string
          recommended_windows: Json
          reminder_fired: boolean
          status: string
          target_callsign: string
          target_lat: number | null
          target_lon: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          date_range: Json
          id: string
          notes?: string | null
          preferred_band: string
          preferred_mode: string
          recommended_windows?: Json
          reminder_fired?: boolean
          status?: string
          target_callsign: string
          target_lat?: number | null
          target_lon?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          date_range?: Json
          id?: string
          notes?: string | null
          preferred_band?: string
          preferred_mode?: string
          recommended_windows?: Json
          reminder_fired?: boolean
          status?: string
          target_callsign?: string
          target_lat?: number | null
          target_lon?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "skeds_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      station_presets: {
        Row: {
          accessory_ids: string[]
          antenna_id: string | null
          created_at: string
          description: string | null
          feedline_id: string | null
          id: string
          is_active: boolean
          linked_location_id: string | null
          name: string
          radio_instance_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          accessory_ids?: string[]
          antenna_id?: string | null
          created_at?: string
          description?: string | null
          feedline_id?: string | null
          id: string
          is_active?: boolean
          linked_location_id?: string | null
          name: string
          radio_instance_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          accessory_ids?: string[]
          antenna_id?: string | null
          created_at?: string
          description?: string | null
          feedline_id?: string | null
          id?: string
          is_active?: boolean
          linked_location_id?: string | null
          name?: string
          radio_instance_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "station_presets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          preferences: Json
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          preferences?: Json
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          preferences?: Json
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_radios: {
        Row: {
          created_at: string
          equipment_id: string
          firmware_version: string | null
          instance_id: string
          nickname: string | null
          notes: string | null
          purchase_date: string | null
          serial_number: string | null
          specs_override: Json | null
          tx_power_setting: number | null
          updated_at: string
          user_id: string
          wiring: string | null
        }
        Insert: {
          created_at?: string
          equipment_id: string
          firmware_version?: string | null
          instance_id: string
          nickname?: string | null
          notes?: string | null
          purchase_date?: string | null
          serial_number?: string | null
          specs_override?: Json | null
          tx_power_setting?: number | null
          updated_at?: string
          user_id: string
          wiring?: string | null
        }
        Update: {
          created_at?: string
          equipment_id?: string
          firmware_version?: string | null
          instance_id?: string
          nickname?: string | null
          notes?: string | null
          purchase_date?: string | null
          serial_number?: string | null
          specs_override?: Json | null
          tx_power_setting?: number | null
          updated_at?: string
          user_id?: string
          wiring?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_radios_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      watches: {
        Row: {
          activity_count: number
          created_at: string
          id: string
          is_active: boolean
          name: string | null
          pattern: string
          type: string
          user_id: string
        }
        Insert: {
          activity_count?: number
          created_at?: string
          id: string
          is_active?: boolean
          name?: string | null
          pattern: string
          type: string
          user_id: string
        }
        Update: {
          activity_count?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string | null
          pattern?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      update_profile_stats: {
        Args: { target_user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
