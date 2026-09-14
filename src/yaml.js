// A small, strict YAML subset parser — enough for a config file, with no
// dependencies so the Action runs without `npm install`.
//
// Supported: block mappings, block sequences of scalars, flow sequences
// ([a, b]), plain / 'single' / "double" quoted scalars, true/false, null/~,
// numbers, `#` comments, and `|` / `>` block scalars.
// Not supported (rejected with a clear error): anchors, tags, mappings
// nested inside sequences, flow mappings with content.

export class YamlError extends Error {
  constructor(message, line) {
    super(line ? `line ${line}: ${message}` : message);
    this.name = 'YamlError';
    this.line = line;
  }
}

export function parseYaml(src) {
  const parser = new Parser(String(src));
  const value = parser.parseNode(-1);
  const rest = parser.peek();
  if (rest) throw new YamlError(`unexpected content "${rest.text}" (check indentation)`, rest.line);
  return value ?? {};
}

class Parser {
  constructor(src) {
    this.lines = src.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
    this.i = 0;
  }

  peek() {
    while (this.i < this.lines.length) {
      const raw = this.lines[this.i];
      const text = stripComment(raw);
      const trimmed = text.trim();
      if (trimmed === '' || trimmed === '---' || trimmed === '...') {
        this.i++;
        continue;
      }
      if (/^ *\t/.test(raw)) throw new YamlError('tabs are not allowed for indentation; use spaces', this.i + 1);
      if (/^[&*!]/.test(trimmed) || /:\s+[&*!]/.test(trimmed)) {
        throw new YamlError('anchors, aliases and tags are not supported', this.i + 1);
      }
      return { indent: text.match(/^ */)[0].length, text: trimmed, line: this.i + 1 };
    }
    return null;
  }

  parseNode(parentIndent) {
    const t = this.peek();
    if (!t || t.indent <= parentIndent) return null;
    return isSeqItem(t.text) ? this.parseSeq(t.indent) : this.parseMap(t.indent);
  }

  parseSeq(indent) {
    const out = [];
    for (let t = this.peek(); t && t.indent >= indent; t = this.peek()) {
      if (t.indent > indent) throw new YamlError('unexpected indentation inside list', t.line);
      if (!isSeqItem(t.text)) break;
      this.i++;
      const rest = t.text.slice(1).trim();
      if (rest === '') {
        const nested = this.parseNode(indent);
        if (nested !== null && !Array.isArray(nested)) {
          throw new YamlError('mappings inside lists are not supported', t.line + 1);
        }
        out.push(nested);
      } else if (matchKey(rest)) {
        throw new YamlError(`mappings inside lists are not supported ("${rest}"); quote the value if it is text`, t.line);
      } else {
        out.push(parseScalar(rest, t.line));
      }
    }
    return out;
  }

  parseMap(indent) {
    const out = {};
    for (let t = this.peek(); t && t.indent >= indent; t = this.peek()) {
      if (t.indent > indent) throw new YamlError('unexpected indentation', t.line);
      if (isSeqItem(t.text)) throw new YamlError('list item where a "key: value" was expected', t.line);
      const m = matchKey(t.text);
      if (!m) throw new YamlError(`expected "key: value", got "${t.text}"`, t.line);
      const [key, rest] = m;
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        throw new YamlError(`key "${key}" is not allowed`, t.line);
      }
      if (Object.hasOwn(out, key)) throw new YamlError(`duplicate key "${key}"`, t.line);
      this.i++;
      if (rest === '') {
        const next = this.peek();
        // YAML allows a list at the same indentation as its key.
        out[key] = next && next.indent === indent && isSeqItem(next.text)
          ? this.parseSeq(indent)
          : this.parseNode(indent);
      } else if (/^[|>][-+]?$/.test(rest)) {
        out[key] = this.parseBlockScalar(indent, rest);
      } else {
        out[key] = parseScalar(rest, t.line);
      }
    }
    return out;
  }

  parseBlockScalar(indent, header) {
    const lines = [];
    let blockIndent = null;
    while (this.i < this.lines.length) {
      const raw = this.lines[this.i];
      if (raw.trim() === '') {
        lines.push('');
        this.i++;
        continue;
      }
      const ind = raw.match(/^ */)[0].length;
      if (blockIndent === null) {
        if (ind <= indent) break;
        blockIndent = ind;
      }
      if (ind < blockIndent) break;
      lines.push(raw.slice(blockIndent));
      this.i++;
    }
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    const text = header[0] === '|' ? lines.join('\n') : fold(lines);
    return header[1] === '-' || text === '' ? text : `${text}\n`;
  }
}

