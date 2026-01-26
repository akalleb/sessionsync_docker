const pdf = require('pdf-parse');

class LegalParser {
  /**
   * Extrai texto de um Buffer PDF
   */
  async parsePdf(buffer) {
    const data = await pdf(buffer);
    return data.text;
  }

  /**
   * Fragmenta o texto legislativo preservando hierarquia (Artigos)
   * Estratégia: Identificar padrões "Art. X" e capturar o conteúdo até o próximo Artigo.
   */
  chunkByArticle(fullText, documentTitle) {
    // Normalização básica
    const text = fullText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // Regex para identificar início de artigos (ex: "Art. 1º", "Artigo 1º", "Art. 12", "Art. 12-A")
    // Explicação: 
    // \b(?:Art\.?|Artigo)\s* -> "Art", "Art." ou "Artigo" seguido de espaços
    // \d+ -> Número
    // [º°]? -> Símbolo ordinal opcional
    // [\-\w]* -> Letras opcionais (ex: 12-A)
    const articleRegex = /\b((?:Art\.?|Artigo)\s*\d+[º°]?[\-\w]*)/gi;
    
    const chunks = [];
    let match;
    let lastIndex = 0;
    let lastHeader = "Preâmbulo/Inicial";

    // Encontra todas as ocorrências de "Art. X"
    while ((match = articleRegex.exec(text)) !== null) {
      const currentIndex = match.index;
      
      // Captura o conteúdo ANTERIOR a este artigo (que pertence ao artigo anterior ou preâmbulo)
      if (currentIndex > lastIndex) {
        const content = text.substring(lastIndex, currentIndex).trim();
        if (content.length > 20) { // Ignora lixo muito curto
          chunks.push({
            content: `${lastHeader}\n${content}`,
            metadata: {
              source: documentTitle,
              reference: lastHeader,
              type: 'article_block'
            }
          });
        }
      }

      lastHeader = match[0]; // Atualiza o cabeçalho para o atual (ex: "Art. 5º")
      lastIndex = currentIndex;
    }

    // Captura o último bloco após o último artigo encontrado
    if (lastIndex < text.length) {
      const content = text.substring(lastIndex).trim();
      chunks.push({
        content: content,
        metadata: {
          source: documentTitle,
          reference: lastHeader,
          type: 'article_block'
        }
      });
    }

    return chunks;
  }
}

module.exports = new LegalParser();
