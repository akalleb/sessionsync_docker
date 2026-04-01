require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
let helmet = null;
try {
    helmet = require('helmet');
} catch (e) {
    console.warn('Helmet module not found, continuing without it:', e.message);
}
const rateLimit = require('express-rate-limit');
const { YoutubeTranscript } = require('@danielxceron/youtube-transcript');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const multer = require('multer');
const cron = require('node-cron');
const legalParser = require('./legalParser');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = require('docx');

// YTDlpWrap initialization - moved after imports
const YTDlpWrap = require('yt-dlp-wrap').default;
const ytDlpBinaryPath = path.join(__dirname, 'yt-dlp.exe'); // Windows fallback (used by ensureBinary)
let ytDlpWrap;
try {
    // Check if yt-dlp is in PATH
    const { execSync } = require('child_process');
    try {
        execSync('yt-dlp --version', { stdio: 'ignore' });
        console.log('System yt-dlp detected, using it.');
        ytDlpWrap = new YTDlpWrap('yt-dlp');
    } catch (e) {
        // Not in PATH, try local binary on Windows
        if (process.platform === 'win32' && fs.existsSync(ytDlpBinaryPath)) {
            ytDlpWrap = new YTDlpWrap(ytDlpBinaryPath);
        } else {
            // Let it try to download or use default
            ytDlpWrap = new YTDlpWrap();
        }
    }
} catch (e) {
    console.error('Error initializing yt-dlp:', e);
    ytDlpWrap = new YTDlpWrap(); // Fallback
}

const { PROMPTS } = require('./prompts');
const { runAgent } = require('./agent/index.js');

const {
    stripDiacritics,
    escapeRegex,
    applyNameMapPostProcessing,
    stripPlaceholders,
    ensureBinary,
} = require('./utils');

const { generateUploadUrl, deleteFile, getR2Client } = require('./r2Storage');
const { registerR2UploadEndpoint } = require('./r2UploadEndpoint');
const { PutBucketCorsCommand } = require('@aws-sdk/client-s3');

// ... (existing imports)

// Auto-configure R2 CORS on startup
const configureR2Cors = async () => {
    try {
        const client = getR2Client();
        const bucketName = process.env.R2_BUCKET_NAME;

        if (!client || !bucketName) {
            console.log('Skipping R2 CORS config: credentials missing');
            return;
        }

        console.log('Configuring CORS for R2 Bucket:', bucketName);

        const command = new PutBucketCorsCommand({
            Bucket: bucketName,
            CORSConfiguration: {
                CORSRules: [
                    {
                        AllowedHeaders: ['*'],
                        AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
                        AllowedOrigins: [
                            'https://sessionsync.com.br',
                            'http://localhost:8080',
                            'http://localhost:5173',
                            'https://*.supabase.co'
                        ],
                        ExposeHeaders: ['ETag'],
                        MaxAgeSeconds: 3600
                    }
                ]
            }
        });

        await client.send(command);
        console.log('R2 CORS configured successfully');
    } catch (e) {
        console.error('Failed to configure R2 CORS:', e.message);
    }
};

// Run CORS config on startup
configureR2Cors();

const { initWhatsApp, getWhatsAppStatus, sendWhatsAppMessage, logoutWhatsApp } = require('./ouvidoriaWhatsApp');

// Load env vars from backend/.env then root .env (backend overrides root)
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Debug logging for deployment
console.log('Current working directory:', process.cwd());
try {
    console.log('Contents of current directory:', fs.readdirSync(__dirname));
    console.log('Contents of node_modules:', fs.readdirSync(path.join(__dirname, 'node_modules')).slice(0, 10));
} catch (e) {
    console.log('Could not list directories:', e.message);
}

const app = express();
const port = process.env.PORT || 3001;
const isDev = process.env.NODE_ENV !== 'production';

app.set('trust proxy', 1);

if (helmet) {
    app.use(
        helmet({
            crossOriginResourcePolicy: { policy: 'cross-origin' },
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    connectSrc: [
                        "'self'",
                        "https://oshuwfkevodjmemcnyas.supabase.co",
                        "wss://oshuwfkevodjmemcnyas.supabase.co",
                        "https://api.openai.com",
                        "https://api.assemblyai.com",
                        "https://www.googleapis.com",
                        "https://*.r2.cloudflarestorage.com"
                    ],
                    scriptSrc: ["'self'", "'unsafe-inline'"],
                    styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
                    fontSrc: ["'self'", "https://fonts.gstatic.com"],
                    imgSrc: ["'self'", "data:", "https://oshuwfkevodjmemcnyas.supabase.co"],
                    mediaSrc: ["'self'", "https://*.r2.cloudflarestorage.com", "https://*.r2.dev"],
                    frameSrc: ["'self'", "https://www.youtube.com", "https://www.youtube-nocookie.com"],
                    childSrc: ["'self'", "https://www.youtube.com", "https://www.youtube-nocookie.com"],
                },
            },
        })
    );
}

// Security: Rate Limiter (Prevent Brute Force/DDoS)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200, // Production limit: 200 requests per 15 minutes per IP
    standardHeaders: true,
    legacyHeaders: false,
});
// Apply rate limiter to all requests
app.use(limiter);

// Multer config for memory storage (files processed in memory)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Security: Configure CORS
const allowedOrigins = [
    'http://localhost:8080',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://sessionsync.com.br',
    process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        if (allowedOrigins.indexOf(origin) === -1) {
            // Strict Mode: Block unknown origins in production
            if (isDev) {
                console.log(`CORS Allowed (Dev): ${origin}`);
                return callback(null, true);
            }
            console.error(`CORS Blocked: ${origin}`);
            var msg = 'The CORS policy for this site does not allow access from the specified Origin.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    }
}));

app.use(express.json({ limit: '50mb' })); // Increased limit for large transcripts

// Helper to get Supabase client with user's token (Moved to top)


// Middleware: Require Authentication
const requireAuth = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    try {
        const supabase = getSupabaseClient(authHeader);
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
            return res.status(401).json({ error: 'Unauthorized: Invalid token' });
        }

        req.user = user; // Attach user to request
        next();
    } catch (error) {
        console.error('Auth Middleware Error:', error);
        return res.status(500).json({ error: 'Internal Server Error during authentication' });
    }
};

// Health Check Endpoint (Public)
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date() });
});

registerR2UploadEndpoint(app);

// LLM Configuration - uses OpenRouter by default, falls back to OpenAI
const LLM_API_KEY = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
const LLM_BASE_URL = process.env.OPENROUTER_API_KEY
    ? 'https://openrouter.ai/api/v1'
    : undefined; // default OpenAI URL

const openai = new OpenAI({
    apiKey: LLM_API_KEY,
    ...(LLM_BASE_URL && { baseURL: LLM_BASE_URL }),
});

// Model names from env vars (OpenRouter format: provider/model)
const LLM_MODEL = process.env.LLM_MODEL || 'openai/gpt-4o';
const LLM_MODEL_MINI = process.env.LLM_MODEL_MINI || 'openai/gpt-4o-mini';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'openai/text-embedding-3-small';

// Helper to get Supabase client with user's token
const getSupabaseClient = (authHeader) => {
    const token = authHeader?.replace('Bearer ', '');
    return createClient(
        process.env.VITE_SUPABASE_URL,
        process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        {
            global: {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            },
        }
    );
};

let serviceSupabase = null;
const getServiceSupabase = () => {
    if (serviceSupabase) return serviceSupabase;

    let url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    let serviceKey =
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_SERVICE_KEY ||
        process.env.SUPABASE_SERVICE_ROLE ||
        process.env.SUPABASE_SERVICE ||
        process.env.SUPABASE_SECRET_KEY;

    if (typeof url === 'string') url = url.trim();
    if (typeof serviceKey === 'string') serviceKey = serviceKey.trim();

    if (!url || !serviceKey) return null;

    serviceSupabase = createClient(url, serviceKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        },
    });

    return serviceSupabase;
};

// Ensure binary exists (Imported from utils)


// --- Prompt Builders (Shared) ---
// const PROMPTS = ... (Already imported)



// (Imported from utils)


// --- Endpoints ---

