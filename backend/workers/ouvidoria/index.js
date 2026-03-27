require('dotenv').config({ path: '../../.env' });
const { createClient } = require('@supabase/supabase-js');
const wppconnect = require('@wppconnect-team/wppconnect');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const OpenAI = require('openai');
const path = require('path');
const express = require('express');
const cors = require('cors');

console.log("=========================================");
console.log("Iniciando Worker Multi-Tenant da Ouvidoria");
console.log("=========================================");

// --- Setup ---
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!supabaseUrl || !supabaseKey) {
    console.error("FATAL: Variáveis do Supabase não encontradas.");
    process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false }
});

const openaiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
if (!openaiKey) {
    console.error("FATAL: OPENROUTER_API_KEY (ou OPENAI_API_KEY) não encontrada.");
    process.exit(1);
}
const openai = new OpenAI({
    apiKey: openaiKey,
    ...(process.env.OPENROUTER_API_KEY && { baseURL: 'https://openrouter.ai/api/v1' }),
});
const LLM_MODEL_MINI = process.env.LLM_MODEL_MINI || 'openai/gpt-4o-mini';

// --- R2 Config ---
const r2Endpoint = process.env.R2_ACCOUNT_ID
    ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
    : process.env.R2_ENDPOINT;

const s3Client = new S3Client({
    region: 'auto',
    endpoint: r2Endpoint,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    },
});

// --- Estado Multi-Tenant ---
// Dicionário de sessões ativas: camaraId -> WPPClient
const activeClients = new Map();
// Cache temporário para o QR Code (camaraId -> { qr: string, timestamp: number })
const qrCodes = new Map();
// Contador de tentativas de QR por câmara (camaraId -> number)
const qrAttempts = new Map();
// Flag de exaustão de QR: se true, o worker não ficará tentando infinitamente
const qrExhausted = new Set();

// ==========================================
// SERVIDOR EXPRESS PARA API DO DASHBOARD
// ==========================================
const app = express();
app.use(cors());
app.use(express.json());
const PORT = 3005; // Porta isolada para este worker

