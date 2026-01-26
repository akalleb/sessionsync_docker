const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // Service Role para ignorar RLS e poder escrever

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Credenciais do Supabase não encontradas (.env)');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function syncVereadores() {
  console.log('🔄 Iniciando sincronização de vereadores...');

  // 1. Buscar Perfis com cargo 'Vereador'
  console.log('📥 Buscando perfis de vereadores...');
  const { data: profiles, error: errProfiles } = await supabase
    .from('profiles')
    .select('*')
    .ilike('cargo', '%Vereador%');

  if (errProfiles) {
    console.error('❌ Erro ao buscar profiles:', errProfiles);
    return;
  }

  console.log(`✅ Encontrados ${profiles.length} perfis de vereadores.`);

  let added = 0;
  let updated = 0;
  let skipped = 0;

  for (const profile of profiles) {
    if (!profile.camara_id) {
      console.warn(`⚠️ Perfil ${profile.nome} ignorado: Sem camara_id.`);
      skipped++;
      continue;
    }

    // Tenta encontrar vereador existente pelo ID do usuário ou Nome + Câmara
    const { data: existing, error: errExist } = await supabase
        .from('vereadores')
        .select('*')
        .eq('camara_id', profile.camara_id)
        .ilike('nome', profile.nome)
        .maybeSingle();

    const vereadorData = {
        nome: profile.nome,
        nome_parlamentar: profile.nome, // Default para mesmo nome
        camara_id: profile.camara_id,
        ativo: profile.ativo !== false, // Default true se null
        user_id: profile.user_id, // Vincula com o ID de login
    };

    if (existing) {
        // Atualizar
        const { error: errUpdate } = await supabase
            .from('vereadores')
            .update(vereadorData)
            .eq('id', existing.id);
        
        if (errUpdate) console.error(`❌ Erro ao atualizar ${profile.nome}:`, errUpdate);
        else updated++;
    } else {
        // Inserir
        const { error: errInsert } = await supabase
            .from('vereadores')
            .insert(vereadorData);
        
        if (errInsert) console.error(`❌ Erro ao inserir ${profile.nome}:`, errInsert);
        else added++;
    }
  }

  console.log('------------------------------------------------');
  console.log(`🎉 Sincronização concluída!`);
  console.log(`➕ Adicionados: ${added}`);
  console.log(`✏️ Atualizados: ${updated}`);
  console.log(`⚠️ Ignorados: ${skipped}`);
}

syncVereadores();