// 1. Process Transcript (Segmentation)
app.post('/process-transcript', requireAuth, async (req, res) => {
    try {
        const { transcript } = req.body;
        // Auth check handled by middleware
        if (!transcript) return res.status(400).json({ error: 'Transcript is required' });

        const fullTranscript = typeof transcript === 'string' ? transcript : String(transcript);
        console.log(`Processing transcript segmentation... Length: ${fullTranscript.length} chars`);

        const systemPrompt = `Você é um assistente especializado em atas de câmaras municipais. 
            Sua tarefa é analisar a transcrição bruta de uma sessão e identificar onde cada bloco lógico começa e termina.
            Você DEVE dividir o texto em MÚLTIPLOS blocos, seguindo estritamente a Ordem Canônica abaixo.

            Ordem Canônica Fixa (Tipos de Blocos):
            1. cabecalho (Informações da sessão, datas, nomes - se constar no texto)
            2. abertura (Início dos trabalhos, oração, verificação de quórum, leitura da ata anterior)
            3. expediente (Leitura de ofícios, correspondências, requerimentos, indicações. Geralmente inicia com "Passa-se ao Expediente", "Leitura do Expediente", "Matérias lidas no expediente")
            4. explicacoes_pessoais (Pronunciamentos, Grande Expediente, fala livre dos vereadores. Geralmente inicia com "Grande Expediente", "Faculta a palavra" ou "Oradores inscritos", "Pronunciamentos")
            5. ordem_dia (Votação de projetos, discussão de leis. Geralmente inicia com "Ordem do Dia", "Passa-se à Ordem do Dia", "Na ordem do dia está em pauta". INCLUI 'Discussão da Pauta' e 'Despachos')
            6. votacao (Processo de votação e proclamação de resultados, se separado da Ordem do Dia. Frases: "Submeto em única votação", "Em votação", "Aprovado por unanimidade")
            7. encerramento (Encerramento da sessão. Geralmente inicia com "Nada mais havendo a tratar", "Declaro encerrada", "Levanta a sessão", "Não havendo mais nada a deliberar")

            Regras Críticas:
            - A divisão deve ser EXATA. O texto de um bloco termina ONDE O OUTRO COMEÇA.
            - "Ordem do Dia" contém "Discussão" e "Despachos". Não crie blocos separados para eles.
            - O "Expediente" contém a leitura de TODAS as matérias (projetos, requerimentos).
            - "Pronunciamentos" (ou Explicações Pessoais) é onde os vereadores discursam livremente.
            - Garanta que TODO o texto da transcrição esteja em algum bloco.
            - Se o texto começar abruptamente, coloque o início no 'cabecalho' ou 'abertura'.
            - IMPORTANTE: No campo 'start_text', copie EXATAMENTE os primeiros 50 a 100 caracteres do início do bloco, sem alterar nenhuma letra, pontuação ou maiúscula/minúscula. Isso será usado para localizar o trecho no texto original.

            Formato de Saída (JSON):
            Retorne APENAS um JSON com a seguinte estrutura:
            {
              "blocks": [
                {
                  "type": "tipo_do_bloco",
                  "title": "Título descritivo (ex: Abertura e Expediente Inicial)",
                  "start_text": "Trecho exato do início...",
                  "end_text": "...trecho exato do final",
                  "timestamp": "00:00:00"
                }
              ]
            }`;

        const completion = await openai.chat.completions.create({
            model: LLM_MODEL_MINI,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: fullTranscript }
            ],
            temperature: 0.1,
            response_format: { type: "json_object" }
        });

        const content = completion.choices[0].message.content;
        let extractedBlocks = [];

        try {
            const parsed = JSON.parse(content);
            extractedBlocks = Array.isArray(parsed.blocks) ? parsed.blocks : [];
        } catch (e) {
            console.error('Error parsing JSON:', e);
            return res.status(500).json({ error: 'Failed to parse AI response' });
        }

        if (!extractedBlocks || extractedBlocks.length === 0) {
            return res.json({
                blocks: [
                    {
                        id: `block-${Date.now()}-0`,
                        type: 'outros',
                        title: 'Transcrição completa',
                        content: fullTranscript.trim(),
                        timestamp: '00:00:00',
                        order: 0,
                    },
                ],
            });
        }

        const transcriptLower = fullTranscript.toLowerCase();

        // Refined Extraction Loop
        // 1. Locate starts with fuzzy fallback
        const blockStarts = extractedBlocks.map((block) => {
            let startIndex = fullTranscript.indexOf(block.start_text);

            // Fallback 1: Try finding just the first 50 chars
            if (startIndex === -1 && block.start_text) {
                const snippet = block.start_text.substring(0, 50);
                startIndex = fullTranscript.indexOf(snippet);
            }

            // Fallback 2: Try finding just the first 20 chars
            if (startIndex === -1 && block.start_text) {
                const snippet = block.start_text.substring(0, 20);
                startIndex = fullTranscript.indexOf(snippet);
            }

            // Fallback 3: Try ignoring case for the first 30 chars
            if (startIndex === -1 && block.start_text) {
                const snippet = block.start_text.substring(0, 30).toLowerCase();
                startIndex = transcriptLower.indexOf(snippet);
            }

            return startIndex;
        });

        // 2. Build contiguous blocks (Ensure NO GAPS)
        let currentPos = 0;
        const contiguousBlocks = extractedBlocks.map((block, index) => {
            let startIndex = blockStarts[index];

            // If start not found or before current pos, snap to current pos
            if (startIndex === -1 || startIndex < currentPos) startIndex = currentPos;

            // If gap detected between currentPos and startIndex, we must decide where it belongs.
            // Current strategy: Attach the gap to the previous block (not possible here as we are building current)
            // OR: Attach gap to THIS block (start this block earlier)
            // Let's attach the gap to THIS block to avoid losing text.
            if (startIndex > currentPos) {
                startIndex = currentPos;
            }

            let endIndex;
            if (index < extractedBlocks.length - 1) {
                let nextStart = blockStarts[index + 1];

                // Resolve next start index with same logic
                if (nextStart === -1) {
                    // Try to find it again to be sure
                    // (Already done above, but we can't do much if it's -1)
                }

                if (nextStart !== -1 && nextStart > startIndex) {
                    endIndex = nextStart;
                } else {
                    // If next block start is invalid or before this block, 
                    // search for a valid start in subsequent blocks
                    let foundFuture = false;
                    for (let j = index + 2; j < extractedBlocks.length; j++) {
                        if (blockStarts[j] > startIndex) {
                            endIndex = blockStarts[j];
                            foundFuture = true;
                            break;
                        }
                    }
                    if (!foundFuture) endIndex = fullTranscript.length;
                }
            } else {
                endIndex = fullTranscript.length;
            }

            const blockContent = fullTranscript.substring(startIndex, endIndex);
            currentPos = endIndex;

            return {
                id: `block-${Date.now()}-${index}`,
                type: block.type || 'outros',
                title: block.title || 'Bloco',
                content: blockContent.trim(), // Content might be empty if logic fails, but we try to cover all text
                timestamp: block.timestamp || '00:00:00',
                order: index
            };
        });

        // Filter out empty blocks if any
        const validBlocks = contiguousBlocks.filter(b => b.content.length > 0);

        res.json({ blocks: validBlocks });

    } catch (error) {
        console.error('Process Transcript Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 2. Summarize Content (Single Block)
app.post('/summarize-content', requireAuth, async (req, res) => {
    try {
        const { content, prompt, blockType, nameHints, nameMap } = req.body;
        if (!content) return res.status(400).json({ error: 'Content is required' });

        let finalPrompt = '';
        let systemMsg = 'Você é um assistente legislativo especializado.';
        let jsonMode = true;

        let nameHintsText = '';
        if (typeof nameHints === 'string') {
            nameHintsText = nameHints.trim();
        } else if (Array.isArray(nameHints)) {
            nameHintsText = nameHints.map((v) => (typeof v === 'string' ? v.trim() : '')).filter(Boolean).join('\n');
        }

        if (prompt) {
            // If custom prompt, use it directly
            finalPrompt = prompt + `\n\nTexto: "${content}"`;
            systemMsg = 'Você é um assistente útil. Siga as instruções do usuário.';
            jsonMode = false;
        } else {
            // Use specialized prompt
            const builder = PROMPTS[blockType] || PROMPTS.default;
            // Check if builder is a function or string (in original backend it was function)
            if (typeof builder === 'function') {
                finalPrompt = builder(content);
            } else {
                // Should not happen with current structure, but for safety
                finalPrompt = `Resuma: ${content}`;
                jsonMode = false;
            }
        }

        if (nameHintsText.length > 0) {
            finalPrompt += `\n\nPADRÃO DE NOMES (use para corrigir/normalizar nomes de vereadores):\n- Ao citar vereadores, prefira o NOME OFICIAL.\n- Se aparecer apelido/variação no texto, normalize para o NOME OFICIAL correspondente.\n${nameHintsText}\n`;
        }

        const completion = await openai.chat.completions.create({
            model: LLM_MODEL,
            messages: [
                { role: 'system', content: systemMsg },
                { role: 'user', content: finalPrompt }
            ],
            temperature: 0.3,
            response_format: jsonMode ? { type: "json_object" } : undefined
        });

        const rawContent = completion.choices[0].message.content;
        let summary = '';
        if (jsonMode) {
            try {
                const jsonResp = JSON.parse(rawContent);
                const candidate = jsonResp.texto;
                summary = typeof candidate === 'string' && candidate.trim().length > 0 ? candidate : rawContent;
            } catch (e) {
                summary = rawContent;
            }
        } else {
            summary = rawContent;
        }

        summary = applyNameMapPostProcessing(summary, nameMap);
        summary = stripPlaceholders(summary);
        res.json({ summary });

    } catch (error) {
        console.error('Summarize Content Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 2.5 Refine Summary Selection (Inline Edit AI)
app.post('/refine-selection', requireAuth, async (req, res) => {
    try {
        const { blockContent, selectedText, instruction } = req.body;
        if (!blockContent || !selectedText) {
            return res.status(400).json({ error: 'blockContent and selectedText are required' });
        }

        const systemMsg = `Você é um assistente legislativo de precisão.
O usuário selecionou um trecho de um resumo para ser reescrito ou corrigido.
Sua tarefa é reescrever EXCLUSIVAMENTE o trecho selecionado, baseando-se estritamente no conteúdo bruto da transcrição (fatos).
Não adicione aspas no início ou fim. Não escreva "Aqui está o trecho". 
Mantenha a fluidez para que o texto reescrito possa ser inserido no lugar do antigo organicamente.
Retorne SOMENTE o texto reescrito.`;

        const userMsg = `CONTEÚDO BRUTO DO BLOCO (Fatos):
"${blockContent}"

TRECHO SELECIONADO PELO USUÁRIO (Para reescrever):
"${selectedText}"

INSTRUÇÃO ESPÉCIFICA DO USUÁRIO:
${instruction || "Melhore a redação ou corrija erros baseando-se no conteúdo bruto."}`;

        const completion = await openai.chat.completions.create({
            model: LLM_MODEL,
            messages: [
                { role: 'system', content: systemMsg },
                { role: 'user', content: userMsg }
            ],
            temperature: 0.3,
        });

        const refinedText = completion.choices[0].message.content.trim();
        res.json({ refinedText });

    } catch (error) {
        console.error('Refine Selection Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 3. Summarize Blocks (Batch - Keep for compatibility)
app.post('/summarize-blocks', requireAuth, async (req, res) => {
    // Reuse summarize-content logic ideally, but keeping original implementation for now or refactoring
    // Since we added summarize-content, we can make this endpoint iterate and call the same logic internaly?
    // Let's keep the original implementation as it was working, but maybe update prompts if needed.
    // Actually, let's keep it as is from the original file I read, it was fine.
    try {
        const { blocks, nameHints, nameMap } = req.body;
        // ... (Original logic) ...
        // Re-implementing briefly to ensure it uses the same prompts
        if (!blocks || !Array.isArray(blocks)) return res.status(400).json({ error: 'Blocks array required' });

        let nameHintsText = '';
        if (typeof nameHints === 'string') {
            nameHintsText = nameHints.trim();
        } else if (Array.isArray(nameHints)) {
            nameHintsText = nameHints.map((v) => (typeof v === 'string' ? v.trim() : '')).filter(Boolean).join('\n');
        }

        const promises = blocks.map(async (block) => {
            if (!block.content) return block;
            try {
                const builder = PROMPTS[block.type] || PROMPTS.default;
                let prompt = builder(block.content);
                if (nameHintsText.length > 0) {
                    prompt += `\n\nPADRÃO DE NOMES (use para corrigir/normalizar nomes de vereadores):\n- Ao citar vereadores, prefira o NOME OFICIAL.\n- Se aparecer apelido/variação no texto, normalize para o NOME OFICIAL correspondente.\n${nameHintsText}\n`;
                }
                const completion = await openai.chat.completions.create({
                    model: LLM_MODEL,
                    messages: [
                        { role: 'system', content: 'Você é um assistente legislativo especializado.' },
                        { role: 'user', content: prompt }
                    ],
                    response_format: { type: "json_object" }
                });

                const rawContent = completion.choices[0].message.content;
                let summary = '';
                try {
                    const jsonResp = JSON.parse(rawContent);
                    const candidate = jsonResp.texto;
                    summary = typeof candidate === 'string' && candidate.trim().length > 0 ? candidate : rawContent;
                } catch (e) { summary = rawContent; }

                summary = applyNameMapPostProcessing(summary, nameMap);
                summary = stripPlaceholders(summary);

                return { ...block, summary };
            } catch (e) { return block; }
        });

        const results = await Promise.all(promises);
        res.json({ blocks: results });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Internal Helpers ---

const ingestSessionInternal = async (sessionId, supabase) => {
    const { data: session, error } = await supabase.from('sessions').select('*, blocks').eq('id', sessionId).single();
    if (error || !session) throw new Error('Session not found');

    let blocks = Array.isArray(session.blocks) ? session.blocks : [];

    // 1. Generate Blocks if missing
    if ((!blocks || blocks.length === 0) && session.transcript) {
        const systemPrompt = `Você é um assistente especializado em atas de câmaras municipais. 
            Sua tarefa é analisar a transcrição bruta de uma sessão e identificar onde cada bloco lógico começa e termina.
            Você DEVE dividir o texto em MÚLTIPLOS blocos, seguindo estritamente a Ordem Canônica abaixo.

            Ordem Canônica Fixa (Tipos de Blocos):
            1. cabecalho (Informações da sessão, datas, nomes - se constar no texto)
            2. abertura (Início dos trabalhos, oração, verificação de quórum, leitura da ata anterior)
            3. expediente (Leitura de ofícios, correspondências, requerimentos, indicações. Geralmente inicia com "Passa-se ao Expediente", "Leitura do Expediente", "Matérias lidas no expediente")
            4. explicacoes_pessoais (Pronunciamentos, Grande Expediente, fala livre dos vereadores. Geralmente inicia com "Grande Expediente", "Faculta a palavra" ou "Oradores inscritos", "Pronunciamentos")
            5. ordem_dia (Votação de projetos, discussão de leis. Geralmente inicia com "Ordem do Dia", "Passa-se à Ordem do Dia", "Na ordem do dia está em pauta". INCLUI 'Discussão da Pauta' e 'Despachos')
            6. votacao (Processo de votação e proclamação de resultados, se separado da Ordem do Dia. Frases: "Submeto em única votação", "Em votação", "Aprovado por unanimidade")
            7. encerramento (Encerramento da sessão. Geralmente inicia com "Nada mais havendo a tratar", "Declaro encerrada", "Levanta a sessão", "Não havendo mais nada a deliberar")

            Regras Críticas:
            - A divisão deve ser EXATA. O texto de um bloco termina ONDE O OUTRO COMEÇA.
            - "Ordem do Dia" contém "Discussão" e "Despachos". Não crie blocos separados para eles.
            - O "Expediente" contém a leitura de TODAS as matérias (projetos, requerimentos).
            - "Pronunciamentos" (ou Explicações Pessoais) é onde os vereadores discursam livremente.
            - Garanta que TODO o texto da transcrição esteja em algum bloco.
            - Se o texto começar abruptamente, coloque o início no 'cabecalho' ou 'abertura'.

            Formato de Saída (JSON):
            Retorne APENAS um JSON com a seguinte estrutura:
            { "blocks": [{ "type", "title", "start_text", "end_text", "timestamp" }] }`;

        const completion = await openai.chat.completions.create({
            model: LLM_MODEL_MINI,
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: session.transcript.substring(0, 80000) }],
            temperature: 0.1,
            response_format: { type: "json_object" }
        });

        let extractedBlocks = [];
        try {
            const parsed = JSON.parse(completion.choices[0].message.content);
            extractedBlocks = parsed.blocks || [];
        } catch { }

        const blockStarts = extractedBlocks.map((block) => {
            let startIndex = session.transcript.indexOf(block.start_text);
            if (startIndex === -1 && block.start_text) {
                if (block.start_text.length > 30) startIndex = session.transcript.indexOf(block.start_text.substring(0, 30));
                if (startIndex === -1 && block.start_text.length > 15) startIndex = session.transcript.indexOf(block.start_text.substring(0, 15));
            }
            return startIndex;
        });

        let currentPos = 0;
        const contiguousBlocks = extractedBlocks.map((block, index) => {
            let startIndex = blockStarts[index];
            if (startIndex === -1 || startIndex < currentPos) startIndex = currentPos;
            let endIndex;
            if (index < extractedBlocks.length - 1) {
                let nextStart = blockStarts[index + 1];
                if (nextStart === -1 || nextStart <= startIndex) {
                    for (let j = index + 2; j < extractedBlocks.length; j++) {
                        if (blockStarts[j] > startIndex) {
                            nextStart = blockStarts[j];
                            break;
                        }
                    }
                }
                if (nextStart !== -1 && nextStart > startIndex) endIndex = nextStart;
                else endIndex = session.transcript.length;
            } else {
                endIndex = session.transcript.length;
            }
            if (index === 0) startIndex = 0;

            const blockContent = session.transcript.substring(startIndex, endIndex);
            currentPos = endIndex;

            return {
                id: `block-${Date.now()}-${index}`,
                type: block.type || 'outros',
                title: block.title || 'Bloco',
                content: blockContent.trim(),
                timestamp: block.timestamp || '00:00:00',
                order: index
            };
        });

        blocks = contiguousBlocks;
    }

    // 2. Summarize Blocks (DISABLED to save tokens - summaries should be on-demand)
    /*
    if (blocks && blocks.length > 0) {
        const summarized = [];
        for (const block of blocks) {
            if (!block.content) { summarized.push(block); continue; }
            // Skip summarization if already summarized to save tokens/time
            if (block.summary) { summarized.push(block); continue; }

            try {
                const builder = PROMPTS[block.type] || PROMPTS.default;
                const prompt = builder(block.content);
                const completion = await openai.chat.completions.create({
                    model: LLM_MODEL,
                    messages: [{ role: 'system', content: 'Você é um assistente legislativo especializado.' }, { role: 'user', content: prompt }],
                    response_format: { type: "json_object" }
                });
                const rawContent = completion.choices[0].message.content;
                let summary = '';
                try {
                    const jsonResp = JSON.parse(rawContent);
                    const candidate = jsonResp.texto;
                    summary = typeof candidate === 'string' && candidate.trim().length > 0 ? candidate : rawContent;
                } catch { summary = rawContent; }
                summarized.push({ ...block, summary });
            } catch { summarized.push(block); }
        }
        
        await supabase.from('sessions').update({ blocks: summarized }).eq('id', sessionId);
        blocks = summarized;
    }
    */

    // 3. Generate Embeddings
    await supabase.from('session_embeddings').delete().eq('session_id', sessionId);

    const blocksToProcess = [];
    if (session.final_minutes && typeof session.final_minutes === 'string' && session.final_minutes.trim().length > 0) {
        blocksToProcess.push({ title: 'Ata Final', type: 'ata_final', content: session.final_minutes.trim() });
    }

    if (blocks && blocks.length > 0) {
        for (const b of blocks) if (b.content) blocksToProcess.push({ title: b.title, type: b.type, content: b.content });
    } else if (session.transcript) {
        const chunkSize = 2000;
        for (let i = 0; i < session.transcript.length; i += chunkSize) {
            blocksToProcess.push({ title: `Transcrição Part ${i}`, type: 'transcricao_bruta', content: session.transcript.substring(i, i + chunkSize) });
        }
    }

    const embeddingsToInsert = [];
    for (const block of blocksToProcess) {
        if (!block.content) continue;

        const maxBlockSize = 6000;
        const contentChunks = [];
        if (block.content.length > maxBlockSize) {
            for (let i = 0; i < block.content.length; i += maxBlockSize) {
                contentChunks.push(block.content.substring(i, i + maxBlockSize));
            }
        } else {
            contentChunks.push(block.content);
        }

        for (let i = 0; i < contentChunks.length; i++) {
            const chunk = contentChunks[i];
            const contentToEmbed = `Title: ${block.title} (Part ${i + 1})\nType: ${block.type}\nContent: ${chunk}`;

            try {
                const embeddingResponse = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: contentToEmbed });
                embeddingsToInsert.push({
                    session_id: sessionId,
                    camara_id: session.camara_id,
                    content: chunk,
                    metadata: { title: block.title, type: block.type, session_title: session.title, session_date: session.date, session_id: sessionId, chunk_index: i },
                    embedding: embeddingResponse.data[0].embedding
                });
            } catch { }
        }
    }

    if (embeddingsToInsert.length > 0) {
        await supabase.from('session_embeddings').insert(embeddingsToInsert);
    }

    return true;
};

const runAutoSync = async () => {
    console.log('Starting Auto-Sync of Knowledge Base...');
    const supabase = getServiceSupabase();
    if (!supabase) {
        console.error('Auto-Sync skipped: Service Role Key missing.');
        return;
    }

    try {
        // 1. Get all sessions with content
        const { data: sessions, error: sessionError } = await supabase
            .from('sessions')
            .select('id')
            .or('transcript.neq.null,final_minutes.neq.null');

        if (sessionError) throw sessionError;

        // 2. Get all sessions with embeddings
        // Using a simpler approach: check counts or just brute force check existence for now
        // A better query would be to find sessions NOT in session_embeddings
        // Supabase/PostgREST doesn't support "NOT IN" easily with join on unrelated tables in one go without raw SQL or RPC
        // So we fetch IDs from embeddings (lightweight-ish)

        const { data: embeddings, error: embedError } = await supabase
            .from('session_embeddings')
            .select('session_id');

        if (embedError) throw embedError;

        const embeddedIds = new Set((embeddings || []).map(e => e.session_id));
        const missingIds = sessions.filter(s => !embeddedIds.has(s.id)).map(s => s.id);

        if (missingIds.length > 0) {
            console.log(`Auto-Sync: Found ${missingIds.length} sessions pending synchronization.`);
            for (const sid of missingIds) {
                console.log(`Auto-Sync: Processing session ${sid}...`);
                try {
                    await ingestSessionInternal(sid, supabase);
                    console.log(`Auto-Sync: Session ${sid} synced successfully.`);
                } catch (e) {
                    console.error(`Auto-Sync: Failed to sync session ${sid}:`, e.message);
                }
            }
        } else {
            console.log('Auto-Sync: All sessions are synchronized.');
        }
    } catch (err) {
        console.error('Auto-Sync Error:', err);
    }
};

// Schedule Auto-Sync every 10 minutes
cron.schedule('*/10 * * * *', runAutoSync);

// Trigger Auto-Sync manually (or from frontend init)
app.post('/trigger-sync', requireAuth, async (req, res) => {
    // Run asynchronously
    runAutoSync().catch(e => console.error('Manual trigger sync error:', e));
    res.json({ success: true, message: 'Synchronization started in background' });
});

app.post('/sync-session', requireAuth, async (req, res) => {
    try {
        const { sessionId } = req.body;
        const authHeader = req.headers.authorization;
        if (!sessionId) return res.status(400).json({ error: 'Session ID required' });
        const supabase = getSupabaseClient(authHeader);

        await ingestSessionInternal(sessionId, supabase);

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// 4. AssemblyAI Transcribe
app.post('/assembly-transcribe', requireAuth, async (req, res) => {
    try {
        const { audioUrl, language_code, speaker_labels, punctuate } = req.body;
        if (!audioUrl) return res.status(400).json({ error: 'audioUrl is required' });

        const apiKey = process.env.ASSEMBLYAI_API_KEY;
        if (!apiKey) return res.status(500).json({ error: 'ASSEMBLYAI_API_KEY not configured' });

        // Ensure audioUrl is a string and valid
        if (typeof audioUrl !== 'string') {
            return res.status(400).json({ error: 'Invalid audioUrl format' });
        }

        console.log(`Starting AssemblyAI transcription for URL: ${audioUrl}`);

        const response = await axios.post("https://api.assemblyai.com/v2/transcript", {
            audio_url: audioUrl,
            language_code: language_code || 'pt',
            speaker_labels: speaker_labels ?? true,
            punctuate: punctuate ?? true,
            format_text: true,
            speech_threshold: 0.3
        }, {
            headers: {
                authorization: apiKey,
                'Content-Type': 'application/json'
            }
        });

        console.log(`AssemblyAI started: ${response.data.id}`);
        res.json({ id: response.data.id, status: response.data.status });
    } catch (error) {
        // Detailed Error Logging
        const errorData = error.response?.data || error.message;
        const statusCode = error.response?.status || 500;
        console.error('Assembly Transcribe Error:', JSON.stringify(errorData, null, 2));

        // Return a clean error message to frontend
        let userMessage = 'Erro ao iniciar transcrição.';
        if (typeof errorData === 'object' && errorData.error) {
            userMessage = `Erro AssemblyAI: ${errorData.error}`;
        } else if (typeof errorData === 'string') {
            userMessage = errorData;
        }

        res.status(statusCode).json({ error: userMessage, details: errorData });
    }
});

const normalizeSpeakerText = (text) => {
    if (!text || typeof text !== 'string') return '';
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/[^a-z0-9çáéíóúãõâêôüñ\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

const mapUtterancesToVereadoresLocally = (utterances, vereadores) => {
    if (!Array.isArray(utterances) || utterances.length === 0) {
        return { utterances: [] };
    }
    const preparedVereadores = (Array.isArray(vereadores) ? vereadores : []).map((v) => {
        const nome = typeof v.nome === 'string' ? v.nome.trim() : '';
        const apelido = typeof v.apelido === 'string' ? v.apelido.trim() : '';
        const nomeNorm = normalizeSpeakerText(nome);
        const apelidoNorm = normalizeSpeakerText(apelido);
        const tokens = new Set();
        if (nomeNorm) {
            for (const t of nomeNorm.split(' ')) {
                if (t.length >= 3) tokens.add(t);
            }
        }
        if (apelidoNorm) {
            for (const t of apelidoNorm.split(' ')) {
                if (t.length >= 2) tokens.add(t);
            }
        }
        return {
            id: v.id,
            nome,
            apelido: apelido || null,
            tokens,
        };
    }).filter((v) => v.tokens.size > 0);

    const mapped = utterances.map((u) => {
        const original = u || {};
        const text = typeof original.text === 'string' ? original.text : '';
        const norm = normalizeSpeakerText(text);
        let best = null;
        let bestScore = 0;
        if (norm) {
            for (const v of preparedVereadores) {
                let score = 0;
                for (const token of v.tokens) {
                    if (norm.includes(token)) {
                        score += token.length >= 4 ? 2 : 1;
                    }
                }
                if (score > bestScore) {
                    bestScore = score;
                    best = v;
                }
            }
        }
        const vereadorId = best ? best.id : null;
        const vereadorNome = best ? best.nome : null;
        const vereadorApelido = best ? best.apelido : null;
        return {
            ...original,
            vereadorId,
            vereadorNome,
            vereadorApelido,
        };
    });

    return { utterances: mapped };
};

app.post('/assembly-status', requireAuth, async (req, res) => {
    try {
        const { id } = req.body;
        if (!id) return res.status(400).json({ error: 'id is required' });

        const apiKey = process.env.ASSEMBLYAI_API_KEY;
        if (!apiKey) return res.status(500).json({ error: 'ASSEMBLYAI_API_KEY not configured' });

        const response = await axios.get(`https://api.assemblyai.com/v2/transcript/${id}`, {
            headers: { authorization: apiKey }
        });

        const data = response.data;
        res.json({
            id: data.id,
            status: data.status,
            text: data.text ?? null,
            error: data.error ?? null,
            chapters: data.chapters ?? null,
            utterances: data.utterances ?? null,
        });

    } catch (error) {
        console.error('Assembly Status Error:', error.response?.data || error.message);
        res.status(500).json({ error: error.response?.data || error.message });
    }
});

app.post('/map-utterances-speakers', requireAuth, async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'Unauthorized: No token provided' });

        const { audioUrl, camaraId, utterances } = req.body;
        if (!audioUrl || typeof audioUrl !== 'string') {
            return res.status(400).json({ error: 'audioUrl is required' });
        }
        if (!camaraId) {
            return res.status(400).json({ error: 'camaraId is required' });
        }
        if (!Array.isArray(utterances) || utterances.length === 0) {
            return res.status(400).json({ error: 'utterances array is required' });
        }

        const supabase = getSupabaseClient(authHeader);

        const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('id, nome, cargo, preferences')
            .eq('camara_id', camaraId)
            .ilike('cargo', 'Vereador%')
            .eq('ativo', true)
            .order('nome');

        if (profilesError) {
            console.error('Error fetching vereadores for speaker mapping:', profilesError);
            return res.status(500).json({ error: 'Failed to fetch vereadores for speaker mapping' });
        }

        const vereadores = [];
        const rows = Array.isArray(profiles) ? profiles : [];

        for (const row of rows) {
            const prefs = row?.preferences || {};
            const vereador = prefs.vereador || {};
            const apelido = typeof vereador.apelido === 'string' ? vereador.apelido.trim() : '';
            const nome = typeof row?.nome === 'string' ? row.nome.trim() : '';
            if (!nome) continue;
            vereadores.push({
                id: row.id,
                nome,
                apelido: apelido || null,
            });
        }

        const serviceUrl = process.env.VOICE_SERVICE_URL;
        if (!serviceUrl) {
            const localResult = mapUtterancesToVereadoresLocally(utterances, vereadores);
            return res.json(localResult);
        }

        const payload = {
            audioUrl,
            camaraId,
            vereadores,
            utterances,
        };

        const response = await axios.post(serviceUrl, payload, {
            timeout: 300000,
        });

        res.json(response.data);
    } catch (error) {
        console.error('Map Utterances Speakers Error:', error.response?.data || error.message || error);
        if (error.code === 'ECONNABORTED') {
            return res.status(504).json({ error: 'Voice service timeout' });
        }
        res.status(500).json({ error: error.message || 'Internal error' });
    }
});

// 5.1 Normalize Transcript Text (corrige palavras e nomes de vereadores)
app.post('/normalize-transcript-text', requireAuth, async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'Unauthorized: No token provided' });

        const { text, camaraId } = req.body;
        if (typeof text !== 'string' || text.trim().length === 0) {
            return res.status(400).json({ error: 'text is required' });
        }
        if (!camaraId) {
            return res.status(400).json({ error: 'camaraId is required' });
        }

        const supabase = getSupabaseClient(authHeader);

        const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('nome, cargo, preferences')
            .eq('camara_id', camaraId)
            .ilike('cargo', 'Vereador%')
            .eq('ativo', true)
            .order('nome');

        if (profilesError) {
            console.error('Error fetching vereadores for normalization:', profilesError);
            return res.status(500).json({ error: 'Failed to fetch vereadores for normalization' });
        }

        const nameMap = [];
        const lines = [];
        const rows = Array.isArray(profiles) ? profiles : [];

        for (const row of rows) {
            const prefs = row?.preferences || {};
            const vereador = prefs.vereador || {};
            const apelido = typeof vereador.apelido === 'string' ? vereador.apelido.trim() : '';
            const nome = typeof row?.nome === 'string' ? row.nome.trim() : '';
            if (!nome) continue;
            if (apelido) {
                lines.push(`- ${nome} (apelido: ${apelido})`);
                nameMap.push({ official: nome, aliases: [apelido] });
            } else {
                lines.push(`- ${nome}`);
            }
        }

        let normalized = applyNameMapPostProcessing(text, nameMap);

        const vereadorListText = lines.join('\n');

        const systemMsg = 'Você é um revisor de transcrições de sessões de câmaras municipais. Corrija apenas erros claros de transcrição e ortografia, sem resumir nem omitir nenhuma informação.';
        const userMsg = `Abaixo está um texto de transcrição automática de sessão de câmara municipal, possivelmente com erros de reconhecimento de fala.\n\nREGRAS OBRIGATÓRIAS:\n- NÃO RESUMA o conteúdo.\n- NÃO APAGUE frases, nomes ou números.\n- Corrija apenas palavras claramente erradas, mantendo o significado original.\n- Use a lista oficial de vereadores para corrigir a grafia dos nomes quando necessário.\n- Preserve quebras de linha e estrutura geral do texto.\n\nLISTA OFICIAL DE VEREADORES (referência para nomes):\n${vereadorListText || '(lista vazia)'}\n\nTEXTO A SER CORRIGIDO:\n${normalized}`;

        const completion = await openai.chat.completions.create({
            model: LLM_MODEL,
            messages: [
                { role: 'system', content: systemMsg },
                { role: 'user', content: userMsg }
            ],
            temperature: 0,
        });

        let corrected = completion.choices[0]?.message?.content || normalized;
        corrected = applyNameMapPostProcessing(corrected, nameMap);
        corrected = stripPlaceholders(corrected);

        res.json({ text: corrected });
    } catch (error) {
        console.error('Normalize Transcript Text Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 6. Get Upload Credentials
app.post('/get-upload-credentials', requireAuth, async (req, res) => {
    try {
        // Verify Auth (Middleware already checked token validity, double check user if needed)
        // const authHeader = req.headers.authorization;
        // if (!authHeader) ... 

        // Middleware attached user to req.user
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized: Invalid token' });
        }

        const apiKey = process.env.ASSEMBLYAI_API_KEY;
        if (!apiKey) return res.status(500).json({ error: 'ASSEMBLYAI_API_KEY not found in server env' });

        // Security: Do NOT send the API key to the frontend.
        // Instead, use the /assembly-transcribe and /assembly-status endpoints as proxies.
        res.status(410).json({
            error: 'This endpoint has been deprecated for security reasons. Use /assembly-transcribe instead.'
        });

    } catch (error) {
        console.error('Server Error in get-upload-credentials:', error);
        res.status(500).json({ error: error.message });
    }
});

// 6.1 Generate R2 Upload URL
app.post('/generate-upload-url', requireAuth, async (req, res) => {
    try {
        // Verify Auth (Optional but recommended)
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'Unauthorized: No token provided' });

        const { filename, contentType } = req.body;
        if (!filename || !contentType) {
            return res.status(400).json({ error: 'Filename and contentType are required' });
        }

        const url = await generateUploadUrl(filename, contentType);

        // Better Public URL logic:
        // 1. If R2_PUBLIC_URL is set, use it (best for performance if bucket is public/CDN)
        // 2. If NOT set, fallback to our own backend proxy (ensures persistence even if bucket is private)
        const backendUrl = process.env.BACKEND_URL || process.env.VITE_BACKEND_URL || '';
        const proxyUrl = `${backendUrl}/serve-file/${filename}`;

        const publicUrl = process.env.R2_PUBLIC_URL
            ? `${process.env.R2_PUBLIC_URL}/${filename}`
            : proxyUrl;

        res.json({ uploadUrl: url, key: filename, publicUrl });
    } catch (error) {
        console.error('Error generating upload URL:', error);
        res.status(500).json({ error: 'Failed to generate upload URL' });
    }
});

// 6.2 Delete R2 File
app.post('/delete-file', requireAuth, async (req, res) => {
    try {
        // Verify Auth
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'Unauthorized: No token provided' });

        const { key } = req.body;
        if (!key) return res.status(400).json({ error: 'Key is required' });

        await deleteFile(key);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting file:', error);
        res.status(500).json({ error: 'Failed to delete file' });
    }
});

// 6.3 Serve File Proxy (For private audio persistence without public bucket)
// Compatível com path-to-regexp atual: wildcard nomeado como *key
app.get('/serve-file/*key', async (req, res) => {
    try {
        const rawKey = req.params.key;
        const key = Array.isArray(rawKey) ? rawKey.join('/') : rawKey;
        if (!key) return res.status(400).send('Key required');

        const client = getR2Client();
        if (!client) return res.status(500).send('Storage not configured');

        const bucketName = process.env.R2_BUCKET_NAME;

        // Get object from R2
        const { GetObjectCommand } = require('@aws-sdk/client-s3');
        const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: key
        });

        const response = await client.send(command);

        // Forward headers
        if (response.ContentType) res.setHeader('Content-Type', response.ContentType);
        if (response.ContentLength) res.setHeader('Content-Length', response.ContentLength);

        // Pipe stream
        response.Body.pipe(res);

    } catch (error) {
        console.error('Error serving file:', error);
        if (error.Code === 'NoSuchKey') return res.status(404).send('File not found');
        res.status(500).send('Error serving file');
    }
});

// 7. Admin: update user email (uses service role key)
app.post('/admin/update-user-email', requireAuth, async (req, res) => {
    try {
        const serviceClient = getServiceSupabase();
        if (!serviceClient) {
            return res.json({ success: false, error: 'Email update not configured on server' });
        }

        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: 'Unauthorized: No token provided' });
        }

        const supabase = getSupabaseClient(authHeader);
        const { data: authData, error: authError } = await supabase.auth.getUser();

        if (authError || !authData?.user) {
            return res.status(401).json({ error: 'Unauthorized: Invalid token' });
        }

        const currentUserId = authData.user.id;
        const { data: rolesData, error: rolesError } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', currentUserId);

        if (rolesError) {
            throw rolesError;
        }

        const roles = (rolesData || []).map(r => r.role);
        if (!roles.includes('super_admin')) {
            return res.status(403).json({ error: 'Forbidden: only super admins can update email' });
        }

        const { userId, email } = req.body;
        if (!userId || !email) {
            return res.status(400).json({ error: 'userId and email are required' });
        }

        const { error: updateError } = await serviceClient.auth.admin.updateUserById(userId, {
            email,
            email_confirm: true,
        });

        if (updateError) {
            throw updateError;
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Admin update user email error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 8. Admin: get users emails from Auth (uses service role key)
app.post('/admin/get-user-emails', requireAuth, async (req, res) => {
    try {
        const serviceClient = getServiceSupabase();
        if (!serviceClient) {
            return res.json({ success: false, emails: {}, error: 'Email lookup not configured on server' });
        }

        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ success: false, emails: {}, error: 'Unauthorized: No token provided' });
        }

        const supabase = getSupabaseClient(authHeader);
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData?.user) {
            return res.status(401).json({ success: false, emails: {}, error: 'Unauthorized: Invalid token' });
        }

        const currentUserId = authData.user.id;
        const { data: rolesData, error: rolesError } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', currentUserId);

        if (rolesError) throw rolesError;
        const roles = (rolesData || []).map(r => r.role);
        const isSuperAdmin = roles.includes('super_admin');
        const isAdmin = roles.includes('admin');

        if (!isSuperAdmin && !isAdmin) {
            return res.status(403).json({ success: false, emails: {}, error: 'Forbidden' });
        }

        const { userIds } = req.body;
        const ids = Array.isArray(userIds) ? userIds.filter(Boolean) : [];
        if (ids.length === 0) {
            return res.json({ success: true, emails: {} });
        }

        let authorizedIds = ids;

        // Se não for super admin, filtrar apenas usuários da mesma câmara
        if (!isSuperAdmin) {
            const { data: adminProfile } = await supabase
                .from('profiles')
                .select('camara_id')
                .eq('user_id', currentUserId)
                .single();

            if (!adminProfile?.camara_id) {
                return res.json({ success: true, emails: {} }); // Admin sem câmara não vê nada
            }

            const { data: targetProfiles } = await supabase
                .from('profiles')
                .select('user_id, camara_id')
                .in('user_id', ids);

            const allowedMap = new Set();
            (targetProfiles || []).forEach(p => {
                if (p.camara_id === adminProfile.camara_id) {
                    allowedMap.add(p.user_id);
                }
            });

            authorizedIds = ids.filter(id => allowedMap.has(id));
        }

        const limited = authorizedIds.slice(0, 200);
        const emails = {};

        for (const uid of limited) {
            try {
                const { data, error } = await serviceClient.auth.admin.getUserById(uid);
                if (!error && data?.user) emails[uid] = data.user.email || null;
                else emails[uid] = null;
            } catch {
                emails[uid] = null;
            }
        }

        res.json({ success: true, emails });
    } catch (error) {
        console.error('Admin get user emails error:', error);
        res.status(500).json({ success: false, emails: {}, error: error.message });
    }
});

