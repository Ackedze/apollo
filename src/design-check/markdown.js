// Free-chat block parser copied from v3 src/ui.html. No report/finding actions.
function parseMarkdownBlocks(source) {
  const lines = source.split('\n');
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();
    const normalizedTrimmed = normalizeMarkdownLine(trimmed);

    if (!normalizedTrimmed) {
      index += 1;
      continue;
    }

    if (isCodeFence(normalizedTrimmed)) {
      const code = [];
      index += 1;
      while (
        index < lines.length &&
        !isCodeFence(normalizeMarkdownLine(lines[index].trim()))
      ) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      blocks.push({ type: 'code', code: code.join('\n') });
      continue;
    }

    if (isMarkdownTableStart(lines, index)) {
      const tableLines = [lines[index], lines[index + 1]];
      index += 2;
      while (index < lines.length && isMarkdownTableRow(lines[index])) {
        tableLines.push(lines[index]);
        index += 1;
      }
      blocks.push(parseMarkdownTable(tableLines));
      continue;
    }

    const heading = normalizedTrimmed.match(/^(#{1,6})\s*(.+)$/);
    if (heading) {
      blocks.push({
        type: 'heading',
        depth: heading[1].length,
        text: heading[2].trim(),
      });
      index += 1;
      continue;
    }

    if (/^-{3,}$/.test(normalizedTrimmed)) {
      blocks.push({ type: 'divider' });
      index += 1;
      continue;
    }

    if (/^>\s?/.test(normalizedTrimmed)) {
      const quoteLines = [];
      while (index < lines.length) {
        const quoteLine = normalizeMarkdownLine(lines[index].trim());
        if (!/^>\s?/.test(quoteLine)) {
          break;
        }
        quoteLines.push(quoteLine.replace(/^>\s?/, ''));
        index += 1;
      }
      blocks.push({ type: 'quote', text: quoteLines.join('\n') });
      continue;
    }

    if (
      isStandaloneQuotedLine(normalizedTrimmed) &&
      shouldTreatAsQuoteAfter(blocks)
    ) {
      blocks.push({
        type: 'quote',
        text: unwrapStandaloneQuote(normalizedTrimmed),
      });
      index += 1;
      continue;
    }

    const listMeta = getListMeta(normalizedTrimmed);
    if (listMeta) {
      const items = [];
      const ordered = listMeta.ordered;
      while (index < lines.length) {
        const currentMeta = getListMeta(
          normalizeMarkdownLine(lines[index].trim()),
        );
        if (!currentMeta || currentMeta.ordered !== ordered) {
          break;
        }
        items.push(currentMeta.content);
        index += 1;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    const paragraph = [normalizedTrimmed];
    index += 1;
    while (index < lines.length) {
      const next = normalizeMarkdownLine(lines[index].trim());
      if (
        !next ||
        isCodeFence(next) ||
        /^(#{1,6})\s*/.test(next) ||
        isListLine(next) ||
        /^\d+[.)]\s+/.test(next) ||
        /^>\s?/.test(next) ||
        isMarkdownTableStart(lines, index)
      ) {
        break;
      }
      paragraph.push(next);
      index += 1;
    }
    blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
  }

  return blocks;
}

function isMarkdownTableStart(lines, index) {
  return (
    index + 1 < lines.length &&
    isMarkdownTableRow(lines[index]) &&
    isMarkdownTableSeparator(lines[index + 1])
  );
}

function isMarkdownTableRow(line) {
  const normalized = sanitizeMarkdownTableLine(line);
  return normalized.includes('|') && normalized.trim().startsWith('|');
}

function isMarkdownTableSeparator(line) {
  const cells = sanitizeMarkdownTableLine(line)
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.trim());
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function parseMarkdownTable(lines) {
  const headers = splitMarkdownTableRow(lines[0]);
  const rows = lines.slice(2).map((line) =>
    normalizeMarkdownTableCells(splitMarkdownTableRow(line), headers.length),
  );
  return { type: 'table', headers, rows };
}

function splitMarkdownTableRow(line) {
  return sanitizeMarkdownTableLine(line)
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.trim());
}

function sanitizeMarkdownTableLine(line) {
  const trimmed = String(line || '').trim().replace(/\|\.\s*$/, '|');
  if (trimmed.startsWith('|') && !trimmed.endsWith('|')) {
    return `${trimmed} |`;
  }
  return trimmed;
}

function normalizeMarkdownTableCells(cells, count) {
  const normalized = cells.slice(0, count);
  while (normalized.length < count) {
    normalized.push('');
  }
  return normalized;
}

function getListMeta(line) {
  const orderedMatch = line.match(/^\s*(\d+)[.)]\s+(.+)$/);
  if (orderedMatch) {
    return { ordered: true, content: orderedMatch[2].trim() };
  }
  const unorderedMatch = line.match(/^\s*[-*+–—•]\s+(.+)$/);
  if (unorderedMatch) {
    return { ordered: false, content: unorderedMatch[1].trim() };
  }
  return null;
}

function normalizeMarkdownSource(source) {
  return String(source || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/^\uFEFF/, '')
    .trim();
}

function normalizeMarkdownLine(line) {
  return String(line || '')
    .replace(/\u00a0/g, ' ')
    .replace(/^`{3,}\s*$/g, '```')
    .replace(/^`{3,}\s*([A-Za-z0-9_-]+)\s*$/g, '```$1')
    .trim();
}

function isCodeFence(line) {
  return /^`{3,}(?:[A-Za-z0-9_-]+)?\s*$/.test(line);
}

function isListLine(line) {
  return Boolean(getListMeta(line));
}

function shouldTreatAsQuoteAfter(blocks) {
  const previous = blocks[blocks.length - 1];
  if (!previous) {
    return false;
  }
  const previousText = String(previous.text || '').toLowerCase();
  if (previous.type !== 'paragraph' && previous.type !== 'heading') {
    return false;
  }
  return /(^|\s)(правило|цитата|source quote|quote)[^.!?]*:\s*$/.test(
    previousText,
  );
}

function isStandaloneQuotedLine(line) {
  return (
    /^["'«„“][\s\S]+["'»“”]$/.test(line) ||
    /^"«[\s\S]+»"$/.test(line) ||
    /^«[\s\S]+»$/.test(line)
  );
}

function unwrapStandaloneQuote(line) {
  return String(line || '')
    .replace(/^["'«„“]\s*/, '')
    .replace(/\s*["'»“”]$/, '');
}

function groupCollapsibleMarkdownSections(blocks) {
  const grouped = [];
  let index = 0;
  while (index < blocks.length) {
    const block = blocks[index];
    const isAllowedSection =
      block?.type === 'heading' &&
      block.depth === 2 &&
      /^Допустимые кастомизации(?:\s*·\s*\d+)?$/i.test(
        String(block.text || '').trim(),
      );
    if (!isAllowedSection) {
      grouped.push(block);
      index += 1;
      continue;
    }
    const children = [];
    index += 1;
    while (index < blocks.length) {
      const candidate = blocks[index];
      if (candidate?.type === 'heading' && candidate.depth <= 2) {
        break;
      }
      children.push(candidate);
      index += 1;
    }
    grouped.push({
      type: 'collapsible',
      title: block.text,
      children,
    });
  }
  return grouped;
}

module.exports = { parseMarkdownBlocks, normalizeMarkdownSource, groupCollapsibleMarkdownSections };
