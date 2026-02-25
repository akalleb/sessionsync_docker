-- Atualização de Políticas de Segurança (RLS) para Sessões
-- Objetivo: Restringir acesso de usuários comuns apenas às suas próprias sessões.
-- Admins veem todas as sessões da sua câmara.
-- Super Admins veem todas as sessões do sistema.

-- 1. Remover políticas antigas da tabela sessions para evitar conflitos
DROP POLICY IF EXISTS "Ver sessões da própria câmara" ON sessions;
DROP POLICY IF EXISTS "Criar/Editar sessões da própria câmara" ON sessions;
DROP POLICY IF EXISTS "Users can view sessions from their camara" ON sessions;
DROP POLICY IF EXISTS "Users can only see their own sessions" ON sessions;
DROP POLICY IF EXISTS "Acesso a Sessões" ON sessions;

-- 2. Habilitar RLS (garantia)
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- 3. Criar nova política unificada para SELECT, INSERT, UPDATE, DELETE
CREATE POLICY "Politica de Acesso a Sessões"
ON sessions
FOR ALL
TO authenticated
USING (
  -- Regra 1: O próprio usuário pode acessar suas sessões
  user_id = auth.uid()
  
  OR
  
  -- Regra 2: Admin pode acessar todas as sessões DA SUA CÂMARA
  (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
    AND
    camara_id IN (
      SELECT camara_id FROM profiles WHERE user_id = auth.uid()
    )
  )
  
  OR
  
  -- Regra 3: Super Admin pode acessar QUALQUER sessão
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'super_admin'
  )
);

-- Comentário:
-- Esta política substitui as anteriores. 
-- Usuários comuns (sem role admin/super_admin) só verão o que criaram (user_id = auth.uid()).
-- Admins verão tudo que pertence à câmara deles.
-- Super Admins têm acesso global.
