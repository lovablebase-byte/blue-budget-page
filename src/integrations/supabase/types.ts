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
      absence_rules: {
        Row: {
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          message: string
          name: string
          only_first_message: boolean
          schedule: Json
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          message: string
          name: string
          only_first_message?: boolean
          schedule?: Json
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          message?: string
          name?: string
          only_first_message?: boolean
          schedule?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "absence_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agents: {
        Row: {
          api_key: string | null
          base_prompt: string | null
          company_id: string
          created_at: string
          delay_seconds: number
          enabled_instances: string[] | null
          function_calling: boolean
          id: string
          is_active: boolean
          max_tokens: number
          name: string
          objective: string | null
          provider: string
          response_style: string
          safety_rules: string | null
          schedule: Json
          tools: string[] | null
          understand_audio: boolean
          understand_image: boolean
          updated_at: string
        }
        Insert: {
          api_key?: string | null
          base_prompt?: string | null
          company_id: string
          created_at?: string
          delay_seconds?: number
          enabled_instances?: string[] | null
          function_calling?: boolean
          id?: string
          is_active?: boolean
          max_tokens?: number
          name: string
          objective?: string | null
          provider?: string
          response_style?: string
          safety_rules?: string | null
          schedule?: Json
          tools?: string[] | null
          understand_audio?: boolean
          understand_image?: boolean
          updated_at?: string
        }
        Update: {
          api_key?: string | null
          base_prompt?: string | null
          company_id?: string
          created_at?: string
          delay_seconds?: number
          enabled_instances?: string[] | null
          function_calling?: boolean
          id?: string
          is_active?: boolean
          max_tokens?: number
          name?: string
          objective?: string | null
          provider?: string
          response_style?: string
          safety_rules?: string | null
          schedule?: Json
          tools?: string[] | null
          understand_audio?: boolean
          understand_image?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          company_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          payload: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          company_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          payload?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          company_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          payload?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          company_id: string
          created_at: string
          id: string
          message_template: string
          name: string
          rate_limit_per_minute: number | null
          segment_data: Json | null
          segment_type: string | null
          send_window: Json | null
          stats: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          message_template: string
          name: string
          rate_limit_per_minute?: number | null
          segment_data?: Json | null
          segment_type?: string | null
          send_window?: Json | null
          stats?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          message_template?: string
          name?: string
          rate_limit_per_minute?: number | null
          segment_data?: Json | null
          segment_type?: string | null
          send_window?: Json | null
          stats?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_key_logs: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          ip_address: string | null
          key_id: string
          status_code: number | null
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          ip_address?: string | null
          key_id: string
          status_code?: number | null
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          ip_address?: string | null
          key_id?: string
          status_code?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_key_logs_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "chatbot_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_keys: {
        Row: {
          api_key: string
          company_id: string
          created_at: string
          id: string
          ip_allowlist: string[] | null
          is_active: boolean
          last_used_at: string | null
          name: string
          rate_limit: number | null
          scopes: string[] | null
          updated_at: string
        }
        Insert: {
          api_key?: string
          company_id: string
          created_at?: string
          id?: string
          ip_allowlist?: string[] | null
          is_active?: boolean
          last_used_at?: string | null
          name: string
          rate_limit?: number | null
          scopes?: string[] | null
          updated_at?: string
        }
        Update: {
          api_key?: string
          company_id?: string
          created_at?: string
          id?: string
          ip_allowlist?: string[] | null
          is_active?: boolean
          last_used_at?: string | null
          name?: string
          rate_limit?: number | null
          scopes?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_keys_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_keywords: {
        Row: {
          audience: string
          chain_to_id: string | null
          company_id: string
          created_at: string
          delay_seconds: number
          id: string
          instance_id: string | null
          is_active: boolean
          keywords: string[]
          match_type: string
          media_url: string | null
          response: string
          save_history: boolean
          updated_at: string
        }
        Insert: {
          audience?: string
          chain_to_id?: string | null
          company_id: string
          created_at?: string
          delay_seconds?: number
          id?: string
          instance_id?: string | null
          is_active?: boolean
          keywords?: string[]
          match_type?: string
          media_url?: string | null
          response: string
          save_history?: boolean
          updated_at?: string
        }
        Update: {
          audience?: string
          chain_to_id?: string | null
          company_id?: string
          created_at?: string
          delay_seconds?: number
          id?: string
          instance_id?: string | null
          is_active?: boolean
          keywords?: string[]
          match_type?: string
          media_url?: string | null
          response?: string
          save_history?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_keywords_chain_to_id_fkey"
            columns: ["chain_to_id"]
            isOneToOne: false
            referencedRelation: "chatbot_keywords"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_keywords_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_keywords_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "instances"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_branding: {
        Row: {
          company_id: string
          created_at: string
          custom_domain: string | null
          favicon_url: string | null
          id: string
          logo_dark_url: string | null
          logo_light_url: string | null
          primary_color: string | null
          site_title: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          custom_domain?: string | null
          favicon_url?: string | null
          id?: string
          logo_dark_url?: string | null
          logo_light_url?: string | null
          primary_color?: string | null
          site_title?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          custom_domain?: string | null
          favicon_url?: string | null
          id?: string
          logo_dark_url?: string | null
          logo_light_url?: string | null
          primary_color?: string | null
          site_title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_branding_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_overrides: {
        Row: {
          company_id: string
          created_at: string
          id: string
          notes: string | null
          override_key: string
          override_value: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          notes?: string | null
          override_key: string
          override_value: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          override_key?: string
          override_value?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_overrides_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          company_id: string
          created_at: string
          id: string
          setting_key: string
          setting_value: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          setting_key: string
          setting_value?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          setting_key?: string
          setting_value?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_message_templates: {
        Row: {
          company_id: string
          created_at: string
          event_key: string
          id: string
          is_enabled: boolean
          label: string
          message_template: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          event_key: string
          id?: string
          is_enabled?: boolean
          label: string
          message_template?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          event_key?: string
          id?: string
          is_enabled?: boolean
          label?: string
          message_template?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_message_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_send_logs: {
        Row: {
          api_response: Json | null
          company_id: string
          created_at: string
          error: string | null
          event_key: string
          id: string
          message: string | null
          order_code: string | null
          phone: string
          status: string
        }
        Insert: {
          api_response?: Json | null
          company_id: string
          created_at?: string
          error?: string | null
          event_key: string
          id?: string
          message?: string | null
          order_code?: string | null
          phone: string
          status?: string
        }
        Update: {
          api_response?: Json | null
          company_id?: string
          created_at?: string
          error?: string | null
          event_key?: string
          id?: string
          message?: string | null
          order_code?: string | null
          phone?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_send_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_whatsapp_config: {
        Row: {
          company_id: string
          created_at: string
          endpoint_url: string
          id: string
          is_enabled: boolean
          store_phone: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          endpoint_url?: string
          id?: string
          is_enabled?: boolean
          store_phone?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          endpoint_url?: string
          id?: string
          is_enabled?: boolean
          store_phone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_whatsapp_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      evolution_api_config: {
        Row: {
          api_key: string
          base_url: string
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          api_key?: string
          base_url?: string
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          api_key?: string
          base_url?: string
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evolution_api_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      global_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          setting_key: string
          setting_value: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          setting_key: string
          setting_value?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          setting_key?: string
          setting_value?: string
          updated_at?: string
        }
        Relationships: []
      }
      greetings: {
        Row: {
          company_id: string
          cooldown_minutes: number
          created_at: string
          delay_max: number
          delay_min: number
          id: string
          instance_id: string | null
          is_active: boolean
          media_url: string | null
          message_template: string
          name: string
          schedule: Json | null
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          company_id: string
          cooldown_minutes?: number
          created_at?: string
          delay_max?: number
          delay_min?: number
          id?: string
          instance_id?: string | null
          is_active?: boolean
          media_url?: string | null
          message_template: string
          name: string
          schedule?: Json | null
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          cooldown_minutes?: number
          created_at?: string
          delay_max?: number
          delay_min?: number
          id?: string
          instance_id?: string | null
          is_active?: boolean
          media_url?: string | null
          message_template?: string
          name?: string
          schedule?: Json | null
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "greetings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "greetings_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "instances"
            referencedColumns: ["id"]
          },
        ]
      }
      human_behavior_config: {
        Row: {
          burst_limit: number
          company_id: string
          cooldown_after_burst_max: number
          cooldown_after_burst_min: number
          created_at: string
          human_pause_max: number
          human_pause_min: number
          id: string
          instance_variation: Json
          typing_simulation_enabled: boolean
          typing_speed_max: number
          typing_speed_min: number
          updated_at: string
        }
        Insert: {
          burst_limit?: number
          company_id: string
          cooldown_after_burst_max?: number
          cooldown_after_burst_min?: number
          created_at?: string
          human_pause_max?: number
          human_pause_min?: number
          id?: string
          instance_variation?: Json
          typing_simulation_enabled?: boolean
          typing_speed_max?: number
          typing_speed_min?: number
          updated_at?: string
        }
        Update: {
          burst_limit?: number
          company_id?: string
          cooldown_after_burst_max?: number
          cooldown_after_burst_min?: number
          created_at?: string
          human_pause_max?: number
          human_pause_min?: number
          id?: string
          instance_variation?: Json
          typing_simulation_enabled?: boolean
          typing_speed_max?: number
          typing_speed_min?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "human_behavior_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      instance_limits: {
        Row: {
          cooldown_until: string | null
          created_at: string
          id: string
          instance_id: string
          last_reset_day: string
          last_reset_hour: string
          last_reset_minute: string
          max_per_day: number
          max_per_hour: number
          max_per_minute: number
          messages_sent_day: number
          messages_sent_hour: number
          messages_sent_minute: number
        }
        Insert: {
          cooldown_until?: string | null
          created_at?: string
          id?: string
          instance_id: string
          last_reset_day?: string
          last_reset_hour?: string
          last_reset_minute?: string
          max_per_day?: number
          max_per_hour?: number
          max_per_minute?: number
          messages_sent_day?: number
          messages_sent_hour?: number
          messages_sent_minute?: number
        }
        Update: {
          cooldown_until?: string | null
          created_at?: string
          id?: string
          instance_id?: string
          last_reset_day?: string
          last_reset_hour?: string
          last_reset_minute?: string
          max_per_day?: number
          max_per_hour?: number
          max_per_minute?: number
          messages_sent_day?: number
          messages_sent_hour?: number
          messages_sent_minute?: number
        }
        Relationships: [
          {
            foreignKeyName: "instance_limits_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: true
            referencedRelation: "instances"
            referencedColumns: ["id"]
          },
        ]
      }
      instances: {
        Row: {
          access_token: string
          company_id: string
          created_at: string
          evolution_instance_id: string | null
          id: string
          last_connected_at: string | null
          name: string
          phone_number: string | null
          provider: string
          provider_instance_id: string | null
          reconnect_policy: string | null
          status: string
          tags: string[] | null
          timezone: string | null
          updated_at: string
          webhook_secret: string | null
          webhook_url: string | null
        }
        Insert: {
          access_token?: string
          company_id: string
          created_at?: string
          evolution_instance_id?: string | null
          id?: string
          last_connected_at?: string | null
          name: string
          phone_number?: string | null
          provider?: string
          provider_instance_id?: string | null
          reconnect_policy?: string | null
          status?: string
          tags?: string[] | null
          timezone?: string | null
          updated_at?: string
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Update: {
          access_token?: string
          company_id?: string
          created_at?: string
          evolution_instance_id?: string | null
          id?: string
          last_connected_at?: string | null
          name?: string
          phone_number?: string | null
          provider?: string
          provider_instance_id?: string | null
          reconnect_policy?: string | null
          status?: string
          tags?: string[] | null
          timezone?: string | null
          updated_at?: string
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instances_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_cents: number
          company_id: string
          created_at: string
          due_date: string
          gateway: string | null
          gateway_reference: string | null
          id: string
          notes: string | null
          paid_at: string | null
          period_end: string | null
          period_start: string | null
          status: string
          subscription_id: string | null
          updated_at: string
        }
        Insert: {
          amount_cents?: number
          company_id: string
          created_at?: string
          due_date: string
          gateway?: string | null
          gateway_reference?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: string
          subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          company_id?: string
          created_at?: string
          due_date?: string
          gateway?: string | null
          gateway_reference?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: string
          subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      message_queue: {
        Row: {
          attempts: number
          campaign_id: string
          company_id: string
          created_at: string
          error: string | null
          id: string
          instance_id: string | null
          media_url: string | null
          message: string
          phone: string
          scheduled_at: string
          sent_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          campaign_id: string
          company_id: string
          created_at?: string
          error?: string | null
          id?: string
          instance_id?: string | null
          media_url?: string | null
          message: string
          phone: string
          scheduled_at?: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          campaign_id?: string
          company_id?: string
          created_at?: string
          error?: string | null
          id?: string
          instance_id?: string | null
          media_url?: string | null
          message?: string
          phone?: string
          scheduled_at?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_queue_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_queue_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_queue_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "instances"
            referencedColumns: ["id"]
          },
        ]
      }
      messages_log: {
        Row: {
          campaign_id: string | null
          company_id: string
          contact_number: string
          created_at: string
          delivered_at: string | null
          direction: string
          id: string
          instance_id: string | null
          media_url: string | null
          message: string | null
          read_at: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          campaign_id?: string | null
          company_id: string
          contact_number: string
          created_at?: string
          delivered_at?: string | null
          direction?: string
          id?: string
          instance_id?: string | null
          media_url?: string | null
          message?: string | null
          read_at?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          campaign_id?: string | null
          company_id?: string
          contact_number?: string
          created_at?: string
          delivered_at?: string | null
          direction?: string
          id?: string
          instance_id?: string | null
          media_url?: string | null
          message?: string | null
          read_at?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_log_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_log_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "instances"
            referencedColumns: ["id"]
          },
        ]
      }
      modules: {
        Row: {
          created_at: string
          id: string
          label: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          name?: string
        }
        Relationships: []
      }
      payment_charges: {
        Row: {
          amount_cents: number
          capture_method: string | null
          checkout_url: string | null
          company_id: string
          created_at: string
          description: string | null
          expires_at: string | null
          external_id: string | null
          external_reference: string | null
          gateway: string
          gateway_payment_id: string | null
          id: string
          invoice_slug: string | null
          order_nsu: string | null
          paid_at: string | null
          payment_method: string | null
          pix_copy_paste: string | null
          qr_code: string | null
          qr_code_base64: string | null
          raw_response: Json | null
          receipt_url: string | null
          status: string
          status_detail: string | null
          subscription_id: string | null
          ticket_url: string | null
          transaction_nsu: string | null
          updated_at: string
        }
        Insert: {
          amount_cents?: number
          capture_method?: string | null
          checkout_url?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          expires_at?: string | null
          external_id?: string | null
          external_reference?: string | null
          gateway?: string
          gateway_payment_id?: string | null
          id?: string
          invoice_slug?: string | null
          order_nsu?: string | null
          paid_at?: string | null
          payment_method?: string | null
          pix_copy_paste?: string | null
          qr_code?: string | null
          qr_code_base64?: string | null
          raw_response?: Json | null
          receipt_url?: string | null
          status?: string
          status_detail?: string | null
          subscription_id?: string | null
          ticket_url?: string | null
          transaction_nsu?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          capture_method?: string | null
          checkout_url?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          expires_at?: string | null
          external_id?: string | null
          external_reference?: string | null
          gateway?: string
          gateway_payment_id?: string | null
          id?: string
          invoice_slug?: string | null
          order_nsu?: string | null
          paid_at?: string | null
          payment_method?: string | null
          pix_copy_paste?: string | null
          qr_code?: string | null
          qr_code_base64?: string | null
          raw_response?: Json | null
          receipt_url?: string | null
          status?: string
          status_detail?: string | null
          subscription_id?: string | null
          ticket_url?: string | null
          transaction_nsu?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_charges_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_charges_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          charge_id: string | null
          event_type: string
          external_id: string | null
          gateway: string
          id: string
          payload: Json | null
          processed: boolean
          processed_at: string | null
          raw_event_id: string | null
          received_at: string
          result: string | null
        }
        Insert: {
          charge_id?: string | null
          event_type: string
          external_id?: string | null
          gateway?: string
          id?: string
          payload?: Json | null
          processed?: boolean
          processed_at?: string | null
          raw_event_id?: string | null
          received_at?: string
          result?: string | null
        }
        Update: {
          charge_id?: string | null
          event_type?: string
          external_id?: string | null
          gateway?: string
          id?: string
          payload?: Json | null
          processed?: boolean
          processed_at?: string | null
          raw_event_id?: string | null
          received_at?: string
          result?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "payment_charges"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_gateways: {
        Row: {
          config: Json | null
          created_at: string
          environment: string
          id: string
          is_active: boolean
          name: string
          provider: string
          updated_at: string
        }
        Insert: {
          config?: Json | null
          created_at?: string
          environment?: string
          id?: string
          is_active?: boolean
          name: string
          provider: string
          updated_at?: string
        }
        Update: {
          config?: Json | null
          created_at?: string
          environment?: string
          id?: string
          is_active?: boolean
          name?: string
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      permission_presets: {
        Row: {
          created_at: string
          description: string | null
          id: string
          label: string
          name: string
          permissions: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          label: string
          name: string
          permissions?: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          label?: string
          name?: string
          permissions?: Json
        }
        Relationships: []
      }
      permissions: {
        Row: {
          can_create: boolean
          can_delete: boolean
          can_edit: boolean
          can_view: boolean
          created_at: string
          extra_permissions: Json | null
          id: string
          module_id: string
          user_role_id: string
        }
        Insert: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          extra_permissions?: Json | null
          id?: string
          module_id: string
          user_role_id: string
        }
        Update: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          extra_permissions?: Json | null
          id?: string
          module_id?: string
          user_role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "permissions_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permissions_user_role_id_fkey"
            columns: ["user_role_id"]
            isOneToOne: false
            referencedRelation: "user_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_allowed_providers: {
        Row: {
          created_at: string
          id: string
          plan_id: string
          provider: string
        }
        Insert: {
          created_at?: string
          id?: string
          plan_id: string
          provider: string
        }
        Update: {
          created_at?: string
          id?: string
          plan_id?: string
          provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_allowed_providers_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          absence_enabled: boolean
          advanced_logs_enabled: boolean
          advanced_webhooks_enabled: boolean
          ai_agents_enabled: boolean
          allowed_providers: string[] | null
          api_access: boolean
          billing_cycle: string
          branding_enabled: boolean
          campaigns_enabled: boolean
          chatbot_keys_enabled: boolean
          chatbot_keywords_enabled: boolean
          created_at: string
          description: string | null
          display_order: number
          greetings_enabled: boolean
          id: string
          instances_enabled: boolean
          invoices_enabled: boolean
          is_active: boolean
          is_popular: boolean
          max_ai_agents: number
          max_campaigns: number
          max_chatbots: number
          max_contacts: number
          max_instances: number
          max_messages_day: number
          max_messages_month: number
          max_users: number
          max_workflows: number
          name: string
          notes: string | null
          price_cents: number
          slug: string | null
          status_enabled: boolean
          support_priority: string
          updated_at: string
          whitelabel_enabled: boolean
          workflows_enabled: boolean
        }
        Insert: {
          absence_enabled?: boolean
          advanced_logs_enabled?: boolean
          advanced_webhooks_enabled?: boolean
          ai_agents_enabled?: boolean
          allowed_providers?: string[] | null
          api_access?: boolean
          billing_cycle?: string
          branding_enabled?: boolean
          campaigns_enabled?: boolean
          chatbot_keys_enabled?: boolean
          chatbot_keywords_enabled?: boolean
          created_at?: string
          description?: string | null
          display_order?: number
          greetings_enabled?: boolean
          id?: string
          instances_enabled?: boolean
          invoices_enabled?: boolean
          is_active?: boolean
          is_popular?: boolean
          max_ai_agents?: number
          max_campaigns?: number
          max_chatbots?: number
          max_contacts?: number
          max_instances?: number
          max_messages_day?: number
          max_messages_month?: number
          max_users?: number
          max_workflows?: number
          name: string
          notes?: string | null
          price_cents?: number
          slug?: string | null
          status_enabled?: boolean
          support_priority?: string
          updated_at?: string
          whitelabel_enabled?: boolean
          workflows_enabled?: boolean
        }
        Update: {
          absence_enabled?: boolean
          advanced_logs_enabled?: boolean
          advanced_webhooks_enabled?: boolean
          ai_agents_enabled?: boolean
          allowed_providers?: string[] | null
          api_access?: boolean
          billing_cycle?: string
          branding_enabled?: boolean
          campaigns_enabled?: boolean
          chatbot_keys_enabled?: boolean
          chatbot_keywords_enabled?: boolean
          created_at?: string
          description?: string | null
          display_order?: number
          greetings_enabled?: boolean
          id?: string
          instances_enabled?: boolean
          invoices_enabled?: boolean
          is_active?: boolean
          is_popular?: boolean
          max_ai_agents?: number
          max_campaigns?: number
          max_chatbots?: number
          max_contacts?: number
          max_instances?: number
          max_messages_day?: number
          max_messages_month?: number
          max_users?: number
          max_workflows?: number
          name?: string
          notes?: string | null
          price_cents?: number
          slug?: string | null
          status_enabled?: boolean
          support_priority?: string
          updated_at?: string
          whitelabel_enabled?: boolean
          workflows_enabled?: boolean
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          force_password_change: boolean
          full_name: string | null
          id: string
          referral_code: string | null
          timezone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          force_password_change?: boolean
          full_name?: string | null
          id?: string
          referral_code?: string | null
          timezone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          force_password_change?: boolean
          full_name?: string | null
          id?: string
          referral_code?: string | null
          timezone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      public_api_idempotency_keys: {
        Row: {
          company_id: string
          created_at: string
          endpoint: string
          external_id: string | null
          id: string
          idempotency_key: string | null
          instance_id: string
          message_preview: string | null
          provider: string | null
          provider_message_id: string | null
          recipient: string | null
          request_hash: string
          response_body: Json | null
          response_status: number | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          endpoint: string
          external_id?: string | null
          id?: string
          idempotency_key?: string | null
          instance_id: string
          message_preview?: string | null
          provider?: string | null
          provider_message_id?: string | null
          recipient?: string | null
          request_hash: string
          response_body?: Json | null
          response_status?: number | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          endpoint?: string
          external_id?: string | null
          id?: string
          idempotency_key?: string | null
          instance_id?: string
          message_preview?: string | null
          provider?: string | null
          provider_message_id?: string | null
          recipient?: string | null
          request_hash?: string
          response_body?: Json | null
          response_status?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_api_idempotency_keys_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_api_idempotency_keys_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "instances"
            referencedColumns: ["id"]
          },
        ]
      }
      status_templates: {
        Row: {
          auto_send: boolean
          company_id: string
          created_at: string
          id: string
          message: string
          name: string
          status_type: string
          updated_at: string
        }
        Insert: {
          auto_send?: boolean
          company_id: string
          created_at?: string
          id?: string
          message: string
          name: string
          status_type: string
          updated_at?: string
        }
        Update: {
          auto_send?: boolean
          company_id?: string
          created_at?: string
          id?: string
          message?: string
          name?: string
          status_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "status_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          auto_renew: boolean
          canceled_at: string | null
          company_id: string
          created_at: string
          expires_at: string | null
          gateway: string | null
          gateway_reference: string | null
          id: string
          notes: string | null
          plan_id: string
          renewal_date: string | null
          started_at: string
          status: string
          suspended_at: string | null
          updated_at: string
        }
        Insert: {
          auto_renew?: boolean
          canceled_at?: string | null
          company_id: string
          created_at?: string
          expires_at?: string | null
          gateway?: string | null
          gateway_reference?: string | null
          id?: string
          notes?: string | null
          plan_id: string
          renewal_date?: string | null
          started_at?: string
          status?: string
          suspended_at?: string | null
          updated_at?: string
        }
        Update: {
          auto_renew?: boolean
          canceled_at?: string | null
          company_id?: string
          created_at?: string
          expires_at?: string | null
          gateway?: string | null
          gateway_reference?: string | null
          id?: string
          notes?: string | null
          plan_id?: string
          renewal_date?: string | null
          started_at?: string
          status?: string
          suspended_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          company_id: string
          connection_state: string | null
          created_at: string
          direction: string
          event_type: string
          from_number: string | null
          id: string
          instance_id: string
          message_id: string | null
          payload: Json | null
          processed: boolean | null
          provider: string | null
          raw_event_type: string | null
          status: string | null
          text_preview: string | null
          to_number: string | null
        }
        Insert: {
          company_id: string
          connection_state?: string | null
          created_at?: string
          direction?: string
          event_type: string
          from_number?: string | null
          id?: string
          instance_id: string
          message_id?: string | null
          payload?: Json | null
          processed?: boolean | null
          provider?: string | null
          raw_event_type?: string | null
          status?: string | null
          text_preview?: string | null
          to_number?: string | null
        }
        Update: {
          company_id?: string
          connection_state?: string | null
          created_at?: string
          direction?: string
          event_type?: string
          from_number?: string | null
          id?: string
          instance_id?: string
          message_id?: string | null
          payload?: Json | null
          processed?: boolean | null
          provider?: string | null
          raw_event_type?: string | null
          status?: string | null
          text_preview?: string | null
          to_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_events_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "instances"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_api_configs: {
        Row: {
          api_key: string | null
          base_url: string
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          provider: string
          updated_at: string
        }
        Insert: {
          api_key?: string | null
          base_url?: string
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          provider: string
          updated_at?: string
        }
        Update: {
          api_key?: string | null
          base_url?: string
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          provider?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_api_configs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          company_id: string
          created_at: string
          definition: Json
          description: string | null
          id: string
          is_active: boolean
          is_published: boolean
          name: string
          updated_at: string
          version: number
        }
        Insert: {
          company_id: string
          created_at?: string
          definition?: Json
          description?: string | null
          id?: string
          is_active?: boolean
          is_published?: boolean
          name: string
          updated_at?: string
          version?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          definition?: Json
          description?: string | null
          id?: string
          is_active?: boolean
          is_published?: boolean
          name?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "workflows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cancel_pending_plan_change: { Args: never; Returns: Json }
      change_subscription_plan: {
        Args: { _new_plan_id: string }
        Returns: Json
      }
      check_and_update_rate_limit: {
        Args: { p_increment?: number; p_instance_id: string }
        Returns: Json
      }
      confirm_pending_plan_change: {
        Args: { _subscription_id: string }
        Returns: Json
      }
      create_instance_safe: {
        Args: {
          _name: string
          _provider: string
          _reconnect_policy?: string
          _tags?: string[]
          _timezone?: string
          _webhook_secret?: string
        }
        Returns: Json
      }
      get_effective_limit: {
        Args: { _company_id: string; _limit_key: string }
        Returns: number
      }
      get_effective_setting: {
        Args: { _company_id: string; _key: string }
        Returns: string
      }
      get_user_company_id: { Args: never; Returns: string }
      get_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_user_role_id: { Args: never; Returns: string }
      has_module_permission: {
        Args: { _module_name: string; _permission: string }
        Returns: boolean
      }
      is_company_admin: { Args: { _company_id: string }; Returns: boolean }
      is_company_member: { Args: { _company_id: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      log_audit: {
        Args: {
          _action: string
          _entity_id?: string
          _entity_type: string
          _payload?: Json
        }
        Returns: string
      }
      rotate_instance_token: { Args: { _instance_id: string }; Returns: Json }
      update_instance_provider_safe: {
        Args: {
          _evolution_instance_id?: string
          _instance_id: string
          _phone_number?: string
          _provider_instance_id?: string
          _status?: string
          _webhook_url?: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_role: "super_admin" | "admin" | "user"
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
    Enums: {
      app_role: ["super_admin", "admin", "user"],
    },
  },
} as const
