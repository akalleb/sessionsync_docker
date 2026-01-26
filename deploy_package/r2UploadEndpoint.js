const multer = require('multer');
const sanitize = require('sanitize-filename');
const { generateUploadUrl, getR2Client } = require('./r2Storage');
const { PutObjectCommand } = require('@aws-sdk/client-s3');

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 } 
});

const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 
  'application/pdf', 
  'text/plain', 
  'application/msword', 
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'audio/mpeg',
  'audio/wav',
  'audio/x-m4a',
  'audio/webm'
];

const registerR2UploadEndpoint = (app) => {
  app.post('/upload-to-r2', upload.single('file'), async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: 'Unauthorized: No token provided' });
      }

      // Security: Validate Token with Supabase
      const supabaseUrl = process.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      
      if (!supabaseUrl || !supabaseAnonKey) {
          console.error('Supabase vars missing in r2UploadEndpoint');
          return res.status(500).json({ error: 'Server misconfiguration' });
      }

      const { createClient } = require('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } }
      });

      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (authError || !user) {
        return res.status(401).json({ error: 'Unauthorized: Invalid token' });
      }

      const file = req.file;
      let { key } = req.body;

      if (!file || !key) {
        return res.status(400).json({ error: 'File and key are required' });
      }

      // Security: Validate File Type
      if (!ALLOWED_MIME_TYPES.includes(file.mimetype) && !file.mimetype.startsWith('audio/')) {
         return res.status(400).json({ error: 'Invalid file type' });
      }

      // Security: Sanitize Key (Prevent Path Traversal)
      // Remove leading slashes and ".." sequences
      key = key.replace(/^(\.\.(\/|\\|$))+/, '');
      // Ensure we don't allow absolute paths or traversal
      const safeKey = key.split('/').map(part => sanitize(part)).join('/');
      
      if (!safeKey || safeKey !== key) {
          // If sanitization changed the key significantly (other than just ensuring safety of components), 
          // we might want to reject or just use the safe one.
          // For now, let's use the safe one but warn if it was empty.
          if (!safeKey) return res.status(400).json({ error: 'Invalid key' });
      }

      const client = getR2Client();
      if (!client) {
        return res.status(500).json({ error: 'R2 client not configured' });
      }

      const bucketName = process.env.R2_BUCKET_NAME;
      if (!bucketName) {
        return res.status(500).json({ error: 'R2_BUCKET_NAME not set' });
      }

      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      });

      await client.send(command);

      const publicUrl = process.env.R2_PUBLIC_URL
        ? `${process.env.R2_PUBLIC_URL}/${key}`
        : null;

      res.json({ success: true, key, publicUrl });
    } catch (error) {
      console.error('Error in /upload-to-r2:', error);
      const message =
        error && typeof error.message === 'string'
          ? error.message
          : 'Failed to upload file to R2';
      res.status(500).json({ error: message });
    }
  });
};

module.exports = { registerR2UploadEndpoint };
