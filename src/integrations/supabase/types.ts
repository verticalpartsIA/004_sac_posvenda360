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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          payload: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          payload?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          payload?: Json | null
        }
        Relationships: []
      }
      clientes: {
        Row: {
          ativo: boolean
          cidade: string | null
          cnpj: string
          contato: string | null
          created_at: string
          email: string | null
          estado: string | null
          id: string
          origem: string | null
          razao_social: string
          telefone: string | null
          tier: Database["public"]["Enums"]["customer_tier"] | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cidade?: string | null
          cnpj: string
          contato?: string | null
          created_at?: string
          email?: string | null
          estado?: string | null
          id?: string
          origem?: string | null
          razao_social: string
          telefone?: string | null
          tier?: Database["public"]["Enums"]["customer_tier"] | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cidade?: string | null
          cnpj?: string
          contato?: string | null
          created_at?: string
          email?: string | null
          estado?: string | null
          id?: string
          origem?: string | null
          razao_social?: string
          telefone?: string | null
          tier?: Database["public"]["Enums"]["customer_tier"] | null
          updated_at?: string
        }
        Relationships: []
      }
      internal_tickets: {
        Row: {
          assigned_to: string | null
          closed_at: string | null
          code: string
          description: string | null
          id: string
          linked_customer: string | null
          linked_occurrence_id: string | null
          opened_at: string
          opened_by: string | null
          priority: Database["public"]["Enums"]["ticket_priority"]
          response: string | null
          sla_hours: number
          status: Database["public"]["Enums"]["internal_status"]
          subject: string
          target_department: Database["public"]["Enums"]["internal_dept"]
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          closed_at?: string | null
          code?: string
          description?: string | null
          id?: string
          linked_customer?: string | null
          linked_occurrence_id?: string | null
          opened_at?: string
          opened_by?: string | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          response?: string | null
          sla_hours?: number
          status?: Database["public"]["Enums"]["internal_status"]
          subject: string
          target_department: Database["public"]["Enums"]["internal_dept"]
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          closed_at?: string | null
          code?: string
          description?: string | null
          id?: string
          linked_customer?: string | null
          linked_occurrence_id?: string | null
          opened_at?: string
          opened_by?: string | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          response?: string | null
          sla_hours?: number
          status?: Database["public"]["Enums"]["internal_status"]
          subject?: string
          target_department?: Database["public"]["Enums"]["internal_dept"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_tickets_linked_occurrence_id_fkey"
            columns: ["linked_occurrence_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      nps_records: {
        Row: {
          category: Database["public"]["Enums"]["nps_category"]
          cliente_id: string | null
          comentario: string | null
          created_at: string
          customer: string
          customer_tier: Database["public"]["Enums"]["customer_tier"] | null
          id: string
          q1_recomendacao: number
          q2_resolucao: number
          q3_agilidade: number
          survey_date: string
          ticket_id: string | null
          trigger: string | null
        }
        Insert: {
          category: Database["public"]["Enums"]["nps_category"]
          cliente_id?: string | null
          comentario?: string | null
          created_at?: string
          customer: string
          customer_tier?: Database["public"]["Enums"]["customer_tier"] | null
          id?: string
          q1_recomendacao: number
          q2_resolucao: number
          q3_agilidade: number
          survey_date?: string
          ticket_id?: string | null
          trigger?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["nps_category"]
          cliente_id?: string | null
          comentario?: string | null
          created_at?: string
          customer?: string
          customer_tier?: Database["public"]["Enums"]["customer_tier"] | null
          id?: string
          q1_recomendacao?: number
          q2_resolucao?: number
          q3_agilidade?: number
          survey_date?: string
          ticket_id?: string | null
          trigger?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nps_records_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nps_records_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos: {
        Row: {
          ativo: boolean
          categoria: string | null
          codigo: string
          created_at: string
          descricao: string
          fornecedor: string | null
          id: string
          origem: string | null
          preco: number | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria?: string | null
          codigo: string
          created_at?: string
          descricao: string
          fornecedor?: string | null
          id?: string
          origem?: string | null
          preco?: number | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria?: string | null
          codigo?: string
          created_at?: string
          descricao?: string
          fornecedor?: string | null
          id?: string
          origem?: string | null
          preco?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          departamento: string | null
          display_name: string | null
          id: string
          telefone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          departamento?: string | null
          display_name?: string | null
          id?: string
          telefone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          departamento?: string | null
          display_name?: string | null
          id?: string
          telefone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sla_config: {
        Row: {
          hours: number
          id: string
          priority: Database["public"]["Enums"]["ticket_priority"]
          updated_at: string
          warn_100_pct: boolean
          warn_50_pct: boolean
          warn_80_pct: boolean
        }
        Insert: {
          hours: number
          id?: string
          priority: Database["public"]["Enums"]["ticket_priority"]
          updated_at?: string
          warn_100_pct?: boolean
          warn_50_pct?: boolean
          warn_80_pct?: boolean
        }
        Update: {
          hours?: number
          id?: string
          priority?: Database["public"]["Enums"]["ticket_priority"]
          updated_at?: string
          warn_100_pct?: boolean
          warn_50_pct?: boolean
          warn_80_pct?: boolean
        }
        Relationships: []
      }
      ticket_messages: {
        Row: {
          attachments: Json | null
          author_id: string | null
          author_name: string | null
          body: string
          created_at: string
          id: string
          internal_ticket_id: string | null
          kind: Database["public"]["Enums"]["message_kind"]
          ticket_id: string | null
        }
        Insert: {
          attachments?: Json | null
          author_id?: string | null
          author_name?: string | null
          body: string
          created_at?: string
          id?: string
          internal_ticket_id?: string | null
          kind?: Database["public"]["Enums"]["message_kind"]
          ticket_id?: string | null
        }
        Update: {
          attachments?: Json | null
          author_id?: string | null
          author_name?: string | null
          body?: string
          created_at?: string
          id?: string
          internal_ticket_id?: string | null
          kind?: Database["public"]["Enums"]["message_kind"]
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_internal_ticket_id_fkey"
            columns: ["internal_ticket_id"]
            isOneToOne: false
            referencedRelation: "internal_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          acao_contencao:
            | Database["public"]["Enums"]["containment_action"][]
            | null
          assigned_to: string | null
          channel: Database["public"]["Enums"]["ticket_channel"]
          city: string | null
          cliente_id: string | null
          code: string
          created_at: string
          created_by: string | null
          custo_nao_qualidade: number | null
          customer: string
          customer_contato: string | null
          customer_doc: string | null
          customer_telefone: string | null
          fornecedor: string | null
          freight_cost_customer: number | null
          freight_cost_vp: number | null
          id: string
          nc_descricao: string | null
          nf_numero: string | null
          nf_valor: number | null
          nps: number | null
          nps_sent_at: string | null
          occurrence_reason: Database["public"]["Enums"]["occurrence_reason"]
          origin: Database["public"]["Enums"]["occurrence_origin"] | null
          part: string
          part_code: string
          priority: Database["public"]["Enums"]["ticket_priority"]
          produto_id: string | null
          quantity: number | null
          reason: string
          resolution_status:
            | Database["public"]["Enums"]["resolution_status"]
            | null
          resolved_at: string | null
          responsible_sector:
            | Database["public"]["Enums"]["responsible_sector"]
            | null
          ro_number: string | null
          root_cause: Database["public"]["Enums"]["root_cause"] | null
          sla_hours: number
          state: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          unit_value: number | null
          updated_at: string
          vendedor: string | null
          whatsapp_thread_id: string | null
        }
        Insert: {
          acao_contencao?:
            | Database["public"]["Enums"]["containment_action"][]
            | null
          assigned_to?: string | null
          channel?: Database["public"]["Enums"]["ticket_channel"]
          city?: string | null
          cliente_id?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          custo_nao_qualidade?: number | null
          customer: string
          customer_contato?: string | null
          customer_doc?: string | null
          customer_telefone?: string | null
          fornecedor?: string | null
          freight_cost_customer?: number | null
          freight_cost_vp?: number | null
          id?: string
          nc_descricao?: string | null
          nf_numero?: string | null
          nf_valor?: number | null
          nps?: number | null
          nps_sent_at?: string | null
          occurrence_reason?: Database["public"]["Enums"]["occurrence_reason"]
          origin?: Database["public"]["Enums"]["occurrence_origin"] | null
          part: string
          part_code: string
          priority?: Database["public"]["Enums"]["ticket_priority"]
          produto_id?: string | null
          quantity?: number | null
          reason: string
          resolution_status?:
            | Database["public"]["Enums"]["resolution_status"]
            | null
          resolved_at?: string | null
          responsible_sector?:
            | Database["public"]["Enums"]["responsible_sector"]
            | null
          ro_number?: string | null
          root_cause?: Database["public"]["Enums"]["root_cause"] | null
          sla_hours?: number
          state?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          unit_value?: number | null
          updated_at?: string
          vendedor?: string | null
          whatsapp_thread_id?: string | null
        }
        Update: {
          acao_contencao?:
            | Database["public"]["Enums"]["containment_action"][]
            | null
          assigned_to?: string | null
          channel?: Database["public"]["Enums"]["ticket_channel"]
          city?: string | null
          cliente_id?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          custo_nao_qualidade?: number | null
          customer?: string
          customer_contato?: string | null
          customer_doc?: string | null
          customer_telefone?: string | null
          fornecedor?: string | null
          freight_cost_customer?: number | null
          freight_cost_vp?: number | null
          id?: string
          nc_descricao?: string | null
          nf_numero?: string | null
          nf_valor?: number | null
          nps?: number | null
          nps_sent_at?: string | null
          occurrence_reason?: Database["public"]["Enums"]["occurrence_reason"]
          origin?: Database["public"]["Enums"]["occurrence_origin"] | null
          part?: string
          part_code?: string
          priority?: Database["public"]["Enums"]["ticket_priority"]
          produto_id?: string | null
          quantity?: number | null
          reason?: string
          resolution_status?:
            | Database["public"]["Enums"]["resolution_status"]
            | null
          resolved_at?: string | null
          responsible_sector?:
            | Database["public"]["Enums"]["responsible_sector"]
            | null
          ro_number?: string | null
          root_cause?: Database["public"]["Enums"]["root_cause"] | null
          sla_hours?: number
          state?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          unit_value?: number | null
          updated_at?: string
          vendedor?: string | null
          whatsapp_thread_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_messages: {
        Row: {
          id: string
          instance: string
          remote_jid: string
          push_name: string | null
          from_me: boolean
          message_id: string | null
          body: string
          media_type: string | null
          media_url: string | null
          ticket_id: string | null
          raw: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          instance?: string
          remote_jid: string
          push_name?: string | null
          from_me?: boolean
          message_id?: string | null
          body: string
          media_type?: string | null
          media_url?: string | null
          ticket_id?: string | null
          raw?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          instance?: string
          remote_jid?: string
          push_name?: string | null
          from_me?: boolean
          message_id?: string | null
          body?: string
          media_type?: string | null
          media_url?: string | null
          ticket_id?: string | null
          raw?: Json | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "operador" | "gestor" | "admin" | "qualidade"
      containment_action:
        | "sucatear"
        | "retrabalhar"
        | "segregar"
        | "liberar_uso"
        | "devolver_fornecedor"
        | "outro"
      customer_tier: "A" | "B" | "C"
      internal_dept:
        | "comercial"
        | "expedicao"
        | "engenharia"
        | "producao"
        | "compras"
        | "qualidade"
      internal_status: "aberto" | "em_andamento" | "resolvido" | "cancelado"
      message_kind: "whatsapp" | "email" | "telefone" | "nota_interna"
      nps_category: "promotor" | "neutro" | "detrator"
      occurrence_origin: "interno" | "externo"
      occurrence_reason:
        | "devolucao_total"
        | "devolucao_parcial"
        | "reparo"
        | "troca"
        | "reclamacao"
        | "duvida_tecnica"
        | "outro"
      resolution_status: "em_analise" | "autorizado" | "recusado"
      responsible_sector:
        | "comercial"
        | "expedicao"
        | "engenharia"
        | "producao"
        | "compras"
        | "qualidade"
        | "nao_aplica"
      root_cause:
        | "venda"
        | "expedicao"
        | "engenharia"
        | "cliente"
        | "fornecedor"
      ticket_channel: "whatsapp" | "telefone" | "email" | "portal" | "manual"
      ticket_priority: "baixa" | "media" | "alta" | "critica"
      ticket_status:
        | "aberto"
        | "em_atendimento"
        | "aguardando_cliente"
        | "aguardando_interno"
        | "concluido"
        | "cancelado"
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
      app_role: ["operador", "gestor", "admin", "qualidade"],
      containment_action: [
        "sucatear",
        "retrabalhar",
        "segregar",
        "liberar_uso",
        "devolver_fornecedor",
        "outro",
      ],
      customer_tier: ["A", "B", "C"],
      internal_dept: [
        "comercial",
        "expedicao",
        "engenharia",
        "producao",
        "compras",
        "qualidade",
      ],
      internal_status: ["aberto", "em_andamento", "resolvido", "cancelado"],
      message_kind: ["whatsapp", "email", "telefone", "nota_interna"],
      nps_category: ["promotor", "neutro", "detrator"],
      occurrence_origin: ["interno", "externo"],
      occurrence_reason: [
        "devolucao_total",
        "devolucao_parcial",
        "reparo",
        "troca",
        "reclamacao",
        "duvida_tecnica",
        "outro",
      ],
      resolution_status: ["em_analise", "autorizado", "recusado"],
      responsible_sector: [
        "comercial",
        "expedicao",
        "engenharia",
        "producao",
        "compras",
        "qualidade",
        "nao_aplica",
      ],
      root_cause: ["venda", "expedicao", "engenharia", "cliente", "fornecedor"],
      ticket_channel: ["whatsapp", "telefone", "email", "portal", "manual"],
      ticket_priority: ["baixa", "media", "alta", "critica"],
      ticket_status: [
        "aberto",
        "em_atendimento",
        "aguardando_cliente",
        "aguardando_interno",
        "concluido",
        "cancelado",
      ],
    },
  },
} as const