function isSeqItem(text) {
  return text === '-' || text.startsWith('- ');
}

const KEY_RE = /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^\s"'#\-[\]{},][^:#]*?|-[^\s:#][^:#]*?)\s*:(?:\s+(.*))?$/;

function matchKey(text) {
  const m = KEY_RE.exec(text);
  if (!m) return null;
  let key = m[1];
  if (key.startsWith('"')) key = JSON.parse(key);
  else if (key.startsWith("'")) key = key.slice(1, -1).replace(/''/g, "'");
  return [key, (m[2] ?? '').trim()];
}

function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (quote === '"' && c === '\\') i++;
      else if (c === quote) {
        if (quote === "'" && line[i + 1] === "'") i++;
        else quote = null;
      }
      continue;
    }
    if ((c === '"' || c === "'") && (i === 0 || /[\s[,:{-]/.test(line[i - 1]))) quote = c;
    else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

function fold(lines) {
  let out = '';
  for (const l of lines) {
    if (l === '') out += '\n';
    else if (out === '' || out.endsWith('\n')) out += l;
    else out += ` ${l}`;
  }
  return out;
}

function splitFlow(inner, line) {
  const items = [];
  let buf = '';
  let quote = null;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (quote) {
      buf += c;
      if (quote === '"' && c === '\\') buf += inner[++i] ?? '';
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
      buf += c;
    } else if (c === ',') {
      items.push(buf);
      buf = '';
    } else if (c === '[' || c === ']' || c === '{' || c === '}') {
      throw new YamlError('nested flow collections are not supported', line);
    } else {
      buf += c;
    }
  }
  if (quote) throw new YamlError('unterminated quote in list', line);
  if (buf.trim() !== '' || items.length) items.push(buf);
  return items.map((s) => s.trim()).filter((s, idx, arr) => s !== '' || idx < arr.length - 1);
}

export function parseScalar(s, line) {
  if (s.startsWith('"')) {
    if (!/^"(?:[^"\\]|\\.)*"$/.test(s)) throw new YamlError(`malformed double-quoted string ${s}`, line);
    try {
      return JSON.parse(s);
    } catch {
      throw new YamlError(`unsupported escape sequence in ${s}`, line);
    }
  }
  if (s.startsWith("'")) {
    if (!/^'(?:[^']|'')*'$/.test(s)) throw new YamlError(`malformed single-quoted string ${s}`, line);
    return s.slice(1, -1).replace(/''/g, "'");
  }
  if (s.startsWith('[')) {
    if (!s.endsWith(']')) throw new YamlError(`unterminated list ${s}`, line);
    return splitFlow(s.slice(1, -1), line).map((item) => parseScalar(item, line));
  }
  if (s.startsWith('{')) {
    if (/^\{\s*\}$/.test(s)) return {};
    throw new YamlError('inline {mappings} are not supported; use indented keys', line);
  }
  if (/^(true|True|TRUE)$/.test(s)) return true;
  if (/^(false|False|FALSE)$/.test(s)) return false;
  if (/^(null|Null|NULL|~)$/.test(s)) return null;
  if (/^[-+]?\d+$/.test(s)) return Number.parseInt(s, 10);
  if (/^[-+]?(\d+\.\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return Number.parseFloat(s);
  return s;
}
