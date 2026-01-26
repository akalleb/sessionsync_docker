CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS ouvidoria_tickets (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  camara_id uuid REFERENCES camaras(id) ON DELETE SET NULL,
  whatsapp_number text NOT NULL,
  nome text,
  assunto text,
  descricao text,
  status text NOT NULL DEFAULT 'novo',
  handled_by text NOT NULL DEFAULT 'ia',
  responsavel_id uuid REFERENCES profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ouvidoria_messages (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id uuid NOT NULL REFERENCES ouvidoria_tickets(id) ON DELETE CASCADE,
  from_type text NOT NULL,
  direction text NOT NULL,
  body text NOT NULL,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ouvidoria_tickets_camara_status ON ouvidoria_tickets(camara_id, status);
CREATE INDEX IF NOT EXISTS idx_ouvidoria_messages_ticket_created ON ouvidoria_messages(ticket_id, created_at);

ALTER TABLE ouvidoria_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ouvidoria_messages ENABLE ROW LEVEL SECURITY;

