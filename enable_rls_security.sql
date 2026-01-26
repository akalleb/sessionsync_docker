
-- Ativar extensão UUID se ainda não estiver ativa
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- 1. Habilitar RLS em todas as tabelas críticas
-- =============================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE camaras ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_embeddings ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 2. Políticas para 'camaras'
-- =============================================================================

-- Leitura: Pública (ou restrita a usuários logados, dependendo do requisito)
-- Assumindo que qualquer usuário autenticado pode ver a lista de câmaras para selecionar
CREATE POLICY "Câmaras visíveis para todos usuários autenticados" 
ON camaras FOR SELECT 
TO authenticated 
USING (true);

-- Edição: Apenas Super Admin ou Admin da própria câmara (se implementado)
-- Por segurança, começamos restritivo: apenas super_admin pode criar/editar câmaras
-- (Idealmente usar uma função auth.uid() -> user_roles -> 'super_admin')
-- Simplificação: Usuários autenticados não podem editar câmaras via cliente por padrão,
-- a menos que explicitamente permitido. Deixaremos fechado para escrita pública.

-- =============================================================================
-- 3. Políticas para 'profiles'
-- =============================================================================

-- Leitura: Usuário vê seu próprio perfil
CREATE POLICY "Usuário vê seu próprio perfil" 
ON profiles FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id);

-- Leitura: Admins veem perfis da mesma câmara
CREATE POLICY "Admins veem perfis da mesma câmara" 
ON profiles FOR SELECT 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM profiles AS my_profile 
    WHERE my_profile.user_id = auth.uid() 
    AND my_profile.camara_id = profiles.camara_id
    AND EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_roles.user_id = auth.uid() 
      AND user_roles.role IN ('admin', 'super_admin')
    )
  )
);

-- Leitura: Super Admin vê tudo
CREATE POLICY "Super Admin vê todos perfis" 
ON profiles FOR SELECT 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role = 'super_admin'
  )
);

-- Edição: Usuário edita seu próprio perfil
CREATE POLICY "Usuário edita seu próprio perfil" 
ON profiles FOR UPDATE 
TO authenticated 
USING (auth.uid() = user_id);

-- =============================================================================
-- 4. Políticas para 'sessions'
-- =============================================================================

-- Leitura: Usuários veem sessões da sua câmara
CREATE POLICY "Ver sessões da própria câmara" 
ON sessions FOR SELECT 
TO authenticated 
USING (
  camara_id IN (
    SELECT camara_id FROM profiles WHERE user_id = auth.uid()
  )
);

-- Escrita: Apenas usuários com permissão (admin/editor) da mesma câmara
CREATE POLICY "Criar/Editar sessões da própria câmara" 
ON sessions FOR ALL 
TO authenticated 
USING (
  camara_id IN (
    SELECT camara_id FROM profiles WHERE user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role IN ('admin', 'editor', 'super_admin')
  )
);

-- =============================================================================
-- 5. Políticas para 'user_roles'
-- =============================================================================

-- Leitura: Usuário vê suas próprias roles
CREATE POLICY "Ver próprias roles" 
ON user_roles FOR SELECT 
TO authenticated 
USING (user_id = auth.uid());

-- Leitura: Admins veem roles
CREATE POLICY "Admins veem roles" 
ON user_roles FOR SELECT 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM user_roles AS my_role
    WHERE my_role.user_id = auth.uid() 
    AND my_role.role IN ('admin', 'super_admin')
  )
);

-- =============================================================================
-- 6. Políticas para 'legal_documents' e embeddings
-- =============================================================================

-- Similar a sessions: ver e editar apenas da própria câmara
CREATE POLICY "Ver documentos da própria câmara" 
ON legal_documents FOR SELECT 
TO authenticated 
USING (
  camara_id IN (
    SELECT camara_id FROM profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Gerenciar documentos da própria câmara" 
ON legal_documents FOR ALL 
TO authenticated 
USING (
  camara_id IN (
    SELECT camara_id FROM profiles WHERE user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role IN ('admin', 'editor', 'super_admin')
  )
);

-- =============================================================================
-- FIM
-- =============================================================================
