-- ==============================================================================
-- SCHEMA ATUALIZADO: OUVIDORIA COM IA E MULTI-TENANCY
-- ==============================================================================

-- 1. TABELA: Base de Conhecimento da Câmara
CREATE TABLE IF NOT EXISTS public.ouvidoria_knowledge_base (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camara_id uuid REFERENCES public.camaras(id) NOT NULL,
  conteudo text NOT NULL,
  updated_at timestamp with time zone DEFAULT now()
);

-- Habilitar RLS na Base de Conhecimento
ALTER TABLE public.ouvidoria_knowledge_base ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem ver e editar a base de conhecimento de sua camara" 
ON public.ouvidoria_knowledge_base 
FOR ALL 
USING (camara_id = (SELECT camara_id FROM public.profiles WHERE id = auth.uid()));

-- 2. UPDATE NA TABELA: Tickets
-- Primeiro checamos se a tabela existe
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ouvidoria_tickets') THEN
        -- Cria a tabela base se ela ainda não existir
        CREATE TABLE public.ouvidoria_tickets (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            camara_id uuid REFERENCES public.camaras(id),
            whatsapp_number text NOT NULL,
            nome text,
            assunto text,
            status text DEFAULT 'novo',
            handled_by text DEFAULT 'ia',
            created_at timestamp with time zone DEFAULT now(),
            updated_at timestamp with time zone DEFAULT now()
        );
        -- Habilitar RLS
        ALTER TABLE public.ouvidoria_tickets ENABLE ROW LEVEL SECURITY;
        CREATE POLICY "Admins veem ouvidoria de sua camara" 
        ON public.ouvidoria_tickets FOR ALL USING (camara_id = (SELECT camara_id FROM public.profiles WHERE id = auth.uid()));
    END IF;
END $$;

-- Adiciona as novas colunas à tabela de tickets
ALTER TABLE public.ouvidoria_tickets
ADD COLUMN IF NOT EXISTS tipo_manifestacao text,
ADD COLUMN IF NOT EXISTS resumo_ia text,
ADD COLUMN IF NOT EXISTS protocolo varchar(50) UNIQUE,
ADD COLUMN IF NOT EXISTS ia_session_active boolean DEFAULT true;

-- 3. UPDATE NA TABELA: Messages
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ouvidoria_messages') THEN
        CREATE TABLE public.ouvidoria_messages (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            ticket_id uuid REFERENCES public.ouvidoria_tickets(id) ON DELETE CASCADE,
            from_type text, -- 'cidadao', 'ia', 'admin'
            direction text, -- 'inbound', 'outbound'
            body text,
            raw_payload jsonb,
            lida boolean DEFAULT false,
            created_at timestamp with time zone DEFAULT now()
        );
        ALTER TABLE public.ouvidoria_messages ENABLE ROW LEVEL SECURITY;
        CREATE POLICY "Admins veem mensagens de sua camara" 
        ON public.ouvidoria_messages FOR ALL USING (
            ticket_id IN (SELECT id FROM public.ouvidoria_tickets WHERE camara_id = (SELECT camara_id FROM public.profiles WHERE id = auth.uid()))
        );
    END IF;
END $$;

-- 4. TABELA: Notificações Admin na tabela existente profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS whatsapp_notificacao text,
ADD COLUMN IF NOT EXISTS recebe_alertas_ouvidoria boolean DEFAULT false;

-- 5. Função e Trigger para gerar número de protocolo automaticamente
CREATE OR REPLACE FUNCTION generate_protocol_number()
RETURNS TRIGGER AS $$
DECLARE
    today_str text;
    seq_val int;
    new_protocol text;
BEGIN
    -- Gera uma string no formato YYYYMMDD
    today_str := to_char(CURRENT_DATE, 'YYYYMMDD');
    
    -- Se já tiver protocolo (ex: importação manual), não faz nada
    IF NEW.protocolo IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Pega o total de tickets do dia e soma 1
    SELECT COUNT(*) INTO seq_val 
    FROM public.ouvidoria_tickets 
    WHERE DATE(created_at) = CURRENT_DATE;
    
    seq_val := seq_val + 1;
    
    -- Formato final: YYYYMMDD-LP-000X
    new_protocol := today_str || '-OUV-' || LPAD(seq_val::text, 4, '0');
    
    NEW.protocolo := new_protocol;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_generate_protocol ON public.ouvidoria_tickets;
CREATE TRIGGER trigger_generate_protocol
BEFORE INSERT ON public.ouvidoria_tickets
FOR EACH ROW
EXECUTE FUNCTION generate_protocol_number();
