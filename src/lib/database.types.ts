// Generated from the Supabase schema. Regenerate after migrations: npm run gen:types
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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          from_status: string | null
          id: number
          metadata: Json
          to_status: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          from_status?: string | null
          id?: never
          metadata?: Json
          to_status?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          from_status?: string | null
          id?: never
          metadata?: Json
          to_status?: string | null
        }
        Relationships: []
      }
      availability_exceptions: {
        Row: {
          created_at: string
          end_time: string | null
          id: string
          on_date: string
          professional_id: string
          reason: string | null
          start_time: string | null
        }
        Insert: {
          created_at?: string
          end_time?: string | null
          id?: string
          on_date: string
          professional_id: string
          reason?: string | null
          start_time?: string | null
        }
        Update: {
          created_at?: string
          end_time?: string | null
          id?: string
          on_date?: string
          professional_id?: string
          reason?: string | null
          start_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "availability_exceptions_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_rules: {
        Row: {
          created_at: string
          end_time: string
          id: string
          professional_id: string
          start_time: string
          weekday: number
        }
        Insert: {
          created_at?: string
          end_time: string
          id?: string
          professional_id: string
          start_time: string
          weekday: number
        }
        Update: {
          created_at?: string
          end_time?: string
          id?: string
          professional_id?: string
          start_time?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "availability_rules_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          amount_due_now_cents: number
          amount_paid_cents: number
          amount_total_cents: number
          booking_number: string
          booking_type: string
          cancellation_reason: string | null
          cancellation_requested_by: string | null
          cancelled_at: string | null
          completed_at: string | null
          contract_id: string | null
          created_at: string
          currency: string
          customer_id: string
          customer_notes: string | null
          id: string
          location_address: string | null
          location_city: string | null
          payment_due_by: string | null
          payment_status: string
          previous_status: string | null
          professional_id: string
          quotation_id: string | null
          request_id: string | null
          reschedule_proposed_start: string | null
          reschedule_requested_by: string | null
          scheduled_end: string
          scheduled_start: string
          service_id: string | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_due_now_cents: number
          amount_paid_cents?: number
          amount_total_cents: number
          booking_number?: string
          booking_type: string
          cancellation_reason?: string | null
          cancellation_requested_by?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          contract_id?: string | null
          created_at?: string
          currency?: string
          customer_id: string
          customer_notes?: string | null
          id?: string
          location_address?: string | null
          location_city?: string | null
          payment_due_by?: string | null
          payment_status?: string
          previous_status?: string | null
          professional_id: string
          quotation_id?: string | null
          request_id?: string | null
          reschedule_proposed_start?: string | null
          reschedule_requested_by?: string | null
          scheduled_end: string
          scheduled_start: string
          service_id?: string | null
          started_at?: string | null
          status: string
          updated_at?: string
        }
        Update: {
          amount_due_now_cents?: number
          amount_paid_cents?: number
          amount_total_cents?: number
          booking_number?: string
          booking_type?: string
          cancellation_reason?: string | null
          cancellation_requested_by?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          contract_id?: string | null
          created_at?: string
          currency?: string
          customer_id?: string
          customer_notes?: string | null
          id?: string
          location_address?: string | null
          location_city?: string | null
          payment_due_by?: string | null
          payment_status?: string
          previous_status?: string | null
          professional_id?: string
          quotation_id?: string | null
          request_id?: string | null
          reschedule_proposed_start?: string | null
          reschedule_requested_by?: string | null
          scheduled_end?: string
          scheduled_start?: string
          service_id?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_cancellation_requested_by_fkey"
            columns: ["cancellation_requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: true
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: true
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_reschedule_requested_by_fkey"
            columns: ["reschedule_requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_signatures: {
        Row: {
          consent_statement: string
          content_hash: string
          contract_version_id: string
          id: string
          ip_address: string | null
          signed_at: string
          signer_id: string
          signer_name: string
          signer_role: string
          user_agent: string | null
        }
        Insert: {
          consent_statement: string
          content_hash: string
          contract_version_id: string
          id?: string
          ip_address?: string | null
          signed_at?: string
          signer_id: string
          signer_name: string
          signer_role: string
          user_agent?: string | null
        }
        Update: {
          consent_statement?: string
          content_hash?: string
          contract_version_id?: string
          id?: string
          ip_address?: string | null
          signed_at?: string
          signer_id?: string
          signer_name?: string
          signer_role?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_signatures_contract_version_id_fkey"
            columns: ["contract_version_id"]
            isOneToOne: false
            referencedRelation: "contract_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_signatures_signer_id_fkey"
            columns: ["signer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_versions: {
        Row: {
          content: Json
          content_hash: string
          contract_id: string
          created_at: string
          created_by: string | null
          id: string
          version: number
        }
        Insert: {
          content: Json
          content_hash: string
          contract_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          version: number
        }
        Update: {
          content?: Json
          content_hash?: string
          contract_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "contract_versions_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          booking_id: string | null
          contract_number: string
          created_at: string
          current_version: number
          customer_id: string
          id: string
          professional_id: string
          quotation_id: string
          signed_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          booking_id?: string | null
          contract_number?: string
          created_at?: string
          current_version?: number
          customer_id: string
          id?: string
          professional_id: string
          quotation_id: string
          signed_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          booking_id?: string | null
          contract_number?: string
          created_at?: string
          current_version?: number
          customer_id?: string
          id?: string
          professional_id?: string
          quotation_id?: string
          signed_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_booking_fk"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: true
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          last_read_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          last_read_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          last_read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          last_message_at: string | null
          professional_id: string
          request_id: string | null
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          last_message_at?: string | null
          professional_id: string
          request_id?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          last_message_at?: string | null
          professional_id?: string
          request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      disputes: {
        Row: {
          booking_id: string
          created_at: string
          id: string
          opened_by: string
          reason: string
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          id?: string
          opened_by: string
          reason: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          id?: string
          opened_by?: string
          reason?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "disputes_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string
          professional_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          professional_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          professional_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachments: Json
          body: string
          conversation_id: string
          created_at: string
          id: string
          sender_id: string
        }
        Insert: {
          attachments?: Json
          body?: string
          conversation_id: string
          created_at?: string
          id?: string
          sender_id?: string
        }
        Update: {
          attachments?: Json
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          dedupe_key: string | null
          id: string
          link: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          dedupe_key?: string | null
          id?: string
          link?: string | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          dedupe_key?: string | null
          id?: string
          link?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_records: {
        Row: {
          amount_cents: number
          booking_id: string
          checkout_url: string | null
          created_at: string
          currency: string
          customer_id: string
          failure_reason: string | null
          id: string
          livemode: boolean | null
          paid_at: string | null
          professional_id: string
          provider: string
          provider_checkout_id: string | null
          provider_payment_id: string | null
          provider_payment_intent_id: string | null
          purpose: string
          status: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          booking_id: string
          checkout_url?: string | null
          created_at?: string
          currency?: string
          customer_id: string
          failure_reason?: string | null
          id?: string
          livemode?: boolean | null
          paid_at?: string | null
          professional_id: string
          provider?: string
          provider_checkout_id?: string | null
          provider_payment_id?: string | null
          provider_payment_intent_id?: string | null
          purpose: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          booking_id?: string
          checkout_url?: string | null
          created_at?: string
          currency?: string
          customer_id?: string
          failure_reason?: string | null
          id?: string
          livemode?: boolean | null
          paid_at?: string | null
          professional_id?: string
          provider?: string
          provider_checkout_id?: string | null
          provider_payment_id?: string | null
          provider_payment_intent_id?: string | null
          purpose?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_records_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_records_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_records_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_webhook_events: {
        Row: {
          attempts: number
          id: string
          livemode: boolean
          payload: Json
          processed_at: string | null
          processing_error: string | null
          provider: string
          received_at: string
          type: string
        }
        Insert: {
          attempts?: number
          id: string
          livemode: boolean
          payload: Json
          processed_at?: string | null
          processing_error?: string | null
          provider?: string
          received_at?: string
          type: string
        }
        Update: {
          attempts?: number
          id?: string
          livemode?: boolean
          payload?: Json
          processed_at?: string | null
          processing_error?: string | null
          provider?: string
          received_at?: string
          type?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      portfolio_items: {
        Row: {
          completed_on: string | null
          created_at: string
          description: string | null
          id: string
          images: string[]
          professional_id: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          completed_on?: string | null
          created_at?: string
          description?: string | null
          id?: string
          images: string[]
          professional_id: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          completed_on?: string | null
          created_at?: string
          description?: string | null
          id?: string
          images?: string[]
          professional_id?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_items_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_categories: {
        Row: {
          category_id: string
          professional_id: string
        }
        Insert: {
          category_id: string
          professional_id: string
        }
        Update: {
          category_id?: string
          professional_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_categories_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_profiles: {
        Row: {
          avatar_path: string | null
          bio: string | null
          booking_window_days: number
          business_name: string | null
          certifications: string | null
          city: string | null
          cover_path: string | null
          created_at: string
          display_name: string
          faqs: Json
          headline: string | null
          id: string
          languages: string[]
          last_active_at: string
          licenses: string | null
          min_notice_hours: number
          province: string | null
          public_email: string | null
          public_phone: string | null
          published_at: string | null
          rating_avg: number | null
          review_count: number
          search_vector: unknown
          slot_minutes: number
          slug: string
          status: string
          timezone: string
          updated_at: string
          user_id: string
          verification_status: string
          verified_kinds: string[]
          working_hours_note: string | null
          years_experience: number | null
        }
        Insert: {
          avatar_path?: string | null
          bio?: string | null
          booking_window_days?: number
          business_name?: string | null
          certifications?: string | null
          city?: string | null
          cover_path?: string | null
          created_at?: string
          display_name: string
          faqs?: Json
          headline?: string | null
          id?: string
          languages?: string[]
          last_active_at?: string
          licenses?: string | null
          min_notice_hours?: number
          province?: string | null
          public_email?: string | null
          public_phone?: string | null
          published_at?: string | null
          rating_avg?: number | null
          review_count?: number
          search_vector?: unknown
          slot_minutes?: number
          slug: string
          status?: string
          timezone?: string
          updated_at?: string
          user_id: string
          verification_status?: string
          verified_kinds?: string[]
          working_hours_note?: string | null
          years_experience?: number | null
        }
        Update: {
          avatar_path?: string | null
          bio?: string | null
          booking_window_days?: number
          business_name?: string | null
          certifications?: string | null
          city?: string | null
          cover_path?: string | null
          created_at?: string
          display_name?: string
          faqs?: Json
          headline?: string | null
          id?: string
          languages?: string[]
          last_active_at?: string
          licenses?: string | null
          min_notice_hours?: number
          province?: string | null
          public_email?: string | null
          public_phone?: string | null
          published_at?: string | null
          rating_avg?: number | null
          review_count?: number
          search_vector?: unknown
          slot_minutes?: number
          slug?: string
          status?: string
          timezone?: string
          updated_at?: string
          user_id?: string
          verification_status?: string
          verified_kinds?: string[]
          working_hours_note?: string | null
          years_experience?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "professional_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_service_areas: {
        Row: {
          area: string | null
          city: string
          created_at: string
          id: string
          professional_id: string
        }
        Insert: {
          area?: string | null
          city: string
          created_at?: string
          id?: string
          professional_id: string
        }
        Update: {
          area?: string | null
          city?: string
          created_at?: string
          id?: string
          professional_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_service_areas_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          id: string
          plan_code: string
          professional_id: string
          provider: string | null
          provider_reference: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan_code: string
          professional_id: string
          provider?: string | null
          provider_reference?: string | null
          status: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan_code?: string
          professional_id?: string
          provider?: string | null
          provider_reference?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_subscriptions_plan_code_fkey"
            columns: ["plan_code"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "professional_subscriptions_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string
          full_name: string
          id: string
          is_suspended: boolean
          suspended_reason: string | null
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          full_name?: string
          id: string
          is_suspended?: boolean
          suspended_reason?: string | null
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          full_name?: string
          id?: string
          is_suspended?: boolean
          suspended_reason?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      quotation_items: {
        Row: {
          created_at: string
          description: string
          id: string
          kind: string
          line_total_cents: number
          quantity: number
          quotation_id: string
          sort_order: number
          unit_price_cents: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          kind: string
          line_total_cents?: number
          quantity: number
          quotation_id: string
          sort_order?: number
          unit_price_cents: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          kind?: string
          line_total_cents?: number
          quantity?: number
          quotation_id?: string
          sort_order?: number
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotation_items_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      quotations: {
        Row: {
          accepted_snapshot: Json | null
          created_at: string
          currency: string
          customer_id: string
          customer_note: string | null
          decided_at: string | null
          deposit_percent: number
          discount_cents: number
          estimated_duration_minutes: number | null
          exclusions: string | null
          id: string
          notes: string | null
          payment_terms: string | null
          previous_quote_id: string | null
          professional_id: string
          proposed_start: string | null
          quote_number: string
          request_id: string
          revision: number
          scope_of_work: string
          sent_at: string | null
          status: string
          subtotal_cents: number
          tax_cents: number
          tax_rate_bp: number
          title: string
          total_cents: number
          updated_at: string
          valid_until: string
          viewed_at: string | null
          warranty_terms: string | null
        }
        Insert: {
          accepted_snapshot?: Json | null
          created_at?: string
          currency?: string
          customer_id: string
          customer_note?: string | null
          decided_at?: string | null
          deposit_percent?: number
          discount_cents?: number
          estimated_duration_minutes?: number | null
          exclusions?: string | null
          id?: string
          notes?: string | null
          payment_terms?: string | null
          previous_quote_id?: string | null
          professional_id: string
          proposed_start?: string | null
          quote_number: string
          request_id: string
          revision?: number
          scope_of_work?: string
          sent_at?: string | null
          status?: string
          subtotal_cents?: number
          tax_cents?: number
          tax_rate_bp?: number
          title: string
          total_cents?: number
          updated_at?: string
          valid_until?: string
          viewed_at?: string | null
          warranty_terms?: string | null
        }
        Update: {
          accepted_snapshot?: Json | null
          created_at?: string
          currency?: string
          customer_id?: string
          customer_note?: string | null
          decided_at?: string | null
          deposit_percent?: number
          discount_cents?: number
          estimated_duration_minutes?: number | null
          exclusions?: string | null
          id?: string
          notes?: string | null
          payment_terms?: string | null
          previous_quote_id?: string | null
          professional_id?: string
          proposed_start?: string | null
          quote_number?: string
          request_id?: string
          revision?: number
          scope_of_work?: string
          sent_at?: string | null
          status?: string
          subtotal_cents?: number
          tax_cents?: number
          tax_rate_bp?: number
          title?: string
          total_cents?: number
          updated_at?: string
          valid_until?: string
          viewed_at?: string | null
          warranty_terms?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_previous_quote_id_fkey"
            columns: ["previous_quote_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      refunds: {
        Row: {
          amount_cents: number
          booking_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          failure_reason: string | null
          id: string
          payment_record_id: string
          provider_refund_id: string | null
          reason: string | null
          requested_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          booking_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          failure_reason?: string | null
          id?: string
          payment_record_id: string
          provider_refund_id?: string | null
          reason?: string | null
          requested_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          booking_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          failure_reason?: string | null
          id?: string
          payment_record_id?: string
          provider_refund_id?: string | null
          reason?: string | null
          requested_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_payment_record_id_fkey"
            columns: ["payment_record_id"]
            isOneToOne: false
            referencedRelation: "payment_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          reason: string
          reporter_id: string
          resolution_note: string | null
          resolved_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          reason: string
          reporter_id?: string
          resolution_note?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          reason?: string
          reporter_id?: string
          resolution_note?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      request_attachments: {
        Row: {
          created_at: string
          file_name: string
          id: string
          mime_type: string
          request_id: string
          size_bytes: number
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          mime_type: string
          request_id: string
          size_bytes: number
          storage_path: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          mime_type?: string
          request_id?: string
          size_bytes?: number
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_attachments_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          body: string | null
          booking_id: string
          created_at: string
          customer_id: string
          hidden_reason: string | null
          id: string
          professional_id: string
          rating: number
          status: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          booking_id: string
          created_at?: string
          customer_id: string
          hidden_reason?: string | null
          id?: string
          professional_id: string
          rating: number
          status?: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          booking_id?: string
          created_at?: string
          customer_id?: string
          hidden_reason?: string | null
          id?: string
          professional_id?: string
          rating?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_categories: {
        Row: {
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      service_requests: {
        Row: {
          alternative_dates: string[]
          category_id: string | null
          created_at: string
          customer_id: string
          description: string
          id: string
          location_address: string | null
          location_city: string
          preferred_date: string | null
          preferred_time: string | null
          professional_id: string | null
          request_number: string
          requirements: string | null
          service_id: string | null
          status: string
          status_note: string | null
          submitted_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          alternative_dates?: string[]
          category_id?: string | null
          created_at?: string
          customer_id: string
          description: string
          id?: string
          location_address?: string | null
          location_city: string
          preferred_date?: string | null
          preferred_time?: string | null
          professional_id?: string | null
          request_number?: string
          requirements?: string | null
          service_id?: string | null
          status?: string
          status_note?: string | null
          submitted_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          alternative_dates?: string[]
          category_id?: string | null
          created_at?: string
          customer_id?: string
          description?: string
          id?: string
          location_address?: string | null
          location_city?: string
          preferred_date?: string | null
          preferred_time?: string | null
          professional_id?: string | null
          request_number?: string
          requirements?: string | null
          service_id?: string | null
          status?: string
          status_note?: string | null
          submitted_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_requests_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          category_id: string | null
          created_at: string
          description: string | null
          duration_minutes: number | null
          id: string
          images: string[]
          instant_booking: boolean
          materials_excluded: string | null
          materials_included: string | null
          name: string
          preparation_notes: string | null
          price_cents: number | null
          pricing_model: string
          professional_id: string
          requires_inspection: boolean
          service_area_note: string | null
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          images?: string[]
          instant_booking?: boolean
          materials_excluded?: string | null
          materials_included?: string | null
          name: string
          preparation_notes?: string | null
          price_cents?: number | null
          pricing_model: string
          professional_id: string
          requires_inspection?: boolean
          service_area_note?: string | null
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          images?: string[]
          instant_booking?: boolean
          materials_excluded?: string | null
          materials_included?: string | null
          name?: string
          preparation_notes?: string | null
          price_cents?: number | null
          pricing_model?: string
          professional_id?: string
          requires_inspection?: boolean
          service_area_note?: string | null
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          billing_interval: string
          code: string
          currency: string
          description: string | null
          features: string[]
          is_active: boolean
          max_active_services: number | null
          name: string
          price_cents: number
          sort_order: number
        }
        Insert: {
          billing_interval?: string
          code: string
          currency?: string
          description?: string | null
          features?: string[]
          is_active?: boolean
          max_active_services?: number | null
          name: string
          price_cents: number
          sort_order?: number
        }
        Update: {
          billing_interval?: string
          code?: string
          currency?: string
          description?: string | null
          features?: string[]
          is_active?: boolean
          max_active_services?: number | null
          name?: string
          price_cents?: number
          sort_order?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          granted_at: string
          granted_by: string | null
          role: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          role: string
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      verification_submissions: {
        Row: {
          decision_reason: string | null
          details: string | null
          document_paths: string[]
          id: string
          kind: string
          professional_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string
        }
        Insert: {
          decision_reason?: string | null
          details?: string | null
          document_paths: string[]
          id?: string
          kind: string
          professional_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
        }
        Update: {
          decision_reason?: string | null
          details?: string | null
          document_paths?: string[]
          id?: string
          kind?: string
          professional_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_submissions_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_submissions_reviewed_by_fkey"
            columns: ["reviewed_by"]
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
      accept_quotation: { Args: { p_quotation_id: string }; Returns: Json }
      add_contract_version: {
        Args: { p_contract_id: string; p_terms: Json }
        Returns: {
          content: Json
          content_hash: string
          contract_id: string
          created_at: string
          created_by: string | null
          id: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "contract_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_decide_refund: {
        Args: { p_approve: boolean; p_note: string; p_refund_id: string }
        Returns: undefined
      }
      admin_list_users: {
        Args: { p_limit?: number; p_offset?: number; p_search?: string }
        Returns: {
          created_at: string
          email: string
          full_name: string
          id: string
          is_admin: boolean
          is_suspended: boolean
          professional_id: string
          professional_slug: string
          professional_status: string
          total_count: number
        }[]
      }
      admin_moderate: {
        Args: {
          p_action: string
          p_entity_id: string
          p_entity_type: string
          p_note: string
        }
        Returns: undefined
      }
      admin_overview: { Args: never; Returns: Json }
      admin_resolve_dispute: {
        Args: {
          p_booking_status: string
          p_dispute_id: string
          p_outcome: string
          p_resolution: string
        }
        Returns: undefined
      }
      admin_review_verification: {
        Args: { p_approve: boolean; p_reason: string; p_submission_id: string }
        Returns: undefined
      }
      admin_set_user_suspended: {
        Args: { p_reason: string; p_suspended: boolean; p_user_id: string }
        Returns: undefined
      }
      admin_update_setting: {
        Args: { p_key: string; p_value: Json }
        Returns: undefined
      }
      amend_contract: {
        Args: { p_contract_id: string; p_terms: Json }
        Returns: {
          content: Json
          content_hash: string
          contract_id: string
          created_at: string
          created_by: string | null
          id: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "contract_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      become_professional: {
        Args: { p_city: string; p_display_name: string; p_slug?: string }
        Returns: {
          avatar_path: string | null
          bio: string | null
          booking_window_days: number
          business_name: string | null
          certifications: string | null
          city: string | null
          cover_path: string | null
          created_at: string
          display_name: string
          faqs: Json
          headline: string | null
          id: string
          languages: string[]
          last_active_at: string
          licenses: string | null
          min_notice_hours: number
          province: string | null
          public_email: string | null
          public_phone: string | null
          published_at: string | null
          rating_avg: number | null
          review_count: number
          search_vector: unknown
          slot_minutes: number
          slug: string
          status: string
          timezone: string
          updated_at: string
          user_id: string
          verification_status: string
          verified_kinds: string[]
          working_hours_note: string | null
          years_experience: number | null
        }
        SetofOptions: {
          from: "*"
          to: "professional_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      booking_action: {
        Args: {
          p_action: string
          p_booking_id: string
          p_new_start?: string
          p_reason?: string
        }
        Returns: {
          amount_due_now_cents: number
          amount_paid_cents: number
          amount_total_cents: number
          booking_number: string
          booking_type: string
          cancellation_reason: string | null
          cancellation_requested_by: string | null
          cancelled_at: string | null
          completed_at: string | null
          contract_id: string | null
          created_at: string
          currency: string
          customer_id: string
          customer_notes: string | null
          id: string
          location_address: string | null
          location_city: string | null
          payment_due_by: string | null
          payment_status: string
          previous_status: string | null
          professional_id: string
          quotation_id: string | null
          request_id: string | null
          reschedule_proposed_start: string | null
          reschedule_requested_by: string | null
          scheduled_end: string
          scheduled_start: string
          service_id: string | null
          started_at: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "bookings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      booking_counterpart: {
        Args: {
          p_actor: string
          p_booking: Database["public"]["Tables"]["bookings"]["Row"]
        }
        Returns: string
      }
      can_access_entity: {
        Args: { p_entity_id: string; p_entity_type: string }
        Returns: boolean
      }
      can_edit_quotation: { Args: { p_quotation_id: string }; Returns: boolean }
      can_view_profile: { Args: { p_user_id: string }; Returns: boolean }
      can_view_quotation: { Args: { p_quotation_id: string }; Returns: boolean }
      create_instant_booking: {
        Args: {
          p_location_address: string
          p_location_city: string
          p_notes?: string
          p_service_id: string
          p_start: string
        }
        Returns: string
      }
      create_quotation: { Args: { p_request_id: string }; Returns: string }
      create_service_request: {
        Args: {
          p_alternative_dates?: string[]
          p_description: string
          p_location_address?: string
          p_location_city: string
          p_preferred_date?: string
          p_preferred_time?: string
          p_professional_id: string
          p_requirements?: string
          p_service_id?: string
          p_submit?: boolean
          p_title: string
        }
        Returns: string
      }
      customer_quotation_decision: {
        Args: { p_decision: string; p_note?: string; p_quotation_id: string }
        Returns: {
          accepted_snapshot: Json | null
          created_at: string
          currency: string
          customer_id: string
          customer_note: string | null
          decided_at: string | null
          deposit_percent: number
          discount_cents: number
          estimated_duration_minutes: number | null
          exclusions: string | null
          id: string
          notes: string | null
          payment_terms: string | null
          previous_quote_id: string | null
          professional_id: string
          proposed_start: string | null
          quote_number: string
          request_id: string
          revision: number
          scope_of_work: string
          sent_at: string | null
          status: string
          subtotal_cents: number
          tax_cents: number
          tax_rate_bp: number
          title: string
          total_cents: number
          updated_at: string
          valid_until: string
          viewed_at: string | null
          warranty_terms: string | null
        }
        SetofOptions: {
          from: "*"
          to: "quotations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      dashboard_counts: { Args: never; Returns: Json }
      effective_plan: {
        Args: { p_professional_id: string }
        Returns: {
          billing_interval: string
          code: string
          currency: string
          description: string | null
          features: string[]
          is_active: boolean
          max_active_services: number | null
          name: string
          price_cents: number
          sort_order: number
        }
        SetofOptions: {
          from: "*"
          to: "subscription_plans"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      escape_like: { Args: { p: string }; Returns: string }
      expire_stale_records: { Args: never; Returns: Json }
      get_available_slots: {
        Args: {
          p_duration_minutes: number
          p_from: string
          p_professional_id: string
          p_to: string
        }
        Returns: string[]
      }
      get_professional_reviews: {
        Args: { p_limit?: number; p_offset?: number; p_professional_id: string }
        Returns: {
          body: string
          created_at: string
          id: string
          rating: number
          reviewer_name: string
          service_name: string
          total_count: number
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      is_booking_party: { Args: { p_booking_id: string }; Returns: boolean }
      is_contract_party: { Args: { p_contract_id: string }; Returns: boolean }
      is_conversation_participant: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      is_published_professional: {
        Args: { p_professional_id: string }
        Returns: boolean
      }
      is_request_party: { Args: { p_request_id: string }; Returns: boolean }
      log_event: {
        Args: {
          p_action: string
          p_entity_id: string
          p_entity_type: string
          p_from?: string
          p_metadata?: Json
          p_to?: string
        }
        Returns: undefined
      }
      mark_all_notifications_read: { Args: never; Returns: undefined }
      mark_conversation_read: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      mark_quotation_viewed: {
        Args: { p_quotation_id: string }
        Returns: undefined
      }
      my_conversations: {
        Args: never
        Returns: {
          counterpart_avatar: string
          counterpart_is_professional: boolean
          counterpart_name: string
          id: string
          last_message: string
          last_message_at: string
          professional_id: string
          request_id: string
          request_title: string
          unread_count: number
        }[]
      }
      my_professional_id: { Args: never; Returns: string }
      notify: {
        Args: {
          p_body: string
          p_dedupe_key?: string
          p_link: string
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: undefined
      }
      payment_attach_checkout: {
        Args: {
          p_checkout_id: string
          p_checkout_url: string
          p_livemode: boolean
          p_payment_intent_id: string
          p_record_id: string
        }
        Returns: undefined
      }
      payment_mark_failed: {
        Args: { p_reason: string; p_record_id: string; p_status: string }
        Returns: undefined
      }
      payment_mark_paid: {
        Args: {
          p_amount_cents: number
          p_paid_at: string
          p_provider_payment_id: string
          p_record_id: string
        }
        Returns: {
          amount_cents: number
          booking_id: string
          checkout_url: string | null
          created_at: string
          currency: string
          customer_id: string
          failure_reason: string | null
          id: string
          livemode: boolean | null
          paid_at: string | null
          professional_id: string
          provider: string
          provider_checkout_id: string | null
          provider_payment_id: string | null
          provider_payment_intent_id: string | null
          purpose: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "payment_records"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      payment_prepare_checkout: {
        Args: { p_booking_id: string; p_user_id: string }
        Returns: {
          amount_cents: number
          booking_id: string
          checkout_url: string | null
          created_at: string
          currency: string
          customer_id: string
          failure_reason: string | null
          id: string
          livemode: boolean | null
          paid_at: string | null
          professional_id: string
          provider: string
          provider_checkout_id: string | null
          provider_payment_id: string | null
          provider_payment_intent_id: string | null
          purpose: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "payment_records"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      professional_user_id: {
        Args: { p_professional_id: string }
        Returns: string
      }
      refund_mark_result: {
        Args: {
          p_failure: string
          p_provider_refund_id: string
          p_refund_id: string
          p_status: string
        }
        Returns: undefined
      }
      require_active_user: { Args: never; Returns: string }
      require_admin: { Args: never; Returns: string }
      revise_quotation: { Args: { p_quotation_id: string }; Returns: string }
      search_professionals: {
        Args: {
          p_category?: string
          p_city?: string
          p_date?: string
          p_limit?: number
          p_max_price_cents?: number
          p_min_rating?: number
          p_offset?: number
          p_query?: string
          p_sort?: string
          p_verified_only?: boolean
        }
        Returns: {
          avatar_path: string
          business_name: string
          categories: string[]
          city: string
          cover_path: string
          display_name: string
          headline: string
          id: string
          last_active_at: string
          rating_avg: number
          review_count: number
          slug: string
          starting_price_cents: number
          total_count: number
          verification_status: string
          verified_kinds: string[]
        }[]
      }
      send_quotation: {
        Args: { p_quotation_id: string }
        Returns: {
          accepted_snapshot: Json | null
          created_at: string
          currency: string
          customer_id: string
          customer_note: string | null
          decided_at: string | null
          deposit_percent: number
          discount_cents: number
          estimated_duration_minutes: number | null
          exclusions: string | null
          id: string
          notes: string | null
          payment_terms: string | null
          previous_quote_id: string | null
          professional_id: string
          proposed_start: string | null
          quote_number: string
          request_id: string
          revision: number
          scope_of_work: string
          sent_at: string | null
          status: string
          subtotal_cents: number
          tax_cents: number
          tax_rate_bp: number
          title: string
          total_cents: number
          updated_at: string
          valid_until: string
          viewed_at: string | null
          warranty_terms: string | null
        }
        SetofOptions: {
          from: "*"
          to: "quotations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_profile_published: {
        Args: { p_publish: boolean }
        Returns: {
          avatar_path: string | null
          bio: string | null
          booking_window_days: number
          business_name: string | null
          certifications: string | null
          city: string | null
          cover_path: string | null
          created_at: string
          display_name: string
          faqs: Json
          headline: string | null
          id: string
          languages: string[]
          last_active_at: string
          licenses: string | null
          min_notice_hours: number
          province: string | null
          public_email: string | null
          public_phone: string | null
          published_at: string | null
          rating_avg: number | null
          review_count: number
          search_vector: unknown
          slot_minutes: number
          slug: string
          status: string
          timezone: string
          updated_at: string
          user_id: string
          verification_status: string
          verified_kinds: string[]
          working_hours_note: string | null
          years_experience: number | null
        }
        SetofOptions: {
          from: "*"
          to: "professional_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sign_contract: {
        Args: {
          p_consent: boolean
          p_contract_id: string
          p_signer_name: string
          p_version: number
        }
        Returns: {
          booking_id: string | null
          contract_number: string
          created_at: string
          current_version: number
          customer_id: string
          id: string
          professional_id: string
          quotation_id: string
          signed_at: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "contracts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      slugify: { Args: { p: string }; Returns: string }
      start_conversation: {
        Args: { p_professional_id: string }
        Returns: string
      }
      submit_review: {
        Args: { p_body: string; p_booking_id: string; p_rating: number }
        Returns: string
      }
      submit_verification: {
        Args: { p_details: string; p_document_paths: string[]; p_kind: string }
        Returns: string
      }
      today_manila: { Args: never; Returns: string }
      transition_service_request: {
        Args: { p_note?: string; p_request_id: string; p_to: string }
        Returns: {
          alternative_dates: string[]
          category_id: string | null
          created_at: string
          customer_id: string
          description: string
          id: string
          location_address: string | null
          location_city: string
          preferred_date: string | null
          preferred_time: string | null
          professional_id: string | null
          request_number: string
          requirements: string | null
          service_id: string | null
          status: string
          status_note: string | null
          submitted_at: string | null
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "service_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      try_uuid: { Args: { p: string }; Returns: string }
      webhook_event_begin: {
        Args: {
          p_event_id: string
          p_livemode: boolean
          p_payload: Json
          p_type: string
        }
        Returns: string
      }
      webhook_event_finish: {
        Args: { p_error: string; p_event_id: string }
        Returns: undefined
      }
      withdraw_quotation: {
        Args: { p_quotation_id: string }
        Returns: {
          accepted_snapshot: Json | null
          created_at: string
          currency: string
          customer_id: string
          customer_note: string | null
          decided_at: string | null
          deposit_percent: number
          discount_cents: number
          estimated_duration_minutes: number | null
          exclusions: string | null
          id: string
          notes: string | null
          payment_terms: string | null
          previous_quote_id: string | null
          professional_id: string
          proposed_start: string | null
          quote_number: string
          request_id: string
          revision: number
          scope_of_work: string
          sent_at: string | null
          status: string
          subtotal_cents: number
          tax_cents: number
          tax_rate_bp: number
          title: string
          total_cents: number
          updated_at: string
          valid_until: string
          viewed_at: string | null
          warranty_terms: string | null
        }
        SetofOptions: {
          from: "*"
          to: "quotations"
          isOneToOne: true
          isSetofReturn: false
        }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