app.get('/ouvidoria/tickets', requireAuth, async (req, res) => {
    try {
        const serviceClient = getServiceSupabase();
        if (!serviceClient) {
            return res.status(500).json({ error: 'Service client not configured' });
        }

        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: 'Unauthorized: No token provided' });
        }

        const supabase = getSupabaseClient(authHeader);
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData?.user) {
            return res.status(401).json({ error: 'Unauthorized: Invalid token' });
        }

        const currentUserId = authData.user.id;
        const { data: rolesData, error: rolesError } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', currentUserId);

        if (rolesError) {
            throw rolesError;
        }

        const roles = (rolesData || []).map(r => r.role);
        const isSuperAdmin = roles.includes('super_admin');
        const isAdmin = roles.includes('admin');

        if (!isSuperAdmin && !isAdmin) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        let camaraId = null;
        if (!isSuperAdmin) {
            const { data: profileData } = await supabase
                .from('profiles')
                .select('camara_id')
                .eq('user_id', currentUserId)
                .maybeSingle();
            camaraId = profileData ? profileData.camara_id : null;
        }

        let query = serviceClient
            .from('ouvidoria_tickets')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

        if (!isSuperAdmin && camaraId) {
            query = query.eq('camara_id', camaraId);
        }

        const { data: tickets, error } = await query;
        if (error) {
            throw error;
        }

        res.json({ tickets: tickets || [] });
    } catch (error) {
        console.error('Ouvidoria list tickets error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/ouvidoria/tickets/:id', requireAuth, async (req, res) => {
    try {
        const serviceClient = getServiceSupabase();
        if (!serviceClient) {
            return res.status(500).json({ error: 'Service client not configured' });
        }

        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: 'Unauthorized: No token provided' });
        }

        const supabase = getSupabaseClient(authHeader);
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData?.user) {
            return res.status(401).json({ error: 'Unauthorized: Invalid token' });
        }

        const currentUserId = authData.user.id;
        const { data: rolesData, error: rolesError } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', currentUserId);

        if (rolesError) {
            throw rolesError;
        }

        const roles = (rolesData || []).map(r => r.role);
        const isSuperAdmin = roles.includes('super_admin');
        const isAdmin = roles.includes('admin');

        if (!isSuperAdmin && !isAdmin) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const ticketId = req.params.id;
        if (!ticketId) {
            return res.status(400).json({ error: 'Ticket id is required' });
        }

        const { data: ticket, error: ticketError } = await serviceClient
            .from('ouvidoria_tickets')
            .select('*')
            .eq('id', ticketId)
            .maybeSingle();

        if (ticketError) {
            throw ticketError;
        }

        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        if (!isSuperAdmin && ticket.camara_id) {
            const { data: profileData } = await supabase
                .from('profiles')
                .select('camara_id')
                .eq('user_id', currentUserId)
                .maybeSingle();

            const camaraId = profileData ? profileData.camara_id : null;
            if (!camaraId || camaraId !== ticket.camara_id) {
                return res.status(403).json({ error: 'Forbidden' });
            }
        }

        const { data: messages, error: messagesError } = await serviceClient
            .from('ouvidoria_messages')
            .select('*')
            .eq('ticket_id', ticketId)
            .order('created_at', { ascending: true });

        if (messagesError) {
            throw messagesError;
        }

        res.json({
            ticket,
            messages: messages || [],
        });
    } catch (error) {
        console.error('Ouvidoria ticket details error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/ouvidoria/tickets/:id/reply', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { message } = req.body;

        if (!message) return res.status(400).json({ error: 'Message required' });

        const serviceClient = getServiceSupabase();

        // 1. Get ticket to find phone number
        const { data: ticket } = await serviceClient
            .from('ouvidoria_tickets')
            .select('whatsapp_number')
            .eq('id', id)
            .single();

        if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

        // 2. Send via WhatsApp
        const sendResult = await sendWhatsAppMessage(ticket.whatsapp_number, message);
        if (!sendResult.success) {
            return res.status(500).json({ error: sendResult.error || 'Failed to send WhatsApp message' });
        }

        // 3. Save to database
        const { error: saveError } = await serviceClient
            .from('ouvidoria_messages')
            .insert({
                ticket_id: id,
                from_type: 'humano',
                direction: 'outbound',
                body: message
            });

        if (saveError) throw saveError;

        // 4. Update ticket timestamp
        await serviceClient
            .from('ouvidoria_tickets')
            .update({ last_message_at: new Date().toISOString() })
            .eq('id', id);

        res.json({ success: true });
    } catch (error) {
        console.error('Error sending reply:', error);
        res.status(500).json({ error: error.message });
    }
});

