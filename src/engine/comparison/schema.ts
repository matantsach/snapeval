export function extractSchema(text: string): string {
  if (!text) return '';
  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (/^#{1,6}\s/.test(trimmed)) return trimmed.replace(/^(#{1,6}\s).*/, '$1[heading]');
      if (/^[-*+]\s/.test(trimmed)) return '- [item]';
      if (/^\d+\.\s/.test(trimmed)) return '1. [item]';
      if (/^```/.test(trimmed)) return '```';
      if (trimmed === '') return '';
      return '[content]';
    })
    .join('\n')
    .replace(/(\[content\]\n)+\[content\]/g, '[content]')
    .replace(/(\[content\]\n)+/g, '[content]\n')
    .trim();
}

export function schemaCheck(baseline: string, current: string): boolean {
  return extractSchema(baseline) === extractSchema(current);
}
