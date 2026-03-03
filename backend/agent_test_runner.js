require('dotenv').config();
const { runAgent } = require('./agent/index.js');

const CAMARA_ID = 'a5dfbede-406c-4f83-a9f5-331b33be63b7';

const tests = [
  { id: '1.1', pergunta: 'Olá, o que você pode me dizer?' },
  { id: '1.2', pergunta: 'Quais vereadores fazem parte da câmara?' },
  { id: '1.3', pergunta: 'Quantas sessões aconteceram esse ano?' },
  { id: '1.4', pergunta: 'Qual foi a última sessão realizada?' },
  { id: '2.1', pergunta: 'O que o vereador Palhares falou?' },
  { id: '2.6', pergunta: 'Quem discursou mais esse mês?' },
  { id: '3.1', pergunta: 'Quais sessões aconteceram em junho?' },
  { id: '4.1', pergunta: 'Quais projetos foram votados esse mês?' },
  { id: '5.1', pergunta: 'Quem faltou na última sessão?' },
  { id: '6.1', pergunta: 'O que foi discutido sobre saúde nas sessões?' },
  { id: '7.1', pergunta: 'Na última sessão, quem falou e o que foi votado?' }
];

async function main() {
  for (const t of tests) {
    console.log('\n==============================');
    console.log(`Teste ${t.id}: ${t.pergunta}`);
    console.log('------------------------------');
    try {
      const res = await runAgent({ pergunta: t.pergunta, camaraId: CAMARA_ID, contextoExtra: '' });
      console.log('Resposta:\n', res.resposta);
      console.log('Iterações:', res.iteracoes);
    } catch (e) {
      console.error('Erro no teste', t.id, e.message);
    }
  }
}

main();

