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
      accounts: {
        Row: {
          allow_posting: boolean
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          organization_id: string
          parent_id: string | null
          type: Database["public"]["Enums"]["account_type"]
          updated_at: string
        }
        Insert: {
          allow_posting?: boolean
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          parent_id?: string | null
          type: Database["public"]["Enums"]["account_type"]
          updated_at?: string
        }
        Update: {
          allow_posting?: boolean
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          parent_id?: string | null
          type?: Database["public"]["Enums"]["account_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_agents: {
        Row: {
          address: string | null
          code: string | null
          created_at: string
          created_by: string
          dni: string | null
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["agency_agent_kind"]
          notes: string | null
          organization_id: string
          phone: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          code?: string | null
          created_at?: string
          created_by?: string
          dni?: string | null
          email?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          kind: Database["public"]["Enums"]["agency_agent_kind"]
          notes?: string | null
          organization_id: string
          phone?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          code?: string | null
          created_at?: string
          created_by?: string
          dni?: string | null
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["agency_agent_kind"]
          notes?: string | null
          organization_id?: string
          phone?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agency_agents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_daily_closings: {
        Row: {
          cash_balance: number
          closed_at: string | null
          closed_by: string | null
          closing_date: string
          created_at: string
          created_by: string
          expected_amount: number
          id: string
          notes: string | null
          organization_id: string
          pending_amount: number
          received_amount: number
          status: string
          updated_at: string
        }
        Insert: {
          cash_balance?: number
          closed_at?: string | null
          closed_by?: string | null
          closing_date: string
          created_at?: string
          created_by?: string
          expected_amount?: number
          id?: string
          notes?: string | null
          organization_id: string
          pending_amount?: number
          received_amount?: number
          status?: string
          updated_at?: string
        }
        Update: {
          cash_balance?: number
          closed_at?: string | null
          closed_by?: string | null
          closing_date?: string
          created_at?: string
          created_by?: string
          expected_amount?: number
          id?: string
          notes?: string | null
          organization_id?: string
          pending_amount?: number
          received_amount?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_daily_closings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_game_types: {
        Row: {
          category: string
          created_at: string
          created_by: string
          enabled: boolean
          id: string
          name: string
          organization_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string
          enabled?: boolean
          id?: string
          name: string
          organization_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string
          enabled?: boolean
          id?: string
          name?: string
          organization_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_game_types_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_rendition_game_amounts: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          game_type_id: string
          id: string
          organization_id: string
          rendition_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string
          game_type_id: string
          id?: string
          organization_id: string
          rendition_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          game_type_id?: string
          id?: string
          organization_id?: string
          rendition_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_rendition_game_amounts_game_type_id_fkey"
            columns: ["game_type_id"]
            isOneToOne: false
            referencedRelation: "agency_game_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_rendition_game_amounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_rendition_game_amounts_rendition_id_fkey"
            columns: ["rendition_id"]
            isOneToOne: false
            referencedRelation: "agency_renditions"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_rendition_tickets: {
        Row: {
          created_at: string
          created_by: string
          id: string
          organization_id: string
          rendition_id: string
          ticket_number: string
          ticket_qr_payload: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string
          id?: string
          organization_id: string
          rendition_id: string
          ticket_number: string
          ticket_qr_payload?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          organization_id?: string
          rendition_id?: string
          ticket_number?: string
          ticket_qr_payload?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agency_rendition_tickets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_rendition_tickets_rendition_id_fkey"
            columns: ["rendition_id"]
            isOneToOne: false
            referencedRelation: "agency_renditions"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_rendition_payments: {
        Row: {
          amount: number
          cash_account_id: string | null
          cash_movement_id: string | null
          created_at: string
          created_by: string
          id: string
          notes: string | null
          organization_id: string
          payment_date: string
          reference: string | null
          rendition_id: string
        }
        Insert: {
          amount: number
          cash_account_id?: string | null
          cash_movement_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          organization_id: string
          payment_date?: string
          reference?: string | null
          rendition_id: string
        }
        Update: {
          amount?: number
          cash_account_id?: string | null
          cash_movement_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          organization_id?: string
          payment_date?: string
          reference?: string | null
          rendition_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_rendition_payments_cash_account_id_fkey"
            columns: ["cash_account_id"]
            isOneToOne: false
            referencedRelation: "cash_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_rendition_payments_cash_movement_id_fkey"
            columns: ["cash_movement_id"]
            isOneToOne: false
            referencedRelation: "cash_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_rendition_payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_rendition_payments_rendition_id_fkey"
            columns: ["rendition_id"]
            isOneToOne: false
            referencedRelation: "agency_renditions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_rendition_payments_rendition_org_fkey"
            columns: ["rendition_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "agency_renditions"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      agency_renditions: {
        Row: {
          agent_id: string
          amount_due: number
          closed_at: string | null
          created_at: string
          created_by: string
          capture_method: string
          draw_number: string | null
          game_period: string | null
          id: string
          notes: string | null
          organization_id: string
          period_end: string | null
          period_start: string | null
          reference: string | null
          rendition_date: string
          status: Database["public"]["Enums"]["agency_rendition_status"]
          updated_at: string
        }
        Insert: {
          agent_id: string
          amount_due: number
          closed_at?: string | null
          created_at?: string
          created_by?: string
          capture_method?: string
          draw_number?: string | null
          game_period?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          period_end?: string | null
          period_start?: string | null
          reference?: string | null
          rendition_date?: string
          status?: Database["public"]["Enums"]["agency_rendition_status"]
          updated_at?: string
        }
        Update: {
          agent_id?: string
          amount_due?: number
          closed_at?: string | null
          created_at?: string
          created_by?: string
          capture_method?: string
          draw_number?: string | null
          game_period?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          period_end?: string | null
          period_start?: string | null
          reference?: string | null
          rendition_date?: string
          status?: Database["public"]["Enums"]["agency_rendition_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_renditions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agency_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_renditions_agent_org_fkey"
            columns: ["agent_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "agency_agents"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "agency_renditions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_rendition_tickets_rendition_id_fkey"
            columns: ["id"]
            isOneToOne: false
            referencedRelation: "agency_rendition_tickets"
            referencedColumns: ["rendition_id"]
          },
          {
            foreignKeyName: "agency_rendition_game_amounts_rendition_id_fkey"
            columns: ["id"]
            isOneToOne: false
            referencedRelation: "agency_rendition_game_amounts"
            referencedColumns: ["rendition_id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          entity: string
          entity_id: string | null
          id: number
          organization_id: string
          payload: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: never
          organization_id: string
          payload?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: never
          organization_id?: string
          payload?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_accounts: {
        Row: {
          account_number: string | null
          bank_name: string | null
          created_at: string
          currency_code: string
          id: string
          is_active: boolean
          name: string
          organization_id: string
          type: Database["public"]["Enums"]["cash_account_type"]
          updated_at: string
        }
        Insert: {
          account_number?: string | null
          bank_name?: string | null
          created_at?: string
          currency_code?: string
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          type: Database["public"]["Enums"]["cash_account_type"]
          updated_at?: string
        }
        Update: {
          account_number?: string | null
          bank_name?: string | null
          created_at?: string
          currency_code?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          type?: Database["public"]["Enums"]["cash_account_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_movements: {
        Row: {
          amount: number
          cash_account_id: string
          created_at: string
          created_by: string
          description: string
          direction: Database["public"]["Enums"]["payment_direction"]
          id: string
          journal_entry_id: string | null
          movement_date: string
          organization_id: string
          payment_id: string | null
        }
        Insert: {
          amount: number
          cash_account_id: string
          created_at?: string
          created_by?: string
          description: string
          direction: Database["public"]["Enums"]["payment_direction"]
          id?: string
          journal_entry_id?: string | null
          movement_date: string
          organization_id: string
          payment_id?: string | null
        }
        Update: {
          amount?: number
          cash_account_id?: string
          created_at?: string
          created_by?: string
          description?: string
          direction?: Database["public"]["Enums"]["payment_direction"]
          id?: string
          journal_entry_id?: string | null
          movement_date?: string
          organization_id?: string
          payment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_movements_cash_account_id_fkey"
            columns: ["cash_account_id"]
            isOneToOne: false
            referencedRelation: "cash_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          address: string | null
          created_at: string
          display_name: string
          email: string | null
          id: string
          is_active: boolean
          notes: string | null
          organization_id: string
          phone: string | null
          tax_id: string | null
          type: Database["public"]["Enums"]["contact_type"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          display_name: string
          email?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          organization_id: string
          phone?: string | null
          tax_id?: string | null
          type?: Database["public"]["Enums"]["contact_type"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          display_name?: string
          email?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          organization_id?: string
          phone?: string | null
          tax_id?: string | null
          type?: Database["public"]["Enums"]["contact_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_centers: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_centers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_periods: {
        Row: {
          created_at: string
          end_date: string
          id: string
          name: string
          organization_id: string
          start_date: string
          status: Database["public"]["Enums"]["period_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          name: string
          organization_id: string
          start_date: string
          status?: Database["public"]["Enums"]["period_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          name?: string
          organization_id?: string
          start_date?: string
          status?: Database["public"]["Enums"]["period_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_periods_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          created_at: string
          created_by: string
          description: string
          entry_date: string
          entry_number: number
          fiscal_period_id: string | null
          id: string
          organization_id: string
          posted_at: string | null
          posted_by: string | null
          reference: string | null
          status: Database["public"]["Enums"]["journal_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          description: string
          entry_date: string
          entry_number: number
          fiscal_period_id?: string | null
          id?: string
          organization_id: string
          posted_at?: string | null
          posted_by?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["journal_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string
          entry_date?: string
          entry_number?: number
          fiscal_period_id?: string | null
          id?: string
          organization_id?: string
          posted_at?: string | null
          posted_by?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["journal_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_fiscal_period_id_fkey"
            columns: ["fiscal_period_id"]
            isOneToOne: false
            referencedRelation: "fiscal_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_lines: {
        Row: {
          account_id: string
          contact_id: string | null
          cost_center_id: string | null
          created_at: string
          credit: number
          debit: number
          description: string | null
          id: string
          journal_entry_id: string
        }
        Insert: {
          account_id: string
          contact_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          id?: string
          journal_entry_id: string
        }
        Update: {
          account_id?: string
          contact_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          id?: string
          journal_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_backup_settings: {
        Row: {
          organization_id: string
          recipient_email: string | null
          enabled: boolean
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          organization_id: string
          recipient_email?: string | null
          enabled?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          organization_id?: string
          recipient_email?: string | null
          enabled?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_backup_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_rendition_backup_outbox: {
        Row: {
          id: string
          organization_id: string
          rendition_id: string
          revision_no: number
          recipient_email: string
          subject: string
          text_body: string
          status: string
          attempt_count: number
          last_attempt_at: string | null
          sent_at: string | null
          last_error: string | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          rendition_id: string
          recipient_email: string
          subject: string
          text_body: string
          status?: string
          attempt_count?: number
          last_attempt_at?: string | null
          sent_at?: string | null
          last_error?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          rendition_id?: string
          revision_no?: number
          recipient_email?: string
          subject?: string
          text_body?: string
          status?: string
          attempt_count?: number
          last_attempt_at?: string | null
          sent_at?: string | null
          last_error?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_rendition_backup_outbox_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_rendition_backup_outbox_rendition_org_fkey"
            columns: ["rendition_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "agency_renditions"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      organization_member_permissions: {
        Row: {
          can_create_agents: boolean
          can_delete_agents: boolean
          can_create_renditions: boolean
          can_edit_renditions: boolean
          can_delete_renditions: boolean
          can_register_payments: boolean
          can_manage_backups: boolean
          created_at: string
          created_by: string | null
          organization_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          can_create_agents?: boolean
          can_delete_agents?: boolean
          can_create_renditions?: boolean
          can_edit_renditions?: boolean
          can_delete_renditions?: boolean
          can_register_payments?: boolean
          can_manage_backups?: boolean
          created_at?: string
          created_by?: string | null
          organization_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          can_create_agents?: boolean
          can_delete_agents?: boolean
          can_create_renditions?: boolean
          can_edit_renditions?: boolean
          can_delete_renditions?: boolean
          can_register_payments?: boolean
          can_manage_backups?: boolean
          created_at?: string
          created_by?: string | null
          organization_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_member_permissions_organization_id_user_id_fkey"
            columns: ["organization_id", "user_id"]
            isOneToOne: true
            referencedRelation: "organization_members"
            referencedColumns: ["organization_id", "user_id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          organization_id: string
          role: Database["public"]["Enums"]["organization_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          organization_id: string
          role?: Database["public"]["Enums"]["organization_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["organization_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string
          currency_code: string
          id: string
          legal_name: string | null
          name: string
          tax_id: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          currency_code?: string
          id?: string
          legal_name?: string | null
          name: string
          tax_id?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          currency_code?: string
          id?: string
          legal_name?: string | null
          name?: string
          tax_id?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          cash_account_id: string | null
          contact_id: string | null
          created_at: string
          created_by: string
          direction: Database["public"]["Enums"]["payment_direction"]
          id: string
          journal_entry_id: string | null
          notes: string | null
          organization_id: string
          payment_date: string
          purchase_bill_id: string | null
          reference: string | null
          sales_invoice_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          cash_account_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string
          direction: Database["public"]["Enums"]["payment_direction"]
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          organization_id: string
          payment_date: string
          purchase_bill_id?: string | null
          reference?: string | null
          sales_invoice_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          cash_account_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string
          direction?: Database["public"]["Enums"]["payment_direction"]
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          organization_id?: string
          payment_date?: string
          purchase_bill_id?: string | null
          reference?: string | null
          sales_invoice_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_cash_account_id_fkey"
            columns: ["cash_account_id"]
            isOneToOne: false
            referencedRelation: "cash_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_purchase_bill_id_fkey"
            columns: ["purchase_bill_id"]
            isOneToOne: false
            referencedRelation: "purchase_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_sales_invoice_id_fkey"
            columns: ["sales_invoice_id"]
            isOneToOne: false
            referencedRelation: "sales_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      purchase_bill_items: {
        Row: {
          bill_id: string
          created_at: string
          description: string
          id: string
          quantity: number
          tax_rate: number
          unit_price: number
        }
        Insert: {
          bill_id: string
          created_at?: string
          description: string
          id?: string
          quantity?: number
          tax_rate?: number
          unit_price?: number
        }
        Update: {
          bill_id?: string
          created_at?: string
          description?: string
          id?: string
          quantity?: number
          tax_rate?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_bill_items_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "purchase_bills"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_bills: {
        Row: {
          bill_number: string
          contact_id: string | null
          created_at: string
          created_by: string
          currency_code: string
          due_date: string | null
          id: string
          issue_date: string
          journal_entry_id: string | null
          notes: string | null
          organization_id: string
          status: Database["public"]["Enums"]["document_status"]
          subtotal: number
          tax_amount: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          bill_number: string
          contact_id?: string | null
          created_at?: string
          created_by?: string
          currency_code?: string
          due_date?: string | null
          id?: string
          issue_date: string
          journal_entry_id?: string | null
          notes?: string | null
          organization_id: string
          status?: Database["public"]["Enums"]["document_status"]
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Update: {
          bill_number?: string
          contact_id?: string | null
          created_at?: string
          created_by?: string
          currency_code?: string
          due_date?: string | null
          id?: string
          issue_date?: string
          journal_entry_id?: string | null
          notes?: string | null
          organization_id?: string
          status?: Database["public"]["Enums"]["document_status"]
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_bills_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_bills_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_bills_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_invoice_items: {
        Row: {
          created_at: string
          description: string
          id: string
          invoice_id: string
          quantity: number
          tax_rate: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          quantity?: number
          tax_rate?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          quantity?: number
          tax_rate?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "sales_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_invoices: {
        Row: {
          contact_id: string | null
          created_at: string
          created_by: string
          currency_code: string
          due_date: string | null
          id: string
          invoice_number: string
          issue_date: string
          journal_entry_id: string | null
          notes: string | null
          organization_id: string
          status: Database["public"]["Enums"]["document_status"]
          subtotal: number
          tax_amount: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          created_by?: string
          currency_code?: string
          due_date?: string | null
          id?: string
          invoice_number: string
          issue_date: string
          journal_entry_id?: string | null
          notes?: string | null
          organization_id: string
          status?: Database["public"]["Enums"]["document_status"]
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          created_by?: string
          currency_code?: string
          due_date?: string | null
          id?: string
          invoice_number?: string
          issue_date?: string
          journal_entry_id?: string | null
          notes?: string | null
          organization_id?: string
          status?: Database["public"]["Enums"]["document_status"]
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_invoices_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_invoices_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bootstrap_organization: {
        Args: {
          p_legal_name?: string
          p_name: string
          p_start_date?: string
          p_tax_id?: string
        }
        Returns: string
      }
      close_agency_day: {
        Args: {
          p_closing_date: string
          p_notes?: string
          p_organization_id: string
        }
        Returns: string
      }
      add_organization_member_by_email: {
        Args: {
          p_email: string
          p_organization_id: string
        }
        Returns: string
      }
      list_organization_members_for_owner: {
        Args: {
          p_organization_id: string
        }
        Returns: {
          can_create_agents: boolean
          can_delete_agents: boolean
          can_create_renditions: boolean
          can_edit_renditions: boolean
          can_delete_renditions: boolean
          can_register_payments: boolean
          can_manage_backups: boolean
          email: string
          full_name: string
          role: Database["public"]["Enums"]["organization_role"]
          user_id: string
        }[]
      }
      create_agency_agent: {
        Args: {
          p_address?: string
          p_code?: string
          p_dni?: string
          p_full_name: string
          p_kind: Database["public"]["Enums"]["agency_agent_kind"]
          p_notes?: string
          p_organization_id: string
          p_phone?: string
          p_whatsapp?: string
        }
        Returns: string
      }
      create_agency_rendition: {
        Args: {
          p_agent_id: string
          p_amount_due: number
          p_game_breakdown?: Json
          p_ticket_numbers?: Json
          p_notes?: string
          p_organization_id: string
          p_period_end: string
          p_period_start: string
          p_reference?: string
          p_rendition_date: string
        }
        Returns: string
      }
      create_agency_rendition_with_capture: {
        Args: {
          p_agent_id: string
          p_amount_due: number
          p_capture_method?: string
          p_draw_number?: string | null
          p_game_breakdown?: Json
          p_game_period?: string | null
          p_notes?: string
          p_organization_id: string
          p_reference?: string
          p_rendition_date: string
          p_ticket_numbers?: Json
          p_ticket_qr_payload?: string | null
        }
        Returns: string
      }
      create_cash_movement: {
        Args: {
          p_amount: number
          p_cash_account_id: string
          p_description: string
          p_direction: Database["public"]["Enums"]["payment_direction"]
          p_movement_date: string
          p_organization_id: string
        }
        Returns: string
      }
      create_draft_journal_entry: {
        Args: {
          p_description: string
          p_entry_date: string
          p_lines?: Json
          p_organization_id: string
          p_reference?: string
        }
        Returns: string
      }
      create_fiscal_period: {
        Args: {
          p_end_date: string
          p_name: string
          p_organization_id: string
          p_start_date: string
        }
        Returns: string
      }
      create_payment: {
        Args: {
          p_amount?: number
          p_cash_account_id: string
          p_contact_id: string
          p_direction?: Database["public"]["Enums"]["payment_direction"]
          p_notes?: string
          p_organization_id: string
          p_payment_date?: string
          p_purchase_bill_id?: string
          p_reference?: string
          p_sales_invoice_id?: string
        }
        Returns: string
      }
      create_purchase_bill: {
        Args: {
          p_bill_number: string
          p_contact_id: string
          p_due_date?: string
          p_issue_date: string
          p_item_description?: string
          p_notes?: string
          p_organization_id: string
          p_quantity?: number
          p_subtotal?: number
          p_tax_amount?: number
          p_tax_rate?: number
          p_unit_price?: number
        }
        Returns: string
      }
      create_sales_invoice: {
        Args: {
          p_contact_id: string
          p_due_date?: string
          p_invoice_number: string
          p_issue_date: string
          p_item_description?: string
          p_notes?: string
          p_organization_id: string
          p_quantity?: number
          p_subtotal?: number
          p_tax_amount?: number
          p_tax_rate?: number
          p_unit_price?: number
        }
        Returns: string
      }
      issue_purchase_bill: { Args: { p_bill_id: string }; Returns: boolean }
      issue_sales_invoice: { Args: { p_invoice_id: string }; Returns: boolean }
      post_journal_entry: { Args: { p_entry_id: string }; Returns: boolean }
      void_agency_rendition: {
        Args: {
          p_organization_id: string
          p_rendition_id: string
          p_reason?: string | null
        }
        Returns: string
      }
      update_agency_rendition_with_capture: {
        Args: {
          p_organization_id: string
          p_rendition_id: string
          p_rendition_date: string
          p_amount_due: number
          p_game_breakdown: Json
          p_ticket_numbers: Json
          p_ticket_qr_payload?: string | null
          p_game_period?: string | null
          p_draw_number?: string | null
          p_capture_method?: string
          p_reference?: string | null
          p_notes?: string | null
        }
        Returns: string
      }
      receive_agency_rendition: {
        Args: {
          p_amount: number
          p_cash_account_id: string
          p_notes?: string
          p_organization_id: string
          p_payment_date: string
          p_reference?: string
          p_rendition_id: string
        }
        Returns: string
      }
      record_agency_rendition: {
        Args: {
          p_agent_id: string
          p_amount_due: number
          p_amount_received?: number
          p_cash_account_id?: string
          p_notes?: string
          p_organization_id: string
          p_period_end: string
          p_period_start: string
          p_reference?: string
          p_rendition_date: string
        }
        Returns: string
      }
      set_member_role: {
        Args: {
          p_organization_id: string
          p_role: Database["public"]["Enums"]["organization_role"]
          p_user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      account_type: "asset" | "liability" | "equity" | "income" | "expense"
      agency_agent_kind: "subagent" | "ambulant"
      agency_rendition_status: "open" | "closed" | "void"
      cash_account_type: "cash" | "bank" | "digital_wallet"
      contact_type: "customer" | "vendor" | "employee" | "other"
      document_status: "draft" | "issued" | "paid" | "void"
      journal_status: "draft" | "posted" | "void"
      organization_role: "owner" | "admin" | "accountant" | "viewer"
      payment_direction: "incoming" | "outgoing"
      period_status: "open" | "closed"
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
    Enums: {
      account_type: ["asset", "liability", "equity", "income", "expense"],
      agency_agent_kind: ["subagent", "ambulant"],
      agency_rendition_status: ["open", "closed", "void"],
      cash_account_type: ["cash", "bank", "digital_wallet"],
      contact_type: ["customer", "vendor", "employee", "other"],
      document_status: ["draft", "issued", "paid", "void"],
      journal_status: ["draft", "posted", "void"],
      organization_role: ["owner", "admin", "accountant", "viewer"],
      payment_direction: ["incoming", "outgoing"],
      period_status: ["open", "closed"],
    },
  },
} as const
