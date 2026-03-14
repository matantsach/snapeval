import { describe, it, expect } from 'vitest';
import { extractSchema, schemaCheck } from '../../../src/engine/comparison/schema.js';

describe('extractSchema', () => {
  it('extracts heading markers', () => {
    const schema = extractSchema('# Title\n## Section\n### Sub');
    expect(schema).toBe('# [heading]\n## [heading]\n### [heading]');
  });

  it('extracts list item markers', () => {
    const schema = extractSchema('- foo\n* bar\n+ baz');
    expect(schema).toBe('- [item]\n- [item]\n- [item]');
  });

  it('extracts ordered list markers', () => {
    const schema = extractSchema('1. first\n2. second');
    expect(schema).toBe('1. [item]\n1. [item]');
  });

  it('extracts code block markers', () => {
    const schema = extractSchema('```typescript\nconst x = 1;\n```');
    expect(schema).toBe('```\n[content]\n```');
  });

  it('normalizes paragraph content to [content]', () => {
    const schema = extractSchema('Hello world\nThis is text');
    expect(schema).toBe('[content]');
  });

  it('collapses multiple consecutive content lines into one', () => {
    const schema = extractSchema('line1\nline2\nline3');
    expect(schema).toBe('[content]');
  });

  it('preserves structure with blank lines', () => {
    const schema = extractSchema('# Heading\n\nSome content\n\n- item');
    expect(schema).toBe('# [heading]\n\n[content]\n\n- [item]');
  });

  it('returns empty string for empty input', () => {
    expect(extractSchema('')).toBe('');
  });

  it('produces same schema for same structure with different content', () => {
    const text1 = '# Hello\n\nWorld is great\n\n- item one\n- item two';
    const text2 = '# Goodbye\n\nSomething else entirely\n\n- foo\n- bar';
    expect(extractSchema(text1)).toBe(extractSchema(text2));
  });
});

describe('schemaCheck', () => {
  it('passes when outputs have identical structure', () => {
    const baseline = '# Title\n\nSome content here\n\n- bullet one\n- bullet two';
    const current = '# Different Title\n\nOther content here\n\n- point A\n- point B';
    expect(schemaCheck(baseline, current)).toBe(true);
  });

  it('fails when structure differs — missing heading', () => {
    const baseline = '# Title\n\nContent';
    const current = 'Content only';
    expect(schemaCheck(baseline, current)).toBe(false);
  });

  it('fails when structure differs — list vs no list', () => {
    const baseline = '- item one\n- item two';
    const current = 'Plain paragraph text';
    expect(schemaCheck(baseline, current)).toBe(false);
  });

  it('passes for empty-vs-empty', () => {
    expect(schemaCheck('', '')).toBe(true);
  });

  it('fails for empty-vs-nonempty', () => {
    expect(schemaCheck('', '# Heading')).toBe(false);
    expect(schemaCheck('# Heading', '')).toBe(false);
  });

  it('passes for identical text (trivial case)', () => {
    const text = '# Title\n\nContent\n\n- item';
    expect(schemaCheck(text, text)).toBe(true);
  });
});
