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
      camaras: {
        Row: {
          ativo: boolean
          cidade: string
          cnpj: string | null
          created_at: string
          email: string | null
          endereco: string | null
          estado: string
          id: string
          logo_url: string | null
          nome: string
          site: string | null
          telefone: string | null
          configuration: Json | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cidade: string
          cnpj?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          estado: string
          id?: string
          logo_url?: string | null
          nome: string
          site?: string | null
          telefone?: string | null
          configuration?: Json | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cidade?: string
          cnpj?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          estado?: string
          id?: string
          logo_url?: string | null
          nome?: string
          site?: string | null
          telefone?: string | null
          configuration?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      demo_requests: {
        Row: {
          camara_nome: string
          cidade: string
          created_at: string
          email: string
          estado: string
          id: string
          mensagem: string | null
          nome: string
          status: string
          telefone: string | null
          updated_at: string
        }
        Insert: {
          camara_nome: string
          cidade: string
          created_at?: string
          email: string
          estado: string
          id?: string
          mensagem?: string | null
          nome: string
          status?: string
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          camara_nome?: string
          cidade?: string
          created_at?: string
          email?: string
          estado?: string
          id?: string
          mensagem?: string | null
          nome?: string
          status?: string
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ativo: boolean
          avatar_url: string | null
          camara_id: string | null
          cargo: string | null
          created_at: string
          id: string
          nome: string
          telefone: string | null
          preferences: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          avatar_url?: string | null
          camara_id?: string | null
          cargo?: string | null
          created_at?: string
          id?: string
          nome: string
          telefone?: string | null
          preferences?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          avatar_url?: string | null
          camara_id?: string | null
          cargo?: string | null
          created_at?: string
          id?: string
          nome?: string
          telefone?: string | null
          preferences?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_camara_id_fkey"
            columns: ["camara_id"]
            isOneToOne: false
            referencedRelation: "camaras"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          audio_url: string | null
          blocks: Json | null
          camara_id: string | null
          created_at: string
          date: string
          duration: string | null
          final_minutes: string | null
          id: string
          status: string
          title: string
          transcript: string | null
          updated_at: string
          user_id: string
          youtube_url: string | null
        }
        Insert: {
          audio_url?: string | null
          blocks?: Json | null
          camara_id?: string | null
          created_at?: string
          date: string
          duration?: string | null
          final_minutes?: string | null
          id?: string
          status?: string
          title: string
          transcript?: string | null
          updated_at?: string
          user_id: string
          youtube_url?: string | null
        }
        Update: {
          audio_url?: string | null
          blocks?: Json | null
          camara_id?: string | null
          created_at?: string
          date?: string
          duration?: string | null
          final_minutes?: string | null
          id?: string
          status?: string
          title?: string
          transcript?: string | null
          updated_at?: string
          user_id?: string
          youtube_url?: string | null
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
          role?: Database["public"]["Enums"]["app_role"]
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
      get_user_camara_id: { Args: { _user_id: string }; Returns: string | null }
      has_role: {
        Args: {
          _user_id: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: boolean
      }
      same_camara: { Args: { _user_id: string }; Returns: boolean }
      manage_user_profile: {
        Args: {
          _user_id: string
          _nome: string
          _camara_id: string | null
          _cargo: string | null
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: Json
      }
    }
    Enums: {
      app_role: "super_admin" | "admin" | "editor" | "viewer"
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
      app_role: ["super_admin", "admin", "editor", "viewer"],
    },
  },
} as const