// 8. Process YouTube (Existing + Improved)
app.post('/process-youtube', requireAuth, async (req, res) => {
    try {
        const { youtubeUrl } = req.body;
        if (!youtubeUrl) return res.status(400).json({ error: 'YouTube URL is required' });

        const apiKey = process.env.ASSEMBLYAI_API_KEY;
        if (!apiKey) return res.status(500).json({ error: 'AssemblyAI API Key not configured' });

        console.log(`Processing URL: ${youtubeUrl}`);

        try {
            console.log('Trying to fetch YouTube transcript (captions) first...');
            // Tenta buscar legendas em português primeiro, depois inglês, depois qualquer
            // YoutubeTranscript.fetchTranscript não tem opção direta de "fetch all", mas retorna array
            const transcriptItems = await YoutubeTranscript.fetchTranscript(youtubeUrl, { lang: 'pt' })
                .catch(() => YoutubeTranscript.fetchTranscript(youtubeUrl)); // Fallback to default/auto

            if (Array.isArray(transcriptItems) && transcriptItems.length > 0) {
                const transcriptText = transcriptItems
                    .map((item) => (typeof item.text === 'string' ? item.text : ''))
                    .filter((t) => t && t.trim().length > 0)
                    .join(' ')
                    .trim();
                if (transcriptText.length > 0) {
                    console.log('YouTube transcript fetched successfully. Using captions instead of audio download.');
                    return res.json({
                        mode: 'captions',
                        transcript_text: transcriptText
                    });
                }
            }
            console.log('YouTube transcript not available or empty, falling back to audio download.');
        } catch (captionError) {
            console.error('Failed to fetch YouTube transcript, falling back to audio download:', captionError.message || captionError);

            // Se o erro for especificamente "Captions are disabled for this video", não é erro de servidor, apenas falta de legenda
            if (captionError.message && captionError.message.includes('Captions are disabled')) {
                console.log('Captions disabled, proceeding to audio download.');
            }
        }

        // --- CHECAGEM CRÍTICA DE PYTHON ---
        // Se chegamos aqui, é porque a legenda FALHOU ou NÃO EXISTE.
        // Agora precisamos do yt-dlp. Mas se o Python for velho, vai dar erro.
        // Vamos tentar detectar o erro de Python ANTES de explodir tudo, ou pelo menos tratar melhor.

        // Try to find cookies.txt in multiple locations
        const pathsToCheck = [
            path.join(__dirname, 'cookies.txt'),
            path.join(process.cwd(), 'cookies.txt')
        ];

        let cookiesPath = null;
        for (const p of pathsToCheck) {
            if (fs.existsSync(p)) {
                cookiesPath = p;
                break;
            }
        }

        const hasCookies = !!cookiesPath;
        if (hasCookies) {
            console.log(`Using cookies.txt found at: ${cookiesPath}`);
        } else {
            console.log('No cookies.txt found in:', pathsToCheck);
        }

        // Get metadata
        let metadata;
        try {
            const metadataArgs = [youtubeUrl, '--dump-json'];
            if (hasCookies) {
                metadataArgs.push('--cookies', cookiesPath);
            } else {
                metadataArgs.push('--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
            }

            console.log(`Running yt-dlp metadata with args: ${JSON.stringify(metadataArgs)}`);

            // Use execPromise instead of getVideoInfo to pass custom args like cookies
            const stdout = await ytDlpWrap.execPromise(metadataArgs);
            metadata = JSON.parse(stdout);
        } catch (e) {
            console.error('Metadata fetch failed:', e.message);
            console.error('Full stderr:', e.stderr); // Log full stderr for server admins

            // Improve error message for known YouTube blocks
            if (e.message.includes('Sign in to confirm') || e.message.includes('bot')) {
                const cookieStatus = hasCookies ? '(Cookies foram detectados e usados, mas o YouTube ainda bloqueou. Verifique se o arquivo cookies.txt é válido e recente)' : '(Nenhum arquivo cookies.txt foi detectado no servidor)';
                return res.status(400).json({
                    error: `O YouTube bloqueou o download. ${cookieStatus}. Solução: Baixe o vídeo manualmente ou renove o arquivo cookies.txt.`
                });
            }
            if (e.message.includes('unsupported version of Python')) {
                return res.status(400).json({
                    error: 'O vídeo não possui legendas automáticas e o servidor não suporta download de áudio (Python desatualizado). Solução: Baixe o áudio manualmente e use a opção "Upload de Arquivo".'
                });
            }
            return res.status(400).json({ error: `Erro no processamento do vídeo: ${e.message}` });
        }

        if (metadata.duration > 21600) { // 6 hours
            return res.status(400).json({ error: 'Video is too long (max 6 hours)' });
        }

        const tempFilePath = path.join(__dirname, `temp_${Date.now()}.mp3`);

        try {
            const downloadArgs = [
                youtubeUrl,
                '-f', 'bestaudio',
                '-o', tempFilePath,
                '--force-overwrites'
            ];

            if (hasCookies) {
                downloadArgs.push('--cookies', cookiesPath);
            } else {
                downloadArgs.push('--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
            }

            console.log('Starting yt-dlp download with args:', downloadArgs.join(' '));
            await ytDlpWrap.execPromise(downloadArgs);
            console.log('yt-dlp download finished successfully.');
        } catch (downloadError) {
            console.error('yt-dlp download failed:', downloadError.message);
            if (downloadError.message.includes('Sign in to confirm') || downloadError.message.includes('bot')) {
                return res.status(400).json({
                    error: 'O YouTube bloqueou o download automático deste vídeo. Solução: Baixe o vídeo manualmente ou configure o arquivo cookies.txt no servidor.'
                });
            }
            throw downloadError;
        }

        console.log('Download complete. Uploading to AssemblyAI...');

        // Check if file exists and has size
        if (!fs.existsSync(tempFilePath) || fs.statSync(tempFilePath).size === 0) {
            throw new Error('Download failed: Audio file is empty or missing.');
        }

        const fileStream = fs.createReadStream(tempFilePath);

        const response = await axios.post('https://api.assemblyai.com/v2/upload', fileStream, {
            headers: {
                'Authorization': apiKey,
                'Content-Type': 'application/octet-stream',
                'Transfer-Encoding': 'chunked'
            },
            maxBodyLength: Infinity,
            maxContentLength: Infinity
        });

        fs.unlinkSync(tempFilePath);

        // Return matching structure to what frontend expects
        // Frontend expects: { upload_url: ... } which is what response.data has
        res.json(response.data);

    } catch (error) {
        console.error('Error processing YouTube:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// 9. RAG Ingest Session (Existing)
app.post('/ingest-session', requireAuth, async (req, res) => {
    try {
        const { sessionId } = req.body;
        // Use service client for ingestion to ensure we can read the session and write embeddings
        // regardless of RLS quirks, since the user is already authenticated via requireAuth.
        const serviceClient = getServiceSupabase();
        if (!serviceClient) throw new Error('Service client not configured');

        if (!sessionId) return res.status(400).json({ error: 'Session ID required' });

        await ingestSessionInternal(sessionId, serviceClient);

        res.json({ success: true });
    } catch (error) {
        console.error('Ingest Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 10. Ask RAG (Existing)

app.post('/ask', requireAuth, async (req, res) => {
    try {
        const { query, camaraId } = req.body;
        
        if (!query || !camaraId) {
            return res.status(400).json({ error: 'Query and camaraId are required' });
        }

        console.log(`[Ask Agent] New request: "${query}" for camara ${camaraId}`);

        const result = await runAgent({
            pergunta: query,
            camaraId,
            contextoExtra: '' // Can inject user role context here if needed
        });

        res.json({
            answer: result.resposta,
            sources: [], // Agent handles sources in text or we can enhance return format later
            debug: { iterations: result.iteracoes }
        });

    } catch (error) {
        console.error('Ask Agent Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 11. Ingest Legal Document (Guardiao da Legalidade)
app.post('/ingest-law', requireAuth, upload.single('file'), async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const { title, camaraId } = req.body;
        const file = req.file;

        if (!file || !title || !camaraId) {
            return res.status(400).json({ error: 'File, title, and camaraId are required' });
        }

        const supabase = getSupabaseClient(authHeader);

        // 1. Upload file to Supabase Storage (optional, but good for backup)
        // Skipping storage for now to focus on embedding logic, but you could add it here.

        // 2. Parse Text
        let fullText = '';
        if (file.mimetype === 'application/pdf') {
            fullText = await legalParser.parsePdf(file.buffer);
        } else {
            return res.status(400).json({ error: 'Only PDF supported for now' });
        }

        // 3. Chunking Inteligente
        const chunks = legalParser.chunkByArticle(fullText, title);
        console.log(`Extracted ${chunks.length} articles from ${title}`);

        if (chunks.length === 0) {
            // Check text length
            if (fullText.length < 100) {
                return res.status(400).json({ error: 'O PDF parece estar vazio ou é uma imagem escaneada (sem texto selecionável). Este sistema não faz OCR.' });
            } else {
                // Try to ingest as a single block if no articles found but text exists
                chunks.push({
                    content: fullText,
                    metadata: { source: title, reference: 'Texto Completo', type: 'full_text' }
                });
                console.log('No articles found, ingesting as single block.');
            }
        }

        // 4. Create Document Record
        const { data: docData, error: docError } = await supabase
            .from('legal_documents')
            .insert({ camara_id: camaraId, title: title, filename: file.originalname })
            .select()
            .single();

        if (docError) throw docError;

        // 5. Embed & Insert
        const embeddingsToInsert = [];
        for (const chunk of chunks) {
            try {
                const embeddingResponse = await openai.embeddings.create({
                    model: EMBEDDING_MODEL,
                    input: chunk.content,
                });

                embeddingsToInsert.push({
                    document_id: docData.id,
                    camara_id: camaraId,
                    content: chunk.content,
                    metadata: chunk.metadata,
                    embedding: embeddingResponse.data[0].embedding
                });
            } catch (e) {
                console.error('Error embedding chunk:', e.message);
            }
        }

        if (embeddingsToInsert.length > 0) {
            // Insert in batches of 50 to avoid limits
            const batchSize = 50;
            for (let i = 0; i < embeddingsToInsert.length; i += batchSize) {
                const batch = embeddingsToInsert.slice(i, i + batchSize);
                const { error: batchError } = await supabase.from('legal_embeddings').insert(batch);
                if (batchError) {
                    console.error('Supabase Insert Error:', batchError);
                    throw batchError;
                }
            }
        }

        res.json({ success: true, chunks: chunks.length });

    } catch (error) {
        console.error('Ingest Law Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// List Legal Documents
app.get('/legal-documents', requireAuth, async (req, res) => {
    try {
        const { camaraId } = req.query;
        const authHeader = req.headers.authorization;
        if (!camaraId) return res.status(400).json({ error: 'camaraId required' });

        const supabase = getSupabaseClient(authHeader);
        const { data, error } = await supabase
            .from('legal_documents')
            .select('*')
            .eq('camara_id', camaraId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json({ documents: data });
    } catch (error) {
        console.error('List Legal Documents Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete Legal Document
app.delete('/legal-documents/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const authHeader = req.headers.authorization;
        const supabase = getSupabaseClient(authHeader);

        // Delete embeddings first (cascade should handle this but explicit is safer if no cascade)
        await supabase.from('legal_embeddings').delete().eq('document_id', id);

        const { error } = await supabase
            .from('legal_documents')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Delete Legal Document Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Debug Legal Status
app.get('/debug-legal-status', requireAuth, async (req, res) => {
    try {
        const { camaraId } = req.query;
        const authHeader = req.headers.authorization;
        const supabase = getSupabaseClient(authHeader);

        // 1. Check Documents
        const { data: docs, error: docError } = await supabase
            .from('legal_documents')
            .select('id, title, created_at')
            .eq('camara_id', camaraId);

        // 2. Check Embeddings Count
        const { count: embCount, error: embError } = await supabase
            .from('legal_embeddings')
            .select('*', { count: 'exact', head: true })
            .eq('camara_id', camaraId);

        // 3. Test RPC
        let rpcResult = 'Not tested';
        let rpcError = null;
        try {
            const dummyVector = new Array(1536).fill(0.01);
            const { data, error } = await supabase.rpc('match_legal_embeddings', {
                query_embedding: dummyVector,
                match_threshold: 0.0,
                match_count: 5,
                filter_camara_id: camaraId
            });
            if (error) {
                rpcResult = 'Error';
                rpcError = error;
            } else {
                rpcResult = `Success (Found ${data ? data.length : 0} matches)`;
            }
        } catch (e) {
            rpcResult = 'Exception';
            rpcError = e.message;
        }

        res.json({
            camaraId,
            documents: docs,
            docError,
            embeddingsCount: embCount,
            embError,
            rpcResult,
            rpcError
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 12. Analyze Proposal (Guardiao da Legalidade)
app.post('/analyze-proposal', requireAuth, async (req, res) => {
    try {
        const { proposal, camaraId } = req.body;
        const authHeader = req.headers.authorization;
        const supabase = getSupabaseClient(authHeader);
        const rewritePrompt = `Reescreva esta proposta em uma consulta jurídica objetiva, citando termos como "competência", "iniciativa", "despesa", "regulamentação", "poder legislativo", "poder executivo".\nProposta: ${proposal}\nConsulta:`;
        const rr = await openai.chat.completions.create({
            model: LLM_MODEL,
            messages: [{ role: 'system', content: 'Você reescreve consultas jurídicas.' }, { role: 'user', content: rewritePrompt }],
            temperature: 0.1
        });
        const standalone = rr.choices[0].message.content.trim();
        const hydePrompt = `Gere um parecer hipotético conciso e factual sobre a proposta, abordando: competência municipal, iniciativa e possível criação de despesa.\nProposta: ${proposal}\nParecer:`;
        const hydeComp = await openai.chat.completions.create({
            model: LLM_MODEL,
            messages: [{ role: 'system', content: 'Você gera parecer hipotético conciso.' }, { role: 'user', content: hydePrompt }],
            temperature: 0.2
        });
        const hyde = hydeComp.choices[0].message.content.trim();
        const e1 = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: standalone });
        const e2 = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: hyde });

        // Lowered threshold from 0.25 to 0.15 to improve recall
        const m1 = await supabase.rpc('match_legal_embeddings', { query_embedding: e1.data[0].embedding, match_threshold: 0.15, match_count: 30, filter_camara_id: camaraId });
        const m2 = await supabase.rpc('match_legal_embeddings', { query_embedding: e2.data[0].embedding, match_threshold: 0.15, match_count: 30, filter_camara_id: camaraId });

        if (m1.error) console.error('RPC Error m1:', m1.error);

        const merged = {};
        (m1.data || []).forEach(d => { const k = d.id; merged[k] = merged[k] ? merged[k] : d; });
        (m2.data || []).forEach(d => { const k = d.id; merged[k] = merged[k] ? (merged[k].similarity < d.similarity ? d : merged[k]) : d; });
        const docs = Object.values(merged);
        const qTokens = standalone.toLowerCase().split(/\W+/).filter(t => t.length > 2);
        const lexScore = (text) => {
            const lc = (text || '').toLowerCase();
            let s = 0;
            for (const t of qTokens) {
                const c = lc.split(t).length - 1;
                s += Math.min(3, c);
            }
            return s;
        };
        let maxLex = 1;
        const withScores = docs.map(d => {
            const ls = lexScore(d.content);
            if (ls > maxLex) maxLex = ls;
            return { ...d, _lex: ls };
        }).map(d => ({ ...d, _final: 0.6 * (d.similarity || 0) + 0.4 * (d._lex / (maxLex || 1)) }));
        withScores.sort((a, b) => b._final - a._final);
        const prelim = withScores.slice(0, 25);
        const rerankPrompt = `Consulta: ${standalone}\nItens:\n${prelim.map((d, i) => `#${i + 1} ${d.id}: ${d.document_title} | ${(d.content || '').slice(0, 400)}`).join('\n')}\nRetorne JSON com "order": [ids em ordem de relevância].`;
        let orderIds = prelim.map(d => d.id);
        try {
            const rrk = await openai.chat.completions.create({
                model: LLM_MODEL,
                messages: [{ role: 'system', content: 'Você reranqueia artigos por relevância à consulta.' }, { role: 'user', content: rerankPrompt }],
                temperature: 0,
                response_format: { type: 'json_object' }
            });
            const parsed = JSON.parse(rrk.choices[0].message.content);
            if (Array.isArray(parsed.order)) orderIds = parsed.order.filter(id => prelim.find(p => p.id === id));
        } catch { }
        const reranked = orderIds.map(id => prelim.find(p => p.id === id)).filter(Boolean);
        const groupKey = (d) => `${d.document_title || d.metadata?.source || ''}::${d.metadata?.reference || ''}`;
        const byParent = {};
        for (const d of reranked) {
            const k = groupKey(d);
            if (!byParent[k]) byParent[k] = [];
            byParent[k].push(d);
        }
        const parentKeys = Object.keys(byParent).slice(0, 6);
        const parents = [];
        for (const k of parentKeys) {
            const any = byParent[k][0];
            const sourceTitle = any.document_title || any.metadata?.source;
            const reference = any.metadata?.reference;
            const { data: chunks } = await supabase
                .from('legal_embeddings')
                .select('content, metadata')
                .eq('camara_id', camaraId)
                .eq('metadata->>source', sourceTitle)
                .eq('metadata->>reference', reference);
            const full = (chunks || []).map(c => c.content).join('\n');
            parents.push({ content: full, document_title: sourceTitle, metadata: any.metadata });
        }
        let context = "";
        let total = 0;
        const budget = 15000;
        const sources = [];
        for (const p of parents) {
            const t = `[${p.document_title} - ${p.metadata?.reference}]\n${p.content}\n\n`;
            if (total + t.length < budget) {
                context += t;
                total += t.length;
                sources.push({ document_title: p.document_title, content: p.content, metadata: p.metadata, similarity: 1 });
            }
        }
        if (!context) {
            const { count } = await supabase.from('legal_embeddings').select('*', { count: 'exact', head: true }).eq('camara_id', camaraId);

            if (count === 0) {
                context = "ERRO: Não há documentos legais indexados para esta câmara no banco de dados. Por favor, faça o upload da Lei Orgânica em Configurações > Base Legal.";
            } else {
                if (m1.error) {
                    context = `ERRO TÉCNICO NA BUSCA: ${JSON.stringify(m1.error)}. Verifique se a função match_legal_embeddings está atualizada no Supabase.`;
                } else {
                    context = `Nenhuma lei encontrada com similaridade suficiente (Total de fragmentos no banco: ${count}).`;
                }
            }
        }
        const completion = await openai.chat.completions.create({
            model: LLM_MODEL,
            messages: [
                { role: 'system', content: `Você é um Consultor Jurídico Legislativo conservador e preciso.\nUse APENAS o contexto legal abaixo.\n\nContexto Legal:\n${context}` },
                { role: 'user', content: `Proposta: "${proposal}"` }
            ],
            temperature: 0.1
        });
        let analysis = completion.choices[0].message.content;
        try {
            const evalPrompt = `Avalie se o parecer está bem fundamentado no contexto legal.\nRetorne JSON {"confidence": 0..1, "needs_more_info": true|false}.`;
            const ev = await openai.chat.completions.create({
                model: LLM_MODEL,
                messages: [{ role: 'system', content: 'Você avalia confiança de pareceres.' }, { role: 'user', content: `${evalPrompt}\n\nContexto:\n${context}\n\nParecer:\n${analysis}` }],
                temperature: 0,
                response_format: { type: 'json_object' }
            });
            const ej = JSON.parse(ev.choices[0].message.content);
            if (ej.needs_more_info === true || (ej.confidence || 0) < 0.6) {
                const altPrompt = `Gere três consultas jurídicas alternativas mais específicas, citando "Lei Orgânica", "Regimento Interno", "competência" e "iniciativa".\nConsulta base: ${standalone}\nJSON {"queries": ["..."]}`;
                const aq = await openai.chat.completions.create({
                    model: LLM_MODEL,
                    messages: [{ role: 'system', content: 'Você cria variações de consulta jurídica.' }, { role: 'user', content: altPrompt }],
                    temperature: 0.3,
                    response_format: { type: 'json_object' }
                });
                const alts = JSON.parse(aq.choices[0].message.content).queries || [];
                const altEmbeds = await Promise.all(alts.map(t => openai.embeddings.create({ model: EMBEDDING_MODEL, input: t })));
                const altMatches = [];
                for (const ae of altEmbeds) {
                    const r = await supabase.rpc('match_legal_embeddings', { query_embedding: ae.data[0].embedding, match_threshold: 0.2, match_count: 20, filter_camara_id: camaraId });
                    (r.data || []).forEach(x => altMatches.push(x));
                }
                const altParentsMap = {};
                for (const d of altMatches.slice(0, 20)) {
                    const sourceTitle = d.document_title || d.metadata?.source;
                    const reference = d.metadata?.reference;
                    const { data: chunks } = await supabase
                        .from('legal_embeddings')
                        .select('content, metadata')
                        .eq('camara_id', camaraId)
                        .eq('metadata->>source', sourceTitle)
                        .eq('metadata->>reference', reference);
                    const full = (chunks || []).map(c => c.content).join('\n');
                    const key = `${sourceTitle}::${reference}`;
                    if (!altParentsMap[key]) altParentsMap[key] = { content: full, document_title: sourceTitle, metadata: d.metadata };
                }
                for (const p of Object.values(altParentsMap)) {
                    const t = `[${p.document_title} - ${p.metadata?.reference}]\n${p.content}\n\n`;
                    if (total + t.length < budget) {
                        context += t;
                        total += t.length;
                        sources.push({ document_title: p.document_title, content: p.content, metadata: p.metadata, similarity: 1 });
                    }
                }
                const completion2 = await openai.chat.completions.create({
                    model: LLM_MODEL,
                    messages: [
                        { role: 'system', content: `Você é um Consultor Jurídico Legislativo conservador e preciso.\nUse APENAS o contexto legal abaixo.\n\nContexto Legal:\n${context}` },
                        { role: 'user', content: `Proposta: "${proposal}"` }
                    ],
                    temperature: 0.1
                });
                analysis = completion2.choices[0].message.content;
            }
        } catch { }
        res.json({ analysis, sources });

    } catch (error) {
        console.error('Analyze Proposal Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 12. Generate Draft Bill (Fabrica Legislativa)
app.post('/generate-law', requireAuth, async (req, res) => {
    try {
        const { type, object, date, objectives, camaraCity, camaraId } = req.body;
        // Auth check handled by middleware
        // const authHeader = req.headers.authorization;
        // if (!authHeader) ...

        // Use req.user from middleware
        const user = req.user;
        // const supabase = getSupabaseClient(authHeader);
        // ... (reuse client if needed or create new one)
        // Since middleware creates client for validation but doesn't expose it, we recreate it efficiently or refactor middleware to attach it.
        // For minimal changes, we recreate it using header.
        const authHeader = req.headers.authorization;
        const supabase = getSupabaseClient(authHeader);

        const { data: profileData } = await supabase
            .from('profiles')
            .select('nome, cargo, camara_id, preferences, camara:camaras(nome, cidade, estado)')
            .eq('user_id', user.id)
            .single();

        const prefs = profileData?.preferences || {};
        const vereador = prefs?.vereador || {};
        const proponenteParts = [];
        if (profileData?.nome) proponenteParts.push(profileData.nome);
        if (profileData?.cargo) proponenteParts.push(profileData.cargo);
        if (vereador?.partido) proponenteParts.push(`Partido: ${vereador.partido}`);
        const proponente = proponenteParts.length > 0 ? proponenteParts.join(' | ') : null;
        const bio = vereador?.biografia ? String(vereador.biografia).trim() : '';
        const camaraCityResolved =
            profileData?.camara?.nome
                ? String(profileData.camara.nome).replace('Câmara Municipal de ', '')
                : (camaraCity || 'Município');

        // Date handling
        const today = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
        const currentYear = new Date().getFullYear();

        // 0. Fetch Legal Context (if available)
        let legalContext = "";
        const targetCamaraId = camaraId || profileData?.camara_id;

        if (targetCamaraId) {
            try {
                const queryText = `${object} ${objectives}`;
                const embeddingResponse = await openai.embeddings.create({
                    model: EMBEDDING_MODEL,
                    input: queryText,
                });
                const embedding = embeddingResponse.data[0].embedding;

                const { data: legalMatches, error: matchError } = await supabase.rpc('match_legal_embeddings', {
                    query_embedding: embedding,
                    match_threshold: 0.15,
                    match_count: 10,
                    filter_camara_id: targetCamaraId
                });

                if (!matchError && legalMatches && legalMatches.length > 0) {
                    const uniqueContent = [...new Set(legalMatches.map(m => `[Fonte: ${m.metadata?.source || 'Lei Municipal'}]\n${m.content}`))].join('\n\n');
                    legalContext = `CONTEXTO LEGAL MUNICIPAL (LEI ORGÂNICA/REGIMENTO) - OBRIGATÓRIO RESPEITAR:\n${uniqueContent}\n\n`;
                }
            } catch (e) {
                console.error('Error fetching legal context for bill:', e);
            }
        }

        // 1. Generate Text with LLM
        const prompt = `Atue como um redator legislativo sênior e experiente.
        Escreva um Projeto de Lei ${type} para o Município de ${camaraCityResolved}.
        
        ${legalContext ? legalContext : 'Nenhum contexto legal específico encontrado. Baseie-se na Constituição Federal e princípios gerais do Direito Administrativo Brasileiro.\n'}

        ${proponente ? `DADOS DO PROPONENTE (para contextualização e assinatura):\n${proponente}\n` : ''}
        
        Objeto da Lei: ${object}
        Detalhes Específicos/Regras (se houver): ${date || 'Não especificado - Criar regras padrão aplicáveis.'}
        Objetivos/Argumentos: ${objectives}
        
        REGRAS DE FORMATAÇÃO E ESTRUTURA (RIGOROSO):
        1. Use linguagem formal jurídica (imparcial, clara e culta).
        2. Estruture obrigatoriamente nesta ordem:
           - TÍTULO (Ex: PROJETO DE LEI Nº .../${currentYear})
           - EMENTA (Resumo claro do objeto)
           - TEXTO DA LEI (Art. 1º, Art. 2º, etc. Use Parágrafos Únicos quando couber)
           - CLÁUSULA DE VIGÊNCIA (Ex: "Esta Lei entra em vigor na data de sua publicação.")
           - LOCAL E DATA (Use EXATAMENTE esta data: "Sala das Sessões, ${today}.")
           - ASSINATURA (Nome do proponente e cargo)
           - JUSTIFICATIVA (Título centralizado "JUSTIFICATIVA", seguido de 3 a 5 parágrafos argumentativos sólidos, técnicos e persuasivos).

        3. NÃO use Markdown (negrito, itálico, etc). Retorne APENAS o texto puro, pronto para ser colado em um documento Word.
        4. NÃO INVENTE DATAS PASSADAS. Use SEMPRE o ano atual (${currentYear}) e a data de hoje (${today}) para a assinatura.`;

        const completion = await openai.chat.completions.create({
            model: LLM_MODEL,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.4
        });

        const lawText = completion.choices[0].message.content;

        // 2. Generate DOCX
        const doc = new Document({
            sections: [{
                properties: {},
                children: [
                    new Paragraph({
                        text: `CÂMARA MUNICIPAL DE ${camaraCityResolved.toUpperCase()}`,
                        heading: HeadingLevel.HEADING_1,
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 400 }
                    }),
                    new Paragraph({
                        text: `PROJETO DE LEI Nº ____/${currentYear}`,
                        heading: HeadingLevel.HEADING_2,
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 200 }
                    }),
                    new Paragraph({
                        text: lawText.replace(/\n/g, '\n'),
                        alignment: AlignmentType.JUSTIFIED
                    })
                ],
            }],
        });

        const b64 = await Packer.toBase64String(doc);

        res.json({
            text: lawText,
            docx: b64
        });

    } catch (error) {
        console.error('Generate Law Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 13. Auto-Cleanup Storage (Scheduled)
const cleanupStorage = async () => {
    console.log('Running storage cleanup task...');
    const serviceClient = getServiceSupabase();
    if (!serviceClient) {
        console.error('Service Role Key required for storage cleanup.');
        return { success: false, error: 'Service Role Key missing' };
    }

    const RETENTION_DAYS = parseInt(process.env.STORAGE_RETENTION_DAYS || '30');
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);

    try {
        // 1. List files in bucket (recursive listing needed for folders)
        // Since list() isn't recursive by default, we assume structure is 'sessionId/filename' or just 'filename'
        // We'll list root first. If folders used, we need to traverse.
        // Current implementation uses 'userId/filename' or 'sessionId/filename'.

        // Strategy: List all files flat if possible or iterate known folders.
        // Listing ALL files in a bucket efficiently is tricky without recursion.
        // For simplicity in this v1, we'll assume a flat structure or list folders first.

        // Actually, Supabase list() returns folders too.
        const { data: rootItems, error: listError } = await serviceClient.storage
            .from('session_audio')
            .list('', { limit: 1000 }); // Adjust limit as needed

        if (listError) throw listError;

        let deletedCount = 0;
        let filesToDelete = [];

        // Helper to process a list of items (files or folders)
        const processItems = async (items, pathPrefix = '') => {
            for (const item of items) {
                const fullPath = pathPrefix ? `${pathPrefix}/${item.name}` : item.name;

                if (item.id === null) {
                    // It's a folder, dive in
                    const { data: subItems } = await serviceClient.storage
                        .from('session_audio')
                        .list(fullPath);
                    if (subItems) await processItems(subItems, fullPath);
                } else {
                    // It's a file
                    const createdAt = new Date(item.created_at || item.updated_at);
                    if (createdAt < cutoffDate) {
                        filesToDelete.push(fullPath);
                    }
                }
            }
        };

        await processItems(rootItems);

        if (filesToDelete.length > 0) {
            console.log(`Deleting ${filesToDelete.length} old audio files...`);

            // Delete from Storage
            const { error: deleteError } = await serviceClient.storage
                .from('session_audio')
                .remove(filesToDelete);

            if (deleteError) throw deleteError;
            deletedCount = filesToDelete.length;

            // Optional: Update database to remove broken links
            // This is heavy if many files. Maybe skip or do batch updates.
            // For now, let's just log. The frontend handles 404s on audio gently?
            // Or better: set audio_url = null where audio_url contains these filenames

            // Let's try to update sessions. This requires mapping file URL to session.
            // A bit complex to do reliably without checking every session.
            // We'll skip DB update for now to avoid performance hits, 
            // but the user should know the audio will just stop working.
        }

        console.log(`Cleanup complete. Deleted ${deletedCount} files older than ${RETENTION_DAYS} days.`);
        return { success: true, deleted: deletedCount, retention_days: RETENTION_DAYS };

    } catch (error) {
        console.error('Cleanup Error:', error);
        return { success: false, error: error.message };
    }
};

// Schedule: Run every day at 03:00 AM
cron.schedule('0 3 * * *', () => {
    cleanupStorage();
});

// Manual Endpoint for Cleanup
app.post('/admin/cleanup-storage', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

        // Check if super_admin
        const supabase = getSupabaseClient(authHeader);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return res.status(401).json({ error: 'Unauthorized' });

        // Ideally verify role here... assuming valid token allows trigger for now or rely on RLS
        // But this is an admin task.

        const result = await cleanupStorage();
        res.json(result);

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 14. Admin: Delete Session (Full Cleanup)
app.post('/admin/delete-session', async (req, res) => {
    try {
        const { sessionId } = req.body;
        if (!sessionId) return res.status(400).json({ error: 'Session ID is required' });

        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

        const supabase = getSupabaseClient(authHeader);
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) return res.status(401).json({ error: 'Unauthorized' });

        // Verify Super Admin Role
        const { data: rolesData, error: rolesError } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id);

        if (rolesError) throw rolesError;
        const roles = (rolesData || []).map(r => r.role);

        if (!roles.includes('super_admin')) {
            return res.status(403).json({ error: 'Forbidden: Only super admins can delete sessions.' });
        }

        const serviceClient = getServiceSupabase();
        if (!serviceClient) throw new Error('Service client not configured');

        console.log(`Deleting session ${sessionId} and all related data...`);

        const { data: sessionRow, error: sessionFetchError } = await serviceClient
            .from('sessions')
            .select('audio_url')
            .eq('id', sessionId)
            .maybeSingle();

        if (sessionFetchError) throw sessionFetchError;

        if (sessionRow && sessionRow.audio_url) {
            const audioUrl = sessionRow.audio_url;
            if (typeof audioUrl === 'string') {
                let r2Key = null;
                const publicBase = process.env.R2_PUBLIC_URL;
                if (publicBase && audioUrl.startsWith(publicBase)) {
                    const normalizedBase = publicBase.endsWith('/') ? publicBase : `${publicBase}/`;
                    r2Key = audioUrl.slice(normalizedBase.length);
                } else {
                    const match = audioUrl.match(/^https?:\/\/[^/]+\/(.+)$/);
                    if (match && match[1]) {
                        r2Key = match[1];
                    }
                }
                if (r2Key) {
                    try {
                        await deleteFile(r2Key);
                        console.log(`Deleted R2 audio file: ${r2Key}`);
                    } catch (r2Error) {
                        console.error('Error deleting R2 audio file:', r2Error);
                    }
                }
            }
        }

        // 1. Delete Audio Files from Storage
        // List files in the session folder (if structure is sessionId/filename)
        const { data: files } = await serviceClient.storage
            .from('session_audio')
            .list(sessionId);

        if (files && files.length > 0) {
            const pathsToDelete = files.map(f => `${sessionId}/${f.name}`);
            await serviceClient.storage
                .from('session_audio')
                .remove(pathsToDelete);
            console.log(`Deleted ${files.length} audio files.`);
        }

        // 2. Delete Embeddings (Dependencies)
        const { error: embedError } = await serviceClient
            .from('session_embeddings')
            .delete()
            .eq('session_id', sessionId);

        if (embedError) console.error('Error deleting embeddings:', embedError);

        // 3. Delete Session Record
        const { error: deleteError } = await serviceClient
            .from('sessions')
            .delete()
            .eq('id', sessionId);

        if (deleteError) throw deleteError;

        console.log(`Session ${sessionId} deleted successfully.`);
        res.json({ success: true });

    } catch (error) {
        console.error('Delete Session Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/ouvidoria/whatsapp/status', requireAuth, async (req, res) => {
    try {
        const status = getWhatsAppStatus();
        res.json(status);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/ouvidoria/whatsapp/qr', requireAuth, async (req, res) => {
    try {
        const status = getWhatsAppStatus();
        if (!status.qr) {
            return res.json({ ready: status.ready, hasQr: false, qr: null });
        }
        res.json({ ready: status.ready, hasQr: true, qr: status.qr });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/ouvidoria/whatsapp/start', requireAuth, async (req, res) => {
    try {
        const status = getWhatsAppStatus();
        if (status.ready) {
            return res.json({ success: true, message: 'Already connected' });
        }

        // Start process async (don't wait for QR)
        initWhatsApp().catch(err => console.error('Manual start error:', err));

        res.json({ success: true, message: 'Starting WhatsApp client...' });
    } catch (error) {
        res.status(500).json({ error: 'Start failed' });
    }
});

app.post('/ouvidoria/whatsapp/logout', requireAuth, async (req, res) => {
    try {
        const result = await logoutWhatsApp();
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: 'Logout failed' });
    }
});

app.delete('/admin/camaras/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const authHeader = req.headers.authorization;

        // 1. Verify Super Admin (via middleware user is already attached to req.user usually, but let's be safe with supabase check)
        const supabase = getSupabaseClient(authHeader);
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) return res.status(401).json({ error: 'Unauthorized' });

        const { data: rolesData, error: rolesError } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id);

        if (rolesError) throw rolesError;
        const roles = (rolesData || []).map(r => r.role);

        if (!roles.includes('super_admin')) {
            return res.status(403).json({ error: 'Forbidden: Only super admins can delete camaras.' });
        }

        const serviceClient = getServiceSupabase();

        // 2. Delete (using Service Role to bypass RLS)
        const { error } = await serviceClient.from('camaras').delete().eq('id', id);
        if (error) throw error;

        res.json({ success: true });
    } catch (error) {
        console.error('Delete Camara Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 15. Update Profile (Bypass RLS)
app.post('/update-profile', requireAuth, async (req, res) => {
    try {
        const { userId, updates } = req.body;
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

        // Verify that the requester is the user being updated or an admin
        const supabase = getSupabaseClient(authHeader);
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) return res.status(401).json({ error: 'Unauthorized' });

        if (user.id !== userId) {
            // Check if super_admin
            const { data: rolesData } = await supabase
                .from('user_roles')
                .select('role')
                .eq('user_id', user.id);
            const roles = (rolesData || []).map(r => r.role);
            if (!roles.includes('super_admin') && !roles.includes('admin')) {
                return res.status(403).json({ error: 'Forbidden: You can only update your own profile.' });
            }
        }

        const serviceClient = getServiceSupabase();
        if (!serviceClient) throw new Error('Service client not configured');

        // Check if profile exists to avoid upsert constraint issues
        const { data: existingProfile, error: checkError } = await serviceClient
            .from('profiles')
            .select('id')
            .eq('user_id', userId)
            .maybeSingle();

        if (checkError) {
            console.error('Check Profile Error:', checkError);
            throw checkError;
        }

        let data, error;

        if (existingProfile) {
            // Update
            console.log('Updating existing profile for user:', userId);
            const result = await serviceClient
                .from('profiles')
                .update({ ...updates })
                .eq('user_id', userId)
                .select()
                .single();
            data = result.data;
            error = result.error;
        } else {
            // Insert
            console.log('Creating new profile for user:', userId);
            const result = await serviceClient
                .from('profiles')
                .insert({ ...updates, user_id: userId })
                .select()
                .single();
            data = result.data;
            error = result.error;
        }

        if (error) throw error;

        res.json({ success: true, data });

    } catch (error) {
        console.error('Update Profile Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 16. Save Session (Bypass RLS)
app.post('/save-session', requireAuth, async (req, res) => {
    try {
        const { userId, title, date, status, duration, audio_url, youtube_url, transcript, blocks, camara_id } = req.body;

        // Verifica se o usuário que faz a requisição é o mesmo do userId ou admin
        const authHeader = req.headers.authorization;
        const supabase = getSupabaseClient(authHeader);
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) return res.status(401).json({ error: 'Unauthorized' });

        // Validação básica (opcional, pode ser relaxada se admin estiver salvando para outro)
        if (user.id !== userId) {
            // Opcional: verificar role de admin se necessário
            // Por enquanto, vamos assumir que o frontend envia o userId correto do usuário logado
            // ou implementar verificação de admin aqui se for multi-tenant estrito
        }

        const serviceClient = getServiceSupabase();

        // Verifica se já existe sessão com mesmo título/data/user (lógica do frontend movida pra cá)
        let query = serviceClient
            .from('sessions')
            .select('id')
            .eq('title', title)
            .eq('date', date)
            .eq('user_id', userId)
            .limit(1);

        if (camara_id) {
            query = query.eq('camara_id', camara_id);
        }

        const { data: existingList, error: existingError } = await query;

        if (existingError) console.error('Error checking existing session:', existingError);

        const payload = {
            user_id: userId,
            title,
            date,
            status,
            duration,
            audio_url,
            youtube_url,
            transcript,
            blocks,
            camara_id
        };

        let sessionData;
        let error;

        if (existingList && existingList.length > 0) {
            const existingId = existingList[0].id;
            const updateResult = await serviceClient
                .from('sessions')
                .update(payload)
                .eq('id', existingId)
                .select()
                .single();
            sessionData = updateResult.data;
            error = updateResult.error;
        } else {
            const insertResult = await serviceClient
                .from('sessions')
                .insert(payload)
                .select()
                .single();
            sessionData = insertResult.data;
            error = insertResult.error;
        }

        if (error) throw error;

        res.json({ success: true, data: sessionData });

    } catch (error) {
        console.error('Save Session Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- MCP Server Integration ---
const { setupMcpServer, executeTool } = require('./mcp-server');

// Initialize MCP Server
setupMcpServer(app, { getSupabaseClient, getServiceSupabase, openai });

// 17. Generate Minutes via MCP
app.post('/generate-minutes-mcp', requireAuth, async (req, res) => {
    try {
        const { sessionId, minutesType } = req.body;
        if (!sessionId) return res.status(400).json({ error: 'Session ID required' });

        const authHeader = req.headers.authorization;
        const supabase = getSupabaseClient(authHeader);
        const { data: { user } } = await supabase.auth.getUser();

        // Monta o contexto exatamente como o MCP espera
        const context = {
            supabase,
            serviceSupabase: getServiceSupabase(),
            openai,
            user
        };

        // Usa a verdadeira inteligência do MCP Agent !
        const result = await executeTool('generate_minutes', { 
            session_id: sessionId, 
            minutes_type: minutesType || 'ordinaria' 
        }, context);

        res.json(result);

    } catch (error) {
        console.error('Generate Minutes MCP Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Serve static files from the React frontend app
// Try to find the dist folder in potential locations (root or parent)
const distPaths = [
    path.join(__dirname, '../dist'), // Dev/Local structure
    path.join(__dirname, 'public'),  // Standard Node app structure
    path.join(__dirname, 'dist')     // Alternative
];

const distPath = distPaths.find(p => fs.existsSync(p)) || path.join(__dirname, '../dist');
console.log(`Serving static files from: ${distPath}`);

app.use(express.static(distPath));

app.get(/.*/, (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
});

ensureBinary(ytDlpBinaryPath).catch(err => {
    console.error('Failed to ensure yt-dlp binary:', err);
}).then(() => {
    const server = app.listen(port, () => {
        console.log(`Backend server running at http://localhost:${port}`);
    });
    server.setTimeout(300000); // 5 minutes timeout for large transcripts
});


