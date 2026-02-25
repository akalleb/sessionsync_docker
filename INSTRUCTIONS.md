# Guia de Instalação e Deploy - SessionSync (Hostinger VPS)

Este guia descreve passo a passo como colocar o projeto em produção numa VPS Ubuntu 22.04 da Hostinger.

## 1. Preparação da VPS

Acesse sua VPS via SSH:
```bash
ssh root@seu_ip_vps
```

### Instalar Docker e Docker Compose
```bash
# Atualizar pacotes
sudo apt update && sudo apt upgrade -y

# Instalar pré-requisitos
sudo apt install -y ca-certificates curl gnupg lsb-release

# Adicionar chave GPG do Docker
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Adicionar repositório
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Instalar Docker Engine
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Verificar instalação
docker compose version
```

## 2. Configuração do Projeto

### Clonar o Repositório
```bash
cd /var/www
git clone https://github.com/seu-usuario/sessionsync_docker.git sessionsync
cd sessionsync
```

### Configurar Variáveis de Ambiente
Crie o arquivo `.env` na raiz (para Frontend e Docker Compose):
```bash
nano .env
```
Cole o conteúdo (exemplo):
```env
VITE_SUPABASE_URL=https://sua-url.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sua-chave-publica
VITE_BACKEND_URL=https://sessionsync.com.br/api
PORT=3001
```

Crie o arquivo `backend/.env` (para segredos do Backend):
```bash
nano backend/.env
```
Cole o conteúdo:
```env
OPENAI_API_KEY=sk-...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=...
# Outros segredos...
```

## 3. Certificados SSL (HTTPS)

Antes de iniciar os containers, precisamos gerar os certificados SSL, pois o Nginx está configurado para usá-los.

1. Pare qualquer serviço na porta 80 (se houver).
2. Instale o Certbot:
```bash
sudo apt install -y certbot
```
3. Gere os certificados (substitua pelo seu email e domínio):
```bash
sudo certbot certonly --standalone -d sessionsync.com.br -d www.sessionsync.com.br --email akalleb@tutamail.com --agree-tos --no-eff-email
```
Isso criará os arquivos em `/etc/letsencrypt/live/sessionsync.com.br/`.

**Nota:** Se o comando falhar porque o domínio não aponta para o IP, certifique-se de configurar o DNS (Tipo A) no painel da Hostinger para o IP da VPS.

## 4. Deploy

Dê permissão de execução ao script de deploy:
```bash
chmod +x deploy.sh
```

Execute o deploy:
```bash
./deploy.sh
```

O script irá:
1. Atualizar o código (git pull).
2. Construir as imagens (frontend e backend).
3. Iniciar os containers.
4. Limpar imagens antigas.

## 5. Verificação

Acesse `https://sessionsync.com.br` no navegador.
- O Frontend deve carregar.
- Rotas como `/api/health` devem responder (testar via curl ou navegador).

## Renovação Automática do SSL
O Certbot renova automaticamente, mas como estamos usando Docker, precisamos recarregar o Nginx após a renovação.
Adicione ao crontab (`crontab -e`):
```bash
0 3 * * * certbot renew --quiet --post-hook "cd /var/www/sessionsync && docker compose exec -T frontend nginx -s reload"
```
