/**
 * Paradox Structured Text — Non-destructive reader/writer for CK3 script files.
 *
 * Handles:
 *   key = value
 *   key = { nested block }
 *   # comments (preserved on write)
 *   Whitespace and entry ordering (preserved on write)
 *
 * The writer is non-destructive: it only modifies touched entries.
 * Untouched lines pass through byte-for-byte identical.
 *
 * This is NOT a general-purpose Paradox script parser. It handles the subset
 * needed for landed_titles and history/provinces files.
 */

/** Token types produced by the tokenizer */
type TokenType = 'identifier' | 'equals' | 'open_brace' | 'close_brace' | 'string' | 'newline';

interface Token {
  type: TokenType;
  value: string;
  line: number;
}

/** AST node — either a key=value pair or a key={ children } block */
export interface ParadoxNode {
  type: 'block' | 'value';
  key?: string;
  /** For type='value': the raw string value (may be quoted) */
  value?: string;
  /** For type='block': child nodes */
  children?: ParadoxNode[];
  /** Original line number (1-based) */
  line?: number;
}

/**
 * Tokenize a Paradox script string. Comments are stripped but whitespace
 * structure is tracked via newline tokens (for line counting).
 */
function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let line = 1;
  let i = 0;

  while (i < source.length) {
    const ch = source[i];

    // Newline
    if (ch === '\n') {
      line++;
      i++;
      continue;
    }
    if (ch === '\r') {
      if (source[i + 1] === '\n') i++;
      line++;
      i++;
      continue;
    }

    // Whitespace (not newline)
    if (ch === ' ' || ch === '\t') {
      i++;
      continue;
    }

    // Comment — skip to end of line
    if (ch === '#') {
      while (i < source.length && source[i] !== '\n' && source[i] !== '\r') i++;
      continue;
    }

    // Structural tokens
    if (ch === '=') {
      tokens.push({ type: 'equals', value: '=', line });
      i++;
      continue;
    }
    if (ch === '{') {
      tokens.push({ type: 'open_brace', value: '{', line });
      i++;
      continue;
    }
    if (ch === '}') {
      tokens.push({ type: 'close_brace', value: '}', line });
      i++;
      continue;
    }

    // Quoted string
    if (ch === '"') {
      let str = '';
      i++; // skip opening quote
      while (i < source.length && source[i] !== '"') {
        if (source[i] === '\\' && i + 1 < source.length) {
          str += source[i + 1];
          i += 2;
        } else {
          str += source[i];
          i++;
        }
      }
      i++; // skip closing quote
      tokens.push({ type: 'string', value: `"${str}"`, line });
      continue;
    }

    // Identifier or number — anything else until whitespace or structural character
    if (isIdentChar(ch)) {
      let start = i;
      while (i < source.length && isIdentChar(source[i])) i++;
      tokens.push({ type: 'identifier', value: source.substring(start, i), line });
      continue;
    }

    // Unknown character — skip
    i++;
  }

  return tokens;
}

function isIdentChar(ch: string): boolean {
  return ch !== ' ' && ch !== '\t' && ch !== '\n' && ch !== '\r' &&
         ch !== '=' && ch !== '{' && ch !== '}' && ch !== '#' && ch !== '"';
}

/**
 * Parse a Paradox script string into an AST.
 */
export function parseParadoxScript(source: string): ParadoxNode[] {
  const tokens = tokenize(source);
  let pos = 0;

  function parseBlock(): ParadoxNode[] {
    const nodes: ParadoxNode[] = [];

    while (pos < tokens.length) {
      const tok = tokens[pos];

      // End of block
      if (tok.type === 'close_brace') {
        break;
      }

      // key = ...
      if ((tok.type === 'identifier' || tok.type === 'string') &&
          pos + 1 < tokens.length && tokens[pos + 1].type === 'equals') {
        const key = tok.value;
        const keyLine = tok.line;
        pos += 2; // skip key and =

        if (pos >= tokens.length) break;

        const valueTok = tokens[pos];

        if (valueTok.type === 'open_brace') {
          // key = { ... }
          pos++; // skip {
          const children = parseBlock();
          if (pos < tokens.length && tokens[pos].type === 'close_brace') {
            pos++; // skip }
          }
          nodes.push({ type: 'block', key, children, line: keyLine });
        } else {
          // key = value
          pos++;
          nodes.push({ type: 'value', key, value: valueTok.value, line: keyLine });
        }
        continue;
      }

      // Bare value inside a block (e.g. color = { 100 50 50 })
      if (tok.type === 'identifier' || tok.type === 'string') {
        pos++;
        nodes.push({ type: 'value', value: tok.value, line: tok.line });
        continue;
      }

      // Skip unexpected tokens
      pos++;
    }

    return nodes;
  }

  return parseBlock();
}

