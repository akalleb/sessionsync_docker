const wppconnect = require('@wppconnect-team/wppconnect');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

let client = null;
let lastQr = null;
let isReady = false;

// Initialize Supabase Service Client (for saving messages)
const getServiceSupabase = () => {
  let url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  let serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const supabase = getServiceSupabase();

const initWhatsApp = async () => {
  console.log('Starting WhatsApp Client...');
  
  // Clean up old tokens to force fresh session if needed
  const tokensDir = path.join(__dirname, 'tokens/sessionsync-ouvidoria');
  try {
      if (fs.existsSync(tokensDir)) {
          console.log('Cleaning up old session tokens...');
          fs.rmSync(tokensDir, { recursive: true, force: true });
      }
  } catch (e) {
      console.error('Failed to clean tokens:', e);
  }
  
  // Reset state
  lastQr = null;
  isReady = false;

  try {
    wppconnect.create({
      session: 'sessionsync-ouvidoria',
      catchQR: (base64Qr, asciiQR) => {
        console.log('New QR Code received (length: ' + base64Qr.length + ')');
        lastQr = base64Qr;
        isReady = false;
      },
      statusFind: (statusSession, session) => {
        console.log('Status Session: ', statusSession);
        if (statusSession === 'inChat' || statusSession === 'isLogged') {
          isReady = true;
          lastQr = null;
        }
        if (statusSession === 'browserClose' || statusSession === 'qrReadError') {
            isReady = false;
        }
      },
      headless: true,
      devtools: false,
      useChrome: true,
      debug: true, // Enable debug logs
      logQR: false,
      puppeteerOptions: {
          userDataDir: path.join(__dirname, 'tokens/sessionsync-ouvidoria'),
          args: [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-dev-shm-usage',
              '--disable-accelerated-2d-canvas',
              '--no-first-run',
              '--no-zygote',
              '--single-process',
              '--disable-gpu'
          ]
      },
      browserArgs: [
          '--no-sandbox', 
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process', 
          '--disable-gpu'
      ],
      disableWelcome: true,
      updatesLog: true, // Enable update logs
      autoClose: 0, // Disable auto close to prevent timeout during QR generation
      tokenStore: 'file',
      folderNameToken: 'tokens',
    })
    .then((wppClient) => {
      console.log('WhatsApp Client created successfully');
      client = wppClient;
      isReady = true;
      start(client);
    })
    .catch((error) => {
      console.log('WPPConnect Create Error:', error);
    });
  } catch (err) {
    console.error('Error creating WhatsApp client:', err);
  }
};

const start = (client) => {
  client.onMessage(async (message) => {
    if (message.isGroupMsg) return; // Ignore groups for now

    console.log('Received message from:', message.from);
    
    // 1. Identify or Create Ticket
    if (supabase) {
      await processIncomingMessage(message);
    }
  });
};

const processIncomingMessage = async (message) => {
  try {
    const phone = message.from.replace('@c.us', '');
    const body = message.body || (message.type === 'ptt' ? '[Áudio]' : '[Mídia]');
    const senderName = message.notifyName || phone;

    // 1. Find open ticket
    const { data: existingTicket } = await supabase
      .from('ouvidoria_tickets')
      .select('*')
      .eq('whatsapp_number', phone)
      .neq('status', 'concluido')
      .maybeSingle();

    let ticketId = existingTicket?.id;

    if (!ticketId) {
      // Create new ticket
      const { data: newTicket, error } = await supabase
        .from('ouvidoria_tickets')
        .insert({
          whatsapp_number: phone,
          nome: senderName,
          assunto: 'Novo contato via WhatsApp',
          status: 'novo',
          handled_by: 'ia', // Default to IA
          // camara_id: ... needs logic to determine camara if multi-tenant
        })
        .select()
        .single();
      
      if (error) {
        console.error('Error creating ticket:', error);
        return;
      }
      ticketId = newTicket.id;
    }

    // 2. Save Message
    await supabase.from('ouvidoria_messages').insert({
      ticket_id: ticketId,
      from_type: 'cidadao',
      direction: 'inbound',
      body: body,
      raw_payload: message
    });

    // 3. Auto-reply logic (IA placeholder)
    // If handled_by === 'ia', we could trigger OpenAI here
    
  } catch (err) {
    console.error('Error processing message:', err);
  }
};

const getWhatsAppStatus = () => {
  return {
    ready: isReady,
    qr: lastQr,
  };
};

const sendWhatsAppMessage = async (to, body) => {
  if (!client || !isReady) {
    return { success: false, error: 'whatsapp_not_ready' };
  }

  try {
    // Ensure number format
    const chatId = to.includes('@c.us') ? to : `${to}@c.us`;
    
    await client.sendText(chatId, body);
    return { success: true };
  } catch (error) {
    console.error('Error sending message:', error);
    return { success: false, error: error.message };
  }
};

const logoutWhatsApp = async () => {
    if (client) {
        await client.logout();
        isReady = false;
        lastQr = null;
        return { success: true };
    }
    return { success: false, error: 'no_client' };
}

module.exports = {
  initWhatsApp,
  getWhatsAppStatus,
  sendWhatsAppMessage,
  logoutWhatsApp
};
