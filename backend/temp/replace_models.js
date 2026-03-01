const fs = require('fs');

let content = fs.readFileSync('index.js', 'utf8');

// Replace chat model references
content = content.replace(/model: 'gpt-4o-mini'/g, 'model: LLM_MODEL_MINI');
content = content.replace(/model: "gpt-4o-mini"/g, 'model: LLM_MODEL_MINI');
content = content.replace(/model: 'gpt-4o'/g, 'model: LLM_MODEL');
content = content.replace(/model: "gpt-4o"/g, 'model: LLM_MODEL');

// Replace embedding model references
content = content.replace(/model: 'text-embedding-3-small'/g, 'model: EMBEDDING_MODEL');
content = content.replace(/model: "text-embedding-3-small"/g, 'model: EMBEDDING_MODEL');

// Switch all embedding calls to use the dedicated embeddings client
content = content.replace(/openai\.embeddings\.create/g, 'openaiEmbeddings.embeddings.create');

fs.writeFileSync('index.js', content, 'utf8');

// Count replacements for verification
const final = fs.readFileSync('index.js', 'utf8');
const llmCount = (final.match(/LLM_MODEL[^_]/g) || []).length;
const llmMiniCount = (final.match(/LLM_MODEL_MINI/g) || []).length;
const embCount = (final.match(/EMBEDDING_MODEL/g) || []).length;
const embClientCount = (final.match(/openaiEmbeddings\.embeddings/g) || []).length;

console.log('Replaced: LLM_MODEL=' + llmCount + ', LLM_MODEL_MINI=' + llmMiniCount + ', EMBEDDING_MODEL=' + embCount + ', openaiEmbeddings calls=' + embClientCount);
console.log('Done!');
