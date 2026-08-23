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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      artifacts: {
        Row: {
          content: string | null
          created_at: string
          id: string
          kind: string
          language: string | null
          metadata: Json
          parent_id: string | null
          project_id: string | null
          thread_id: string | null
          title: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          kind?: string
          language?: string | null
          metadata?: Json
          parent_id?: string | null
          project_id?: string | null
          thread_id?: string | null
          title?: string
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          kind?: string
          language?: string | null
          metadata?: Json
          parent_id?: string | null
          project_id?: string | null
          thread_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "artifacts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artifacts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artifacts_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          new_data: Json | null
          old_data: Json | null
          performed_by: string | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          performed_by?: string | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          performed_by?: string | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          created_at: string
          id: string
          parts: Json
          role: string
          sdk_message_id: string | null
          text_content: string | null
          thread_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          parts?: Json
          role: string
          sdk_message_id?: string | null
          text_content?: string | null
          thread_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          parts?: Json
          role?: string
          sdk_message_id?: string | null
          text_content?: string | null
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          company: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          org_id: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          org_id?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          company?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          org_id?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          id: string
          name: string
          org_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          org_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_task_events: {
        Row: {
          action: string
          created_at: string
          detail: Json | null
          from_state: Database["public"]["Enums"]["dev_task_state"] | null
          id: string
          simulated: boolean
          task_id: string
          to_state: Database["public"]["Enums"]["dev_task_state"] | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          detail?: Json | null
          from_state?: Database["public"]["Enums"]["dev_task_state"] | null
          id?: string
          simulated?: boolean
          task_id: string
          to_state?: Database["public"]["Enums"]["dev_task_state"] | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          detail?: Json | null
          from_state?: Database["public"]["Enums"]["dev_task_state"] | null
          id?: string
          simulated?: boolean
          task_id?: string
          to_state?: Database["public"]["Enums"]["dev_task_state"] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dev_task_events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "dev_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_task_files: {
        Row: {
          change_type: string
          created_at: string
          id: string
          language: string | null
          new_content: string | null
          old_content: string | null
          path: string
          reason: string | null
          reverted: boolean
          task_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          change_type?: string
          created_at?: string
          id?: string
          language?: string | null
          new_content?: string | null
          old_content?: string | null
          path: string
          reason?: string | null
          reverted?: boolean
          task_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          change_type?: string
          created_at?: string
          id?: string
          language?: string | null
          new_content?: string | null
          old_content?: string | null
          path?: string
          reason?: string | null
          reverted?: boolean
          task_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dev_task_files_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "dev_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_tasks: {
        Row: {
          base_branch: string | null
          change_mode: Database["public"]["Enums"]["dev_change_mode"]
          created_at: string
          deployment: Json | null
          environment: string
          id: string
          plan: Json
          plan_approved_at: string | null
          plan_approved_by: string | null
          preview: Json | null
          repository: string | null
          request: string
          simulated: boolean
          state: Database["public"]["Enums"]["dev_task_state"]
          test_results: Json | null
          thread_id: string | null
          title: string
          updated_at: string
          user_id: string
          work_branch: string | null
        }
        Insert: {
          base_branch?: string | null
          change_mode?: Database["public"]["Enums"]["dev_change_mode"]
          created_at?: string
          deployment?: Json | null
          environment?: string
          id?: string
          plan?: Json
          plan_approved_at?: string | null
          plan_approved_by?: string | null
          preview?: Json | null
          repository?: string | null
          request: string
          simulated?: boolean
          state?: Database["public"]["Enums"]["dev_task_state"]
          test_results?: Json | null
          thread_id?: string | null
          title: string
          updated_at?: string
          user_id: string
          work_branch?: string | null
        }
        Update: {
          base_branch?: string | null
          change_mode?: Database["public"]["Enums"]["dev_change_mode"]
          created_at?: string
          deployment?: Json | null
          environment?: string
          id?: string
          plan?: Json
          plan_approved_at?: string | null
          plan_approved_by?: string | null
          preview?: Json | null
          repository?: string | null
          request?: string
          simulated?: boolean
          state?: Database["public"]["Enums"]["dev_task_state"]
          test_results?: Json | null
          thread_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          work_branch?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dev_tasks_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      line_items: {
        Row: {
          amount: number | null
          created_at: string
          description: string
          discount: number | null
          id: string
          proposal_id: string
          quantity: number
          rate: number
          sort_order: number
        }
        Insert: {
          amount?: number | null
          created_at?: string
          description: string
          discount?: number | null
          id?: string
          proposal_id: string
          quantity?: number
          rate?: number
          sort_order?: number
        }
        Update: {
          amount?: number | null
          created_at?: string
          description?: string
          discount?: number | null
          id?: string
          proposal_id?: string
          quantity?: number
          rate?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "line_items_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: string | null
          brand_font: string | null
          brand_primary_color: string | null
          brand_secondary_color: string | null
          created_at: string
          id: string
          industry: string | null
          logo_url: string | null
          name: string
          phone: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          brand_font?: string | null
          brand_primary_color?: string | null
          brand_secondary_color?: string | null
          created_at?: string
          id?: string
          industry?: string | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          brand_font?: string | null
          brand_primary_color?: string | null
          brand_secondary_color?: string | null
          created_at?: string
          id?: string
          industry?: string | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          department_id: string | null
          full_name: string | null
          id: string
          org_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          department_id?: string | null
          full_name?: string | null
          id?: string
          org_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          department_id?: string | null
          full_name?: string | null
          id?: string
          org_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          id: string
          instructions: string | null
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          instructions?: string | null
          name?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          instructions?: string | null
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      proposal_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          ip_address: string | null
          metadata: Json | null
          proposal_id: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          proposal_id: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          proposal_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposal_events_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_versions: {
        Row: {
          content: Json
          created_at: string
          id: string
          pricing: Json
          proposal_id: string
          version_number: number
        }
        Insert: {
          content?: Json
          created_at?: string
          id?: string
          pricing?: Json
          proposal_id: string
          version_number: number
        }
        Update: {
          content?: Json
          created_at?: string
          id?: string
          pricing?: Json
          proposal_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposal_versions_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposals: {
        Row: {
          client_id: string | null
          content: Json
          created_at: string
          department_id: string | null
          discount_total: number | null
          id: string
          notes: string | null
          org_id: string | null
          pricing: Json
          share_expires_at: string | null
          share_id: string | null
          share_password_hash: string | null
          status: Database["public"]["Enums"]["proposal_status"]
          subtotal: number | null
          tax_rate: number | null
          template_id: string | null
          title: string
          total: number | null
          updated_at: string
          user_id: string
          valid_until: string | null
          version_number: number
        }
        Insert: {
          client_id?: string | null
          content?: Json
          created_at?: string
          department_id?: string | null
          discount_total?: number | null
          id?: string
          notes?: string | null
          org_id?: string | null
          pricing?: Json
          share_expires_at?: string | null
          share_id?: string | null
          share_password_hash?: string | null
          status?: Database["public"]["Enums"]["proposal_status"]
          subtotal?: number | null
          tax_rate?: number | null
          template_id?: string | null
          title?: string
          total?: number | null
          updated_at?: string
          user_id: string
          valid_until?: string | null
          version_number?: number
        }
        Update: {
          client_id?: string | null
          content?: Json
          created_at?: string
          department_id?: string | null
          discount_total?: number | null
          id?: string
          notes?: string | null
          org_id?: string | null
          pricing?: Json
          share_expires_at?: string | null
          share_id?: string | null
          share_password_hash?: string | null
          status?: Database["public"]["Enums"]["proposal_status"]
          subtotal?: number | null
          tax_rate?: number | null
          template_id?: string | null
          title?: string
          total?: number | null
          updated_at?: string
          user_id?: string
          valid_until?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          category: Database["public"]["Enums"]["template_category"]
          created_at: string
          default_pricing_items: Json
          description: string | null
          id: string
          is_default: boolean
          name: string
          org_id: string | null
          sections: Json
          updated_at: string
          user_id: string | null
        }
        Insert: {
          category?: Database["public"]["Enums"]["template_category"]
          created_at?: string
          default_pricing_items?: Json
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          org_id?: string | null
          sections?: Json
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["template_category"]
          created_at?: string
          default_pricing_items?: Json
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          org_id?: string | null
          sections?: Json
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      threads: {
        Row: {
          created_at: string
          id: string
          pinned: boolean
          project_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          pinned?: boolean
          project_id?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          pinned?: boolean
          project_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "threads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_memories: {
        Row: {
          active: boolean
          content: string
          created_at: string
          id: string
          importance: number
          kind: Database["public"]["Enums"]["memory_kind"]
          source_thread_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          content: string
          created_at?: string
          id?: string
          importance?: number
          kind?: Database["public"]["Enums"]["memory_kind"]
          source_thread_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          content?: string
          created_at?: string
          id?: string
          importance?: number
          kind?: Database["public"]["Enums"]["memory_kind"]
          source_thread_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_memories_source_thread_id_fkey"
            columns: ["source_thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profile_summary: {
        Row: {
          created_at: string
          message_count: number
          summary: string
          updated_at: string
          user_id: string
          writing_style: string | null
        }
        Insert: {
          created_at?: string
          message_count?: number
          summary?: string
          updated_at?: string
          user_id: string
          writing_style?: string | null
        }
        Update: {
          created_at?: string
          message_count?: number
          summary?: string
          updated_at?: string
          user_id?: string
          writing_style?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_org_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hash_share_password: { Args: { _password: string }; Returns: string }
      verify_share_password: {
        Args: { _password: string; _share_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "agent"
      dev_change_mode: "conservative" | "balanced" | "refactor"
      dev_task_state:
        | "analyzing"
        | "awaiting_approval"
        | "creating_branch"
        | "editing_code"
        | "running_tests"
        | "fixing_errors"
        | "generating_preview"
        | "awaiting_review"
        | "approved"
        | "rejected"
        | "opening_pr"
        | "deploying"
        | "deployed"
        | "deploy_failed"
        | "rolled_back"
        | "cancelled"
      memory_kind: "preference" | "style" | "fact" | "correction" | "skill"
      proposal_status: "draft" | "sent" | "viewed" | "accepted" | "rejected"
      template_category:
        | "web_design"
        | "consulting"
        | "development"
        | "marketing"
        | "general"
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
      app_role: ["admin", "manager", "agent"],
      dev_change_mode: ["conservative", "balanced", "refactor"],
      dev_task_state: [
        "analyzing",
        "awaiting_approval",
        "creating_branch",
        "editing_code",
        "running_tests",
        "fixing_errors",
        "generating_preview",
        "awaiting_review",
        "approved",
        "rejected",
        "opening_pr",
        "deploying",
        "deployed",
        "deploy_failed",
        "rolled_back",
        "cancelled",
      ],
      memory_kind: ["preference", "style", "fact", "correction", "skill"],
      proposal_status: ["draft", "sent", "viewed", "accepted", "rejected"],
      template_category: [
        "web_design",
        "consulting",
        "development",
        "marketing",
        "general",
      ],
    },
  },
} as const
