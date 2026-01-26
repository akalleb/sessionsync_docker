import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase URL or Key in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createAdminUser() {
  const email = 'super@admin.com';
  const password = '123456';

  console.log(`Tentando criar usuário ${email}...`);

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        nome: 'Super Admin',
      },
    },
  });

  if (error) {
    console.error('Erro ao criar usuário:', error.message);
    // Se o erro for "User already registered", vamos tentar fazer login para confirmar que a senha bate
    if (error.message.includes('registered')) {
        console.log('Usuário já existe. Tentando login para verificar senha...');
        const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
            email,
            password
        });
        
        if (loginError) {
            console.error('Falha no login com a senha fornecida:', loginError.message);
            console.log('RECOMENDAÇÃO: Delete o usuário via SQL Editor do Supabase (delete from auth.users where email = ...) e rode este script novamente.');
        } else {
            console.log('Login bem sucedido! O usuário existe e a senha está correta.');
            console.log('User ID:', loginData.user.id);
        }
    }
  } else {
    console.log('Usuário criado com sucesso!');
    console.log('User ID:', data.user?.id);
    console.log('Verifique se o email precisa de confirmação no painel do Supabase.');
  }
}

createAdminUser();
