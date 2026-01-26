const fs = require('fs');
const path = require('path');
const YTDlpWrap = require('yt-dlp-wrap').default;

const stripDiacritics = (value) => {
  if (typeof value !== 'string') return '';
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '');
};

const escapeRegex = (value) => {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const applyNameMapPostProcessing = (text, nameMap) => {
  if (typeof text !== 'string' || text.length === 0) return text;
  if (!Array.isArray(nameMap) || nameMap.length === 0) return text;

  const normalized = nameMap
    .map((entry) => {
      const official = typeof entry?.official === 'string' ? entry.official.trim() : '';
      const aliasesRaw = Array.isArray(entry?.aliases) ? entry.aliases : [];
      const aliases = aliasesRaw.map((a) => (typeof a === 'string' ? a.trim() : '')).filter(Boolean);
      const allAliases = new Set();
      for (const a of aliases) {
        allAliases.add(a);
        const noAcc = stripDiacritics(a);
        if (noAcc && noAcc !== a) allAliases.add(noAcc);
      }
      const aliasList = Array.from(allAliases).filter((a) => a && a.toLowerCase() !== official.toLowerCase());
      return { official, aliases: aliasList };
    })
    .filter((e) => e.official && e.aliases.length > 0);

  if (normalized.length === 0) return text;

  const hasUnicode = (() => {
    try {
      new RegExp('\\p{L}', 'u');
      return true;
    } catch {
      return false;
    }
  })();

  const wordCharClass = hasUnicode ? '[\\p{L}\\p{N}_]' : '[A-Za-z0-9_]';
  const boundaryLeft = `(^|[^${wordCharClass.slice(1, -1)}])`;
  const boundaryRight = `(?=$|[^${wordCharClass.slice(1, -1)}])`;

  const titlePattern = '(VEREADOR(?:A)?|SENHOR(?:A)?|SR\\.?|SRA\\.?)';

  let out = text;
  for (const entry of normalized) {
    const official = entry.official;

    const multiWordAliases = entry.aliases.filter((a) => a.includes(' ') && a.length >= 4).sort((a, b) => b.length - a.length);
    const singleWordAliases = entry.aliases.filter((a) => !a.includes(' ') && a.length >= 4).sort((a, b) => b.length - a.length);
    const shortAliases = entry.aliases.filter((a) => !a.includes(' ') && a.length > 0 && a.length < 4).sort((a, b) => b.length - a.length);

    const replaceWithCase = (matched) => {
      const lettersOnly = stripDiacritics(matched).replace(/[^A-Za-z]/g, '');
      const isAllUpper = lettersOnly.length > 0 && lettersOnly === lettersOnly.toUpperCase();
      return isAllUpper ? official.toUpperCase() : official;
    };

    for (const alias of multiWordAliases) {
      const r = new RegExp(`${boundaryLeft}(${escapeRegex(alias)})${boundaryRight}`, 'giu');
      out = out.replace(r, (m, left, matched) => `${left}${replaceWithCase(matched)}`);
    }

    for (const alias of singleWordAliases) {
      const r = new RegExp(`${boundaryLeft}(${escapeRegex(alias)})${boundaryRight}`, 'giu');
      out = out.replace(r, (m, left, matched) => `${left}${replaceWithCase(matched)}`);
    }

    for (const alias of shortAliases) {
      const r = new RegExp(`${boundaryLeft}(${titlePattern})\\s+(${escapeRegex(alias)})${boundaryRight}`, 'giu');
      out = out.replace(r, (m, left, title, matched) => `${left}${title} ${replaceWithCase(matched)}`);
    }
  }

  return out;
};

const stripPlaceholders = (text) => {
  if (typeof text !== 'string') return text;

  let out = text;

  out = out.replace(/\{[A-Z0-9_]+\}/g, '');
  out = out.replace(/\(Ausentes:\s*\)/gi, '');
  out = out.replace(/\(\s*\)/g, '');
  out = out.replace(/\s+([,.;:!?\)])/, '$1');
  out = out.replace(/\s{2,}/g, ' ');

  return out.trim();
};

const ensureBinary = async (ytDlpBinaryPath) => {
    const exists = fs.existsSync(ytDlpBinaryPath);
    if (!exists) {
        if (process.platform === 'linux') {
            console.log(`Downloading yt-dlp STANDALONE binary for linux...`);
            // Download the standalone binary directly from github releases
            // This bypasses the need for system python
            await YTDlpWrap.downloadFromGithub(ytDlpBinaryPath, undefined, 'linux');
        } else {
            const pinnedVersion = process.env.YTDLP_VERSION || '2024.10.07';
            console.log(`Downloading yt-dlp binary for ${process.platform} (version ${pinnedVersion})...`);
            await YTDlpWrap.downloadFromGithub(ytDlpBinaryPath, pinnedVersion);
        }
        console.log('Downloaded yt-dlp binary');
    }
    if (process.platform !== 'win32') {
        try {
            fs.chmodSync(ytDlpBinaryPath, '755');
        } catch (err) {
            console.error('Failed to set execute permission on yt-dlp binary:', err);
        }
    }
};

module.exports = {
    stripDiacritics,
    escapeRegex,
    applyNameMapPostProcessing,
    stripPlaceholders,
    ensureBinary
};
