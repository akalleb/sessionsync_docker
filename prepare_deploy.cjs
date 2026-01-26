const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const DEPLOY_DIR = path.join(__dirname, 'deploy_package');
const DIST_DIR = path.join(__dirname, 'dist');
const BACKEND_DIR = path.join(__dirname, 'backend');

console.log('🚀 Iniciando preparação para deploy no DirectAdmin...');

// 1. Build Frontend
console.log('📦 Construindo Frontend (Vite)...');
try {
    execSync('npm run build', { stdio: 'inherit' });
} catch (e) {
    console.error('❌ Erro no build do frontend.');
    process.exit(1);
}

// 2. Create Deploy Directory
console.log('📂 Criando diretório do pacote...');
if (fs.existsSync(DEPLOY_DIR)) {
    fs.rmSync(DEPLOY_DIR, { recursive: true, force: true });
}
fs.mkdirSync(DEPLOY_DIR);

// 3. Copy Backend Files (Root of deploy)
console.log('📋 Copiando arquivos do Backend...');
const backendFiles = fs.readdirSync(BACKEND_DIR);
const ignoreBackend = ['node_modules', 'package-lock.json', '.env', 'yt-dlp.exe']; // yt-dlp will be downloaded or handled by server

backendFiles.forEach(file => {
    if (ignoreBackend.includes(file)) return;
    
    const src = path.join(BACKEND_DIR, file);
    const dest = path.join(DEPLOY_DIR, file);
    
    if (fs.lstatSync(src).isDirectory()) {
        fs.cpSync(src, dest, { recursive: true });
    } else {
        fs.copyFileSync(src, dest);
    }
});

// 4. Copy Frontend Build to 'public' inside deploy
// DirectAdmin Node apps usually look for static files relative to root
console.log('📋 Copiando Frontend build para deploy/public...');
const publicDest = path.join(DEPLOY_DIR, 'public');
fs.mkdirSync(publicDest);
fs.cpSync(DIST_DIR, publicDest, { recursive: true });

// 5. Adjust Package.json for Production
// We need to merge dependencies if needed, but usually backend deps are enough for server
// But we need to ensure the start script is correct
console.log('⚙️ Ajustando package.json...');
const backendPackage = require(path.join(BACKEND_DIR, 'package.json'));

const deployPackage = {
    ...backendPackage,
    scripts: {
        "start": "node index.js"
    },
    // Ensure engines if needed
    engines: {
        "node": ">=18.0.0"
    }
};

fs.writeFileSync(
    path.join(DEPLOY_DIR, 'package.json'), 
    JSON.stringify(deployPackage, null, 2)
);

// NOTE: CloudLinux/NodeJS Selector forbids uploading node_modules.
// The server manages it via a virtual environment symlink.
console.log('⚠️ NOTA: Não instalando node_modules localmente (CloudLinux Requirement).');
console.log('   O servidor deve instalar as dependências via "Run NPM Install" ou SSH.');

// 6. Create instructions file
const instructions = `
# Instruções de Deploy - DirectAdmin (CloudLinux Node.js Selector)

⚠️ IMPORTANTE: NÃO ENVIE A PASTA 'node_modules'
O erro "Cloudlinux NodeJS Selector demands to store node modules..." ocorre se você enviar essa pasta.
O servidor gerencia as dependências automaticamente em uma pasta virtual.

PASSO A PASSO:

1. Acesse o DirectAdmin -> "Setup Node.js App".
2. Clique em "Create Application" (ou edite a existente).
3. Configurações:
   - Node.js Version: 20 ou superior (Recomendado para Supabase).
   - Application Mode: Production.
   - Application Root: /home/seu_usuario/domains/seu_dominio/public_html (ou pasta desejada).
   - Application Startup File: index.js.
4. Clique em "Create" / "Save".
5. Faça upload de TODO o conteúdo da pasta 'deploy_package' para a raiz da aplicação no servidor, EXCETO 'node_modules'.
   - O arquivo package.json É OBRIGATÓRIO.
6. Instalação de Dependências (CRUCIAL):
   - Opção A (Painel): No DirectAdmin, clique no botão "Run NPM Install".
   - Opção B (SSH - Recomendado se o botão falhar):
     1. Acesse via SSH.
     2. Entre no ambiente virtual: \`source /home/seu_usuario/nodevenv/seu_dominio/20/bin/activate\` (o caminho varia, veja o comando no topo da tela do Node.js App).
     3. Vá para a pasta da app: \`cd /home/seu_usuario/domains/seu_dominio/public_html\`
     4. Rode: \`npm install --production\`
7. Configure as Variáveis de Ambiente no painel (Environment Variables):
   - VITE_SUPABASE_URL=...
   - VITE_SUPABASE_PUBLISHABLE_KEY=...
   - OPENAI_API_KEY=...
   - ASSEMBLYAI_API_KEY=...
8. Reinicie a aplicação (Restart).

---------------------------------------------------------

# PROCESSO DE ATUALIZAÇÃO (UPDATES)

1. Gere um novo pacote localmente: 'node prepare_deploy.cjs'
2. No servidor, substitua os arquivos antigos pelos novos da pasta 'deploy_package', EXCETO 'node_modules'.
   - NÃO delete a pasta 'node_modules' do servidor.
   - Se houver novos arquivos ou mudanças no código, apenas sobrescreva.
3. Se você adicionou novas bibliotecas (package.json mudou):
   - Clique em "Run NPM Install" novamente no painel.
4. OBRIGATÓRIO: Clique em "Restart" no painel do DirectAdmin para aplicar as mudanças.

---------------------------------------------------------

DEBUG:
- Se der erro 503, verifique o log em 'stderr.log' na pasta da aplicação.
- Certifique-se de que a pasta 'public' (build do React) está junto com o index.js.
`;

fs.writeFileSync(path.join(DEPLOY_DIR, 'README_DEPLOY.txt'), instructions);

console.log('✅ Pacote de deploy criado com sucesso em: ' + DEPLOY_DIR);
console.log('📄 Leia o arquivo README_DEPLOY.txt dentro da pasta para instruções.');
