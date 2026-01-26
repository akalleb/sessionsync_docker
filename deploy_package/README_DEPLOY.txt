
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
     2. Entre no ambiente virtual: `source /home/seu_usuario/nodevenv/seu_dominio/20/bin/activate` (o caminho varia, veja o comando no topo da tela do Node.js App).
     3. Vá para a pasta da app: `cd /home/seu_usuario/domains/seu_dominio/public_html`
     4. Rode: `npm install --production`
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
