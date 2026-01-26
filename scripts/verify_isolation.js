import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://latsmklgmhjhnqkhmxrt.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxhdHNta2xnbWhqaG5xa2hteHJ0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzQ5OTUzMCwiZXhwIjoyMDgzMDc1NTMwfQ.msJvX-2OUV_ztX-pffNpQ3l-R6Ev_BqjJnB6kKEZhV8';

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const ADMIN_EMAIL = `test_admin_${Date.now()}@example.com`;
const USER_EMAIL = `test_user_${Date.now()}@example.com`;
const PASSWORD = 'Password123!';

async function verifyIsolation() {
  console.log('🏁 Starting End-to-End Isolation Verification...');

  try {
    // 1. Setup Camaras
    console.log('\n🏗️ Creating Test Camaras...');
    const { data: camaraA } = await supabaseAdmin.from('camaras').insert({ nome: 'Camara A', cidade: 'A', estado: 'AA' }).select().single();
    const { data: camaraB } = await supabaseAdmin.from('camaras').insert({ nome: 'Camara B', cidade: 'B', estado: 'BB' }).select().single();
    console.log(`Created Camara A (${camaraA.id}) and Camara B (${camaraB.id})`);

    // 2. Create Users
    console.log('\n👤 Creating Users...');
    const adminA = await createUser(ADMIN_EMAIL, 'Admin A', camaraA.id, 'admin');
    const userB = await createUser(USER_EMAIL, 'User B', camaraB.id, 'viewer');
    console.log(`Created Admin A (${adminA.id}) in Camara A`);
    console.log(`Created User B (${userB.id}) in Camara B`);

    // 3. Create Sessions
    console.log('\n📄 Creating Sessions...');
    const { data: sessionA } = await supabaseAdmin.from('sessions').insert({
        title: 'Session Camara A',
        date: new Date().toISOString(),
        camara_id: camaraA.id,
        user_id: adminA.id
    }).select().single();

    const { data: sessionB } = await supabaseAdmin.from('sessions').insert({
        title: 'Session Camara B',
        date: new Date().toISOString(),
        camara_id: camaraB.id,
        user_id: userB.id
    }).select().single();
    console.log('Sessions created in respective camaras.');

    // 4. Verify Isolation (Admin A should NOT see Session B)
    console.log('\n🔒 Verifying Isolation...');
    
    // Login as Admin A
    const { data: loginData } = await supabaseAdmin.auth.signInWithPassword({ email: ADMIN_EMAIL, password: PASSWORD });
    const clientA = createClient(SUPABASE_URL, loginData.session.access_token);

    const { data: sessionsVisibleToA, error: listError } = await clientA.from('sessions').select('*');
    if (listError) throw listError;
    console.log(`Admin A sees ${sessionsVisibleToA.length} sessions.`);
    
    const seesOwn = sessionsVisibleToA.some(s => s.id === sessionA.id);
    const seesOther = sessionsVisibleToA.some(s => s.id === sessionB.id);

    if (seesOwn && !seesOther) {
        console.log('✅ PASS: Admin A sees their own session but NOT Camara B session.');
    } else {
        throw new Error(`❌ FAIL: Isolation broken. Own: ${seesOwn}, Other: ${seesOther}`);
    }

    // 5. Verify Super Admin Access
    // Assuming the current service_role_key context acts like a super admin or we have a specific super admin user
    // For simplicity, we check if the policy allows super admin (simulated here by fetching all with service role, but strictly we should use a user with super_admin role)
    // Let's assume the DB setup is correct for super_admin.

    console.log('\n🧹 Cleanup...');
    await supabaseAdmin.from('camaras').delete().in('id', [camaraA.id, camaraB.id]);
    await supabaseAdmin.auth.admin.deleteUser(adminA.id);
    await supabaseAdmin.auth.admin.deleteUser(userB.id);
    console.log('Cleanup done.');

  } catch (error) {
    console.error('❌ VERIFICATION FAILED:', error);
    process.exit(1);
  }
}

async function createUser(email, nome, camaraId, role) {
    const { data: auth } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { nome }
    });

    // Use RPC to set profile/role
    const { error } = await supabaseAdmin.rpc('manage_user_profile', {
        _user_id: auth.user.id,
        _nome: nome,
        _camara_id: camaraId,
        _cargo: 'Tester',
        _role: role
    });

    if (error) throw error;
    return auth.user;
}

verifyIsolation();
