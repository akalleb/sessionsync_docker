
const OpenAI = require('openai');

const apiKey = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;
const baseURL = process.env.OPENROUTER_API_KEY ? 'https://openrouter.ai/api/v1' : undefined;

if (!apiKey) {
  console.warn('OpenAI/OpenRouter API Key missing.');
}

const openai = new OpenAI({
  apiKey,
  ...(baseURL && { baseURL })
});

const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'openai/text-embedding-3-small';
const LLM_MODEL = process.env.LLM_MODEL || 'openai/gpt-4o';

async function getEmbedding(text) {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text.replace(/\n/g, ' ')
  });
  return response.data[0].embedding;
}

module.exports = { openai, getEmbedding, LLM_MODEL };