// 1. Iniciar ou recuperar conexão do WhatsApp de uma Câmara
app.post('/api/whatsapp/start', async (req, res) => {
    const { camara_id } = req.body;
    if (!camara_id) return res.status(400).json({ error: "camara_id obrigatório" });

    // Se já existe e está pronto
    if (activeClients.has(camara_id)) {
        return res.json({ status: "already_connected" });
    }

    try {
        console.log(`[API] Iniciando WPPConnect para camara: ${camara_id}`);
        // Limpa QR antigo se tiver
        qrCodes.delete(camara_id);

        // Chamada assíncrona para iniciar, não bloqueamos o res.json
        startWhatsAppForCamara(camara_id);
        res.json({ status: "starting" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2. Chamar QR Code ou Status de uma Câmara
app.get('/api/whatsapp/status', (req, res) => {
    const { camara_id } = req.query;
    if (!camara_id) return res.status(400).json({ error: "camara_id obrigatório" });

    const client = activeClients.get(camara_id);
    const qrData = qrCodes.get(camara_id);

    if (client) {
        return res.json({ ready: true, hasQr: false, qr: null, exhausted: false });
    } else if (qrData) {
        return res.json({ ready: false, hasQr: true, qr: qrData.qr, exhausted: false });
    } else {
        const exhausted = qrExhausted.has(camara_id);
        return res.json({ ready: false, hasQr: false, qr: null, exhausted });
    }
});

// 3. Desconectar Câmara
app.post('/api/whatsapp/logout', async (req, res) => {
    const { camara_id } = req.body;
    if (!camara_id) return res.status(400).json({ error: "camara_id obrigatório" });

    const client = activeClients.get(camara_id);
    if (client) {
        try {
            await client.logout();
            await client.close();
        } catch (e) { console.error('Error logging out', e); }
        activeClients.delete(camara_id);
        qrCodes.delete(camara_id);
        res.json({ success: true });
    } else {
        res.json({ success: false, message: "not_connected" });
    }
});

// 4. Buscar Tickets (Bypass RLS)
app.get('/api/whatsapp/tickets', async (req, res) => {
    const { camara_id } = req.query;
    if (!camara_id) return res.status(400).json({ error: "camara_id obrigatório" });

    try {
        const { data, error } = await supabase
            .from('ouvidoria_tickets')
            .select('*')
            .eq('camara_id', camara_id)
            .order('updated_at', { ascending: false });

        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 5. Buscar Mensagens (Bypass RLS)
app.get('/api/whatsapp/messages', async (req, res) => {
    const { ticket_id } = req.query;
    if (!ticket_id) return res.status(400).json({ error: "ticket_id obrigatório" });

    try {
        const { data, error } = await supabase
            .from('ouvidoria_messages')
            .select('*')
            .eq('ticket_id', ticket_id)
            .order('created_at', { ascending: true });

        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => console.log(`Ouvidoria Worker API rodando na porta ${PORT}`));

// ==========================================
// FUNÇÕES CORE DO WPPCONNECT
// ==========================================
async function startWhatsAppForCamara(camaraId) {
    try {
        qrAttempts.set(camaraId, 0);
        qrExhausted.delete(camaraId);
        const client = await wppconnect.create({
            session: `camara_${camaraId}`,
            catchQR: (base64Qr, asciiQR) => {
                const current = (qrAttempts.get(camaraId) || 0) + 1;
                qrAttempts.set(camaraId, current);
                if (current > 50) {
                    console.warn(`[${camaraId}] Limite de tentativas de QR atingido (${current}). Aguardando novo comando de início.`);
                    qrCodes.delete(camaraId);
                    qrExhausted.add(camaraId);
                    return;
                }
                console.log(`[!] NOVO QR CODE GERADO PARA CAMARA ${camaraId}. Leia no Painel Admin. Tentativa ${current}`);
                qrCodes.set(camaraId, { qr: base64Qr, timestamp: Date.now() });
            },
            statusFind: (statusSession, session) => {
                console.log(`[${camaraId}] Status Session:`, statusSession);
                if (statusSession === 'isLogged' || statusSession === 'inChat') {
                    qrCodes.delete(camaraId);
                    // Não acessamos `client` aqui pois causa ReferenceError: Cannot access 'client' before initialization. 
                    // O cliente será salvo em activeClients logo após o await finalizar.
                }
            },
            headless: true,
            devtools: false,
            useChrome: true,
            debug: false,
            logQR: false,
            disableWelcome: true,
            autoClose: 0,
            folderNameToken: 'auth_info', // Define explicitamente a pasta base dos tokens
            puppeteerOptions: {
                // userDataDir não é mais necessário aqui, o WPPConnect gerencia internamente usando folderNameToken + session
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--no-first-run',
                    '--no-zygote',
                    '--single-process'
                ]
            }
        });

        console.log(`[${camaraId}] WhatsApp Client conectado!`);
        activeClients.set(camaraId, client);
        startMessageListener(client, camaraId);

    } catch (error) {
        console.error(`[${camaraId}] WPPConnect Create Error:`, error);
        qrCodes.delete(camaraId);
        activeClients.delete(camaraId);
    }
}

// Ouvinte Modificado para fluxo State Machine Determinístico (sem loop de IA)
function startMessageListener(client, camaraId) {
    client.onMessage(async (message) => {
        if (message.fromMe) return;
        if (message.isGroupMsg) return;
        if (message.from === 'status@broadcast') return;
        if (message.from.includes('@broadcast')) return; // ignorar mensagens de status/story

        // Ignorar mensagens que chegaram há mais de 2 minutos (evita spam ao ligar o bot e ler histórico não-lido)
        const currentTimestamp = Math.floor(Date.now() / 1000);
        if (message.timestamp && (currentTimestamp - message.timestamp > 120)) {
            console.log(`[${camaraId}] Ignorando mensagem antiga de ${message.from} (${currentTimestamp - message.timestamp}s de atraso)`);
            return;
        }

        try {
            const phone = message.from.replace('@c.us', '');
            const isMedia = message.isMedia || message.type === 'image' || message.type === 'video' || message.type === 'audio' || message.type === 'ptt' || message.type === 'document';

            let body = '';
            if (isMedia) {
                body = message.caption || '';
            } else {
                body = message.body || '';
            }

            const senderName = message.notifyName || phone;

            console.log(`[${camaraId}] Nova mensagem de ${phone}: ${body.substring(0, 30)}...`);

            // 1. Procurar Ticket Ativo (que não esteja fechado) pegando sempre o mais recente
            let { data: ticketsInfo, error: fetchErr } = await supabase
                .from('ouvidoria_tickets')
                .select('*')
                .eq('camara_id', camaraId)
                .eq('whatsapp_number', phone)
                .neq('status', 'fechado')
                .order('created_at', { ascending: false })
                .limit(1);

            if (fetchErr) {
                console.error("Erro buscando ticket:", fetchErr);
            }

            let ticket = ticketsInfo && ticketsInfo.length > 0 ? ticketsInfo[0] : null;
            let ticketId;
            let isNewTicket = false;

            // Se não tem ticket ativo, CRIAR NOVO no status 'triagem'
            if (!ticket) {
                console.log(`[${camaraId}] Criando novo ticket para ${phone}`);
                const { data: newTicket, error: createErr } = await supabase
                    .from('ouvidoria_tickets')
                    .insert({
                        camara_id: camaraId,
                        whatsapp_number: phone,
                        nome: senderName,
                        assunto: 'Atendimento Inicial',
                        status: 'triagem', // <--- STATE MACHINE: PASSO 1
                        handled_by: 'ia',
                        ia_session_active: true
                    })
                    .select()
                    .single();

                if (createErr) throw createErr;
                ticket = newTicket;
                ticketId = ticket.id;
                isNewTicket = true;

                // Enviar Saudação Oficial e Menu
                const greeting = `Olá, ${senderName}! A Ouvidoria da Câmara Municipal recebeu sua manifestação.\nPara garantir o acompanhamento, geramos o Protocolo nº *${ticket.protocolo}*.\n\nDe acordo com a Lei de Acesso à Informação (Lei nº 12.527/11) e a Lei de Defesa do Usuário do Serviço Público (Lei nº 13.460/17), nossa equipe analisará seu pedido e retornará em até 20 dias (prorrogáveis por mais 10, se necessário).\n\nPor favor, digite o *NÚMERO* da opção que melhor descreve sua manifestação:\n1 - Sugestão\n2 - Reclamação\n3 - Elogio\n4 - Denúncia\n5 - Solicitação`;
                await client.sendText(message.from, greeting);

                // Salvar outbound da saudação
                await supabase.from('ouvidoria_messages').insert([{
                    ticket_id: ticketId,
                    camara_id: camaraId,
                    from_type: 'ia',
                    direction: 'outbound',
                    body: greeting
                }]);
            } else {
                ticketId = ticket.id;
            }

            // --- PROCESSAMENTO DE MIDIA PARA CLOUDFLARE R2 ---
            let finalBody = body;

            if (isMedia) {
                try {
                    console.log(`[${camaraId}] Mídia detectada. Dando bypass para Cloudflare R2...`);
                    const buffer = await client.decryptFile(message);
                    let mimeType = message.mimetype || 'application/octet-stream';
                    let ext = mimeType.split('/')[1]?.split(';')[0] || 'bin';

                    if (message.type === 'ptt' || message.type === 'audio') ext = 'ogg';

                    // Padrão de URL unica
                    const fileName = `ouvidoria/${camaraId}/${phone}/${Date.now()}_${Math.floor(Math.random() * 1000)}.${ext}`;

                    console.log(`[${camaraId}] Fazendo upload no R2 para key: ${fileName}`);
                    const uploadParams = {
                        Bucket: process.env.R2_BUCKET_NAME,
                        Key: fileName,
                        Body: buffer,
                        ContentType: mimeType,
                    };

                    await s3Client.send(new PutObjectCommand(uploadParams));
                    console.log(`[${camaraId}] Upload Cloudflare R2 Concluído com Sucesso.`);

                    const publicDomain = process.env.R2_PUBLIC_URL;
                    const publicUrl = `${publicDomain}/${fileName}`;

                    finalBody = `${body}\n\n[MEDIA:${mimeType}] ${publicUrl}`.trim();
                } catch (e) {
                    console.error(`[${camaraId}] Erro ao baixar ou upar mídia p/ R2:`, e);
                    finalBody = `${body}\n\n[ERRO DOWNLOAD MÍDIA]`.trim();
                }
            }

            // 2. Salvar Sempre a Mensagem do Cidadão no Histórico (agora salva a URL do audio/video/foto junto com o texto)
            const { error: msgInboundErr } = await supabase.from('ouvidoria_messages').insert({
                ticket_id: ticketId,
                camara_id: camaraId,
                from_type: 'cidadao',
                direction: 'inbound',
                body: finalBody
            });
            if (msgInboundErr) console.error(`[${camaraId}] Erro ao salvar mensagem cidadao:`, msgInboundErr);

            // 3. Reativar sessão para tickets antigos que foram fechados ou dados como terminados
            if (!isNewTicket && ticket.status === 'novo' && !ticket.ia_session_active) {
                console.log(`[${camaraId}] Reativando sessão de IA para ticket ${ticketId}`);

                await supabase.from('ouvidoria_tickets').update({
                    status: 'triagem',
                    ia_session_active: true
                }).eq('id', ticketId);

                ticket.status = 'triagem';
                ticket.ia_session_active = true;

                const greeting = `Olá novamente, ${senderName}! A Ouvidoria da Câmara Municipal está à disposição.\nSeu Protocolo atualizado é o nº *${ticket.protocolo}*.\n\nPor favor, digite o *NÚMERO* da opção que melhor descreve sua nova manifestação:\n1 - Sugestão\n2 - Reclamação\n3 - Elogio\n4 - Denúncia\n5 - Solicitação`;
                await client.sendText(message.from, greeting);

                await supabase.from('ouvidoria_messages').insert([{
                    ticket_id: ticketId, camara_id: camaraId, from_type: 'ia', direction: 'outbound', body: greeting
                }]);

                return; // Já respondemos a saudação, não precisa avaliar a máquina de estados para essa primeira msg
            }

            // Se acabou de ser criado do zero, não avalia a mensagem inicial como opção de menu
            if (isNewTicket) return;

            // 4. Executar Lógica de State Machine APENAS se estiver com a IA
            const normalizedStatus = ticket.status === 'em_atendimento' ? 'triagem' : ticket.status;
            console.log(`[${camaraId}] Avaliando State Machine para Ticket ${ticketId}. Status Real: ${ticket.status}, Normalizado: ${normalizedStatus}, IA Ativa: ${ticket.ia_session_active}`);

            if (ticket.ia_session_active || normalizedStatus === 'triagem' || normalizedStatus === 'coleta') {

                if (normalizedStatus === 'triagem') {
                    const choice = body.trim();
                    const menuMap = {
                        '1': 'Sugestão',
                        '2': 'Reclamação',
                        '3': 'Elogio',
                        '4': 'Denúncia',
                        '5': 'Solicitação'
                    };

                    console.log(`[${camaraId}] Usuário escolheu a opção: '${choice}'`);

                    if (menuMap[choice]) {
                        const tipoEscolhido = menuMap[choice];

                        // Avança o estado para COLETA DE DADOS
                        await supabase.from('ouvidoria_tickets').update({
                            tipo_manifestacao: tipoEscolhido,
                            status: 'coleta'
                        }).eq('id', ticketId);

                        const msgColeta = `Você selecionou *${tipoEscolhido}*.\n\nPor favor, descreva em detalhes sua manifestação (o que ocorreu, local, data, envolvidos). Você pode enviar mensagens de texto (quantas quiser), ou até mesmo áudios, fotos ou vídeos.\n\nQuando finalizar de enviar TODOS os detalhes, digite a palavra *ENCERRAR* para que sua manifestação seja protocolada e enviada para análise.`;
                        await client.sendText(message.from, msgColeta);

                        const { error: msgOutboundErr1 } = await supabase.from('ouvidoria_messages').insert([{
                            ticket_id: ticketId, camara_id: camaraId, from_type: 'ia', direction: 'outbound', body: msgColeta
                        }]);
                        if (msgOutboundErr1) console.error(`[${camaraId}] Erro ao salvar msgOutbound1:`, msgOutboundErr1);
                    } else {
                        // Resposta Inválida
                        const msgErro = `Opção inválida.\nPor favor, digite apenas o *NÚMERO* correspondente:\n1 - Sugestão\n2 - Reclamação\n3 - Elogio\n4 - Denúncia\n5 - Solicitação`;
                        await client.sendText(message.from, msgErro);

                        const { error: msgOutboundErr2 } = await supabase.from('ouvidoria_messages').insert([{
                            ticket_id: ticketId, camara_id: camaraId, from_type: 'ia', direction: 'outbound', body: msgErro
                        }]);
                        if (msgOutboundErr2) console.error(`[${camaraId}] Erro ao salvar msgOutbound2:`, msgOutboundErr2);
                    }
                }
                else if (normalizedStatus === 'coleta') {
                    if (body.trim().toUpperCase() === 'ENCERRAR') {
                        // Encerra a Sessão da IA e passa a bola pro Humano
                        const msgFim = `Sua manifestação foi recebida e registrada com sucesso! Ela foi encaminhada ao setor responsável para o processamento interno.\n\nVocê será notificado por este mesmo canal quando houver uma movimentação ou resposta oficial.\nA Ouvidoria agradece a sua participação cidadã.`;
                        await client.sendText(message.from, msgFim);

                        const { error: msgOutboundErr3 } = await supabase.from('ouvidoria_messages').insert([{
                            ticket_id: ticketId, camara_id: camaraId, from_type: 'ia', direction: 'outbound', body: msgFim
                        }]);
                        if (msgOutboundErr3) console.error(`[${camaraId}] Erro ao salvar msgOutbound3:`, msgOutboundErr3);

                        await supabase.from('ouvidoria_tickets').update({
                            status: 'novo',
                            ia_session_active: false
                        }).eq('id', ticketId);

                        // Agora que o relato acabou, Aciona a IA (GPT-4o-mini) EM BACKGROUND APENAS PARA GERAR O RESUMO E NOTIFICAR ADM
                        // SOLICITACAO: IA Pausada completamente no final. Cidadão apenas manda e o admin lê manualmente.
                        // generateOuvidoriaSummary(ticket, client);
                        console.log(`[${camaraId}] Ticket encerrado. Geração de Resumo via GPT desativada.`);
                    } else {
                        // Apenas coleta calado (o db insert já rodou lá em cima)
                    }
                }
            }

        } catch (e) {
            console.error(`[${camaraId}] Erro processando msg:`, e);
        }
    });
}

// 4. IA Agora atua apenas como "Backoffice" gerando Resumo do relato finalizado
async function generateOuvidoriaSummary(ticket, client) {
    try {
        console.log(`Gerando Resumo de IA para o ticket ${ticket.id}...`);

        const { data: history } = await supabase
            .from('ouvidoria_messages')
            .select('body')
            .eq('ticket_id', ticket.id)
            .eq('from_type', 'cidadao') // Só leremos o que o cidadao falou
            .order('created_at', { ascending: true })
            .limit(30);

        if (!history || history.length === 0) return;

        const allUserInputs = history.map(h => h.body).join('\n---\n');

        const systemPrompt = `Você é um Analista de Ouvidoria Público.
Leia o relato completo enviado pelo cidadão via WhatsApp e gere um RESUMO CURTO de 1 (uma) única frase para o Painel Administrativo.
Retorne APENAS a string do resumo, sem aspas, sem labels, sem gracinhas. Seja direto e capturando o cerne do problema.`;

        const response = await openai.chat.completions.create({
            model: LLM_MODEL_MINI,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: "Relato:\n" + allUserInputs }
            ],
            temperature: 0.1,
            max_tokens: 100
        });

        const resumo = response.choices[0].message.content.trim().replace(/^"|"$/g, '');

        // Salvar o resumo no Ticket
        await supabase.from('ouvidoria_tickets').update({
            resumo_ia: resumo,
            updated_at: new Date().toISOString()
        }).eq('id', ticket.id);

        // Notificar Admins
        await notificarAdmins(ticket.camara_id, ticket.tipo_manifestacao || 'Generico', resumo, ticket.protocolo);

    } catch (e) {
        console.error("Erro gerando resumo da IA:", e);
    }
}

// Realtime Escutando Supabase (Respostas Humanas do Painel)
function startRealtimeListener() {
    console.log("Iniciando Realtime Listener Global...");

    supabase
        .channel('public:ouvidoria_messages')
        .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'ouvidoria_messages' },
            async (payload) => {
                const message = payload.new;

                if (message.direction === 'outbound' && message.from_type === 'admin') {
                    try {
                        const { data: ticket } = await supabase
                            .from('ouvidoria_tickets')
                            .select('whatsapp_number, camara_id')
                            .eq('id', message.ticket_id)
                            .single();

                        if (ticket) {
                            const client = activeClients.get(ticket.camara_id);
                            if (client) {
                                console.log(`[${ticket.camara_id}] Mandando resposta humana para ${ticket.whatsapp_number}`);
                                await client.sendText(`${ticket.whatsapp_number}@c.us`, message.body);
                            } else {
                                console.error(`[${ticket.camara_id}] Tentativa de enviar MSG por admin mas client não conectado.`);
                            }
                        }
                    } catch (e) { console.error("Erro no realtime:", e); }
                }
            })
        .subscribe();
}

async function notificarAdmins(camaraId, tipo, resumo, protocolo) {
    const { data: admins } = await supabase
        .from('profiles')
        .select('whatsapp_notificacao')
        .eq('camara_id', camaraId)
        .eq('recebe_alertas_ouvidoria', true)
        .not('whatsapp_notificacao', 'is', null);

    if (!admins) return;
    const client = activeClients.get(camaraId);
    if (!client) return;

    for (const admin of admins) {
        try {
            const num = admin.whatsapp_notificacao.replace(/\D/g, '');
            if (num) {
                const text = `🚨 *Nova Manifestação na Ouvidoria*\nProtocolo: ${protocolo}\nTipo: ${tipo}\n\nResumo gerado pela IA:\n_${resumo}_\n\nAcesse o painel do SessionSync para ver os detalhes.`;
                await client.sendText(`${num}@c.us`, text);
            }
        } catch (e) { }
    }
}

// ==========================================
// ROTINA DE ENCERRAMENTO POR INATIVIDADE (30 MIN)
// ==========================================
function startInactivityCron() {
    console.log("Iniciando Cron Job de inatividade (30min)...");
    
    // Roda a cada 5 minutos para checar inatividade
    setInterval(async () => {
        try {
            // Calcula timestamp de 30 minutos atrás
            const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

            // Busca tickets que não estão concluídos, cuja última atualização foi há mais de 30 min
            // e que ainda estão sob cuidado da IA (opcional: ou mesmo humanos se quiser forçar o fim)
            const { data: inactiveTickets, error } = await supabase
                .from('ouvidoria_tickets')
                .select('id, camara_id, whatsapp_number, status')
                .neq('status', 'concluido')
                .lt('updated_at', thirtyMinutesAgo);

            if (error) throw error;
            if (!inactiveTickets || inactiveTickets.length === 0) return;

            console.log(`[CRON] Encontrados ${inactiveTickets.length} tickets inativos. Encerrando...`);

            for (const ticket of inactiveTickets) {
                // 1. Atualiza o status para concluído
                await supabase.from('ouvidoria_tickets').update({
                    status: 'concluido',
                    ia_session_active: false,
                    updated_at: new Date().toISOString()
                }).eq('id', ticket.id);

                // 2. Envia mensagem de aviso via WhatsApp
                const client = activeClients.get(ticket.camara_id);
                const msgFim = `Seu atendimento foi encerrado por inatividade. Caso precise de mais alguma coisa, basta enviar uma nova mensagem! A Ouvidoria agradece o seu contato.`;

                if (client) {
                    try {
                        await client.sendText(`${ticket.whatsapp_number}@c.us`, msgFim);
                        
                        // 3. Salva a mensagem no histórico
                        await supabase.from('ouvidoria_messages').insert([{
                            ticket_id: ticket.id,
                            camara_id: ticket.camara_id,
                            from_type: 'ia',
                            direction: 'outbound',
                            body: msgFim
                        }]);
                    } catch (e) {
                        console.error(`[CRON] Erro ao enviar mensagem de inatividade para ${ticket.whatsapp_number}:`, e);
                    }
                }
            }

        } catch (error) {
            console.error("[CRON] Erro na verificação de inatividade:", error);
        }
    }, 5 * 60 * 1000); // 5 minutos
}

startRealtimeListener();
startInactivityCron();
