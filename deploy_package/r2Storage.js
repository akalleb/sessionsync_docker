const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const getR2Client = () => {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    console.error('R2 credentials missing');
    return null;
  }

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
};

const generateUploadUrl = async (key, contentType) => {
  const client = getR2Client();
  if (!client) throw new Error('R2 Client not initialized');

  const bucketName = process.env.R2_BUCKET_NAME;
  if (!bucketName) throw new Error('R2_BUCKET_NAME not set');

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: contentType,
  });

  // URL expires in 1 hour
  const url = await getSignedUrl(client, command, { expiresIn: 3600 });
  return url;
};

const deleteFile = async (key) => {
    const client = getR2Client();
    if (!client) throw new Error('R2 Client not initialized');
  
    const bucketName = process.env.R2_BUCKET_NAME;
    if (!bucketName) throw new Error('R2_BUCKET_NAME not set');
  
    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    });
  
    await client.send(command);
  };

module.exports = {
  generateUploadUrl,
  deleteFile,
  getR2Client
};
