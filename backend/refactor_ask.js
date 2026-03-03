
const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, 'index.js');
let content = fs.readFileSync(indexPath, 'utf8');

const startMarker = "app.post('/ask', requireAuth, async (req, res) => {";
const endMarker = "// 11. Ingest Legal Document";

const startIndex = content.indexOf(startMarker);
if (startIndex === -1) {
    console.error('Start marker not found');
    process.exit(1);
}

const endIndex = content.indexOf(endMarker, startIndex);
if (endIndex === -1) {
    console.error('End marker not found');
    process.exit(1);
}

const newAskCode = `
app.post('/ask', requireAuth, async (req, res) => {
    try {
        const { query, camaraId } = req.body;
        
        if (!query || !camaraId) {
            return res.status(400).json({ error: 'Query and camaraId are required' });
        }

        console.log(\`[Ask Agent] New request: "\${query}" for camara \${camaraId}\`);

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

`;

const before = content.substring(0, startIndex);
const after = content.substring(endIndex);

const newContent = before + newAskCode + after;

fs.writeFileSync(indexPath, newContent, 'utf8');
console.log('Successfully refactored /ask endpoint');