/**
 * Serialize an AST back to Paradox script format.
 * Uses tab indentation matching CK3 mod conventions.
 */
export function serializeParadoxScript(nodes: ParadoxNode[], indent: number = 0): string {
  const lines: string[] = [];
  const tab = '\t'.repeat(indent);

  for (const node of nodes) {
    if (node.type === 'value' && node.key) {
      // key = value
      lines.push(`${tab}${node.key} = ${node.value}`);
    } else if (node.type === 'value' && !node.key) {
      // bare value (inside a list block like color = { 100 50 50 })
      // These are handled inline by the block serializer below
    } else if (node.type === 'block' && node.key) {
      const children = node.children || [];
      // Check if this is an inline list (all children are bare values)
      const isInlineList = children.length > 0 && children.every(c => c.type === 'value' && !c.key);
      if (isInlineList) {
        const vals = children.map(c => c.value).join(' ');
        lines.push(`${tab}${node.key} = { ${vals} }`);
      } else {
        lines.push(`${tab}${node.key} = {`);
        lines.push(serializeParadoxScript(children, indent + 1));
        lines.push(`${tab}}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Find a node by key path, e.g. ['e_britannia', 'k_england', 'c_london'].
 * Traverses the tree following the key path through nested blocks.
 */
export function findNode(nodes: ParadoxNode[], keyPath: string[]): ParadoxNode | undefined {
  if (keyPath.length === 0) return undefined;

  const [head, ...rest] = keyPath;

  for (const node of nodes) {
    if (node.key === head) {
      if (rest.length === 0) return node;
      if (node.type === 'block' && node.children) {
        return findNode(node.children, rest);
      }
      return undefined;
    }
  }

  return undefined;
}

/**
 * Non-destructive file updater.
 *
 * Takes the original file content and a set of edits (key-value changes at
 * specific paths), and produces new file content with only those entries
 * modified. All other lines (comments, whitespace, ordering) are preserved.
 *
 * @param source - Original file content
 * @param edits - Array of { keyPath, value } where keyPath is dot-separated
 *   for top-level keys or an array of keys for nested paths
 * @returns Modified file content
 */
export function applyEdits(
  source: string,
  edits: Array<{ key: string; value: string }>
): string {
  const lines = source.split(/\r?\n/);
  const eol = source.includes('\r\n') ? '\r\n' : '\n';

  for (const edit of edits) {
    // Find the line containing this top-level key = value
    const pattern = new RegExp(`^(\\s*${escapeRegex(edit.key)}\\s*=\\s*)(.+)$`);
    let found = false;
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(pattern);
      if (match) {
        lines[i] = `${match[1]}${edit.value}`;
        found = true;
        break;
      }
    }
    // If not found, append before the last non-empty line
    if (!found) {
      lines.push(`${edit.key} = ${edit.value}`);
    }
  }

  return lines.join(eol);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Read a simple key=value file (like history/provinces/*.txt).
 * Returns a Map of key → value (strings). Ignores nested blocks and comments.
 */
export function readKeyValues(source: string): Map<string, string> {
  const result = new Map<string, string>();
  const lines = source.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) continue;
    // Skip date blocks (e.g. "1066.1.1 = {")
    if (/^\d+\.\d+\.\d+\s*=/.test(trimmed)) continue;
    // Skip brace-only lines
    if (trimmed === '{' || trimmed === '}') continue;

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.substring(0, eqIdx).trim();
      let value = trimmed.substring(eqIdx + 1).trim();
      // Strip inline comments
      const commentIdx = value.indexOf('#');
      if (commentIdx >= 0) value = value.substring(0, commentIdx).trim();
      // Skip block openers
      if (value === '{') continue;
      result.set(key, value);
    }
  }

  return result;
}
