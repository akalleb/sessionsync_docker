
const { getSessions } = require('./sessions.js');
const { getSpeeches } = require('./speeches.js');
const { getVotes } = require('./votes.js');
const { searchTranscription } = require('./transcription.js');
const { getCouncilmen } = require('./councilmen.js');
const { getAttendance } = require('./attendance.js');

async function executeTool(toolName, args) {
  console.log(`[Agent] Executando tool: ${toolName}`, args);

  try {
    switch (toolName) {
      case 'listar_sessoes':
        return await getSessions(args);

      case 'buscar_discursos':
        return await getSpeeches(args);

      case 'buscar_votacoes':
        return await getVotes(args);

      case 'buscar_transcricao':
        return await searchTranscription(args);

      case 'listar_vereadores':
        return await getCouncilmen(args);

      case 'buscar_presenca':
        return await getAttendance(args);

      default:
        return { erro: `Tool desconhecida: ${toolName}` };
    }
  } catch (err) {
    console.error(`[Agent] Erro na tool ${toolName}:`, err);
    return { erro: `Erro ao executar ${toolName}: ${err.message}` };
  }
}

module.exports = { executeTool };
