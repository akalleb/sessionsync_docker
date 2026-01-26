import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Carregar variáveis de ambiente do arquivo .env na raiz
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

// Configuração do ambiente
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('ERRO: A variável SUPABASE_SERVICE_ROLE_KEY não foi encontrada no arquivo .env.');
  console.error('Por favor, configure-a antes de executar este script.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function deleteAllUsersExcept(email) {
  console.log('\n--- Removendo todos os usuários (exceto o super admin) ---');

  const { data, error } = await supabase.auth.admin.listUsers();

  if (error) {
    console.error('Erro ao listar usuários:', error.message);
    return;
  }

  const usersToDelete = (data?.users || []).filter((user) => user.email !== email);

  for (const user of usersToDelete) {
    const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);
    if (deleteError) {
      console.error(`Erro ao excluir usuário ${user.email}:`, deleteError.message);
    } else {
      console.log(`Usuário removido: ${user.email}`);
    }
  }
}

async function createAdmin() {
  const email = 'akalleb@tutamail.com';
  const password = '123456';

  console.log(`\n--- Reiniciando usuários de autenticação ---`);
  await deleteAllUsersExcept(email);

  console.log(`\n--- Configurando Super Admin Local (${email}) ---`);

  // 1. Criar usuário na autenticação
  const { data, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nome: 'Super Admin Local' }
  });

  let userId;

  if (createError) {
    if (createError.message.toLowerCase().includes('already')) {
       console.log('Usuário já existe. Buscando ID...');
       const { data: { users } } = await supabase.auth.admin.listUsers();
       const existingUser = users.find(u => u.email === email);
       if (existingUser) {
         userId = existingUser.id;
       } else {
         console.error('Erro: Usuário diz que existe mas não foi encontrado na lista.');
         return;
       }
    } else {
      console.error('Erro ao criar usuário:', createError.message);
      return;
    }
  } else {
    userId = data.user.id;
    console.log('Usuário criado com sucesso! ID:', userId);
  }

  // 2. Atribuir role super_admin
  if (userId) {
    await assignRole(userId);
  }
}

async function assignRole(userId) {
  // Inserir ou garantir role super_admin
  const { error } = await supabase
    .from('user_roles')
    .upsert({ user_id: userId, role: 'super_admin' }, { onConflict: 'user_id, role' });

  if (error) {
    console.error('Erro ao atribuir role:', error.message);
  } else {
    console.log('Role [super_admin] atribuída com sucesso!');
  }

  // Remover outras roles (como viewer) para este usuário
  const { error: cleanupError } = await supabase
    .from('user_roles')
    .delete()
    .eq('user_id', userId)
    .neq('role', 'super_admin');

  if (cleanupError) {
    console.error('Erro ao limpar roles antigas:', cleanupError.message);
  }

  // Atualizar profile também (para garantir cargo visual)
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ cargo: 'Super Administrador' })
    .eq('user_id', userId);

  if (profileError) {
     console.error('Erro ao atualizar cargo no perfil:', profileError.message);
  } else {
     console.log('Perfil atualizado com cargo "Super Administrador".');
  }
}

createAdmin();
