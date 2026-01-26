-- 1. Remover funções antigas E tudo que depende delas (políticas antigas)
DROP FUNCTION IF EXISTS get_user_role(uuid) CASCADE;
DROP FUNCTION IF EXISTS get_user_camara_id(uuid) CASCADE;

-- 2. Criar função segura para verificar role (evita recursão em user_roles)
CREATE OR REPLACE FUNCTION get_user_role(target_user_id uuid)
RETURNS app_role
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT role FROM user_roles WHERE user_id = target_user_id LIMIT 1;
$$;

-- 3. Criar função segura para pegar camara_id (evita recursão em profiles)
CREATE OR REPLACE FUNCTION get_user_camara_id(target_user_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT camara_id FROM profiles WHERE user_id = target_user_id LIMIT 1;
$$;

-- 4. Remover políticas problemáticas (caso o CASCADE não tenha pego alguma ou para garantir limpeza)
DROP POLICY IF EXISTS "Admins veem roles" ON user_roles;
DROP POLICY IF EXISTS "Ver próprias roles" ON user_roles;
DROP POLICY IF EXISTS "Admins veem perfis da mesma câmara" ON profiles;
DROP POLICY IF EXISTS "Super Admin vê todos perfis" ON profiles;
DROP POLICY IF EXISTS "Admins e Super Admins veem todas roles" ON user_roles;

-- 5. Recriar políticas de user_roles usando a função
CREATE POLICY "Ver próprias roles" 
ON user_roles FOR SELECT 
TO authenticated 
USING (user_id = auth.uid());

CREATE POLICY "Admins e Super Admins veem todas roles" 
ON user_roles FOR SELECT 
TO authenticated 
USING (
  get_user_role(auth.uid()) IN ('admin', 'super_admin')
);

-- 6. Recriar políticas de profiles usando AS DUAS funções seguras
CREATE POLICY "Admins veem perfis da mesma câmara" 
ON profiles FOR SELECT 
TO authenticated 
USING (
  -- Admin vê perfil se o camara_id do perfil alvo for igual ao seu camara_id
  camara_id = get_user_camara_id(auth.uid())
  AND 
  get_user_role(auth.uid()) IN ('admin', 'super_admin')
);

CREATE POLICY "Super Admin vê todos perfis" 
ON profiles FOR SELECT 
TO authenticated 
USING (
  get_user_role(auth.uid()) = 'super_admin'
);
