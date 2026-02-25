import { describe, it, expect } from 'vitest';
import {
  parseParadoxScript,
  serializeParadoxScript,
  findNode,
  applyEdits,
  readKeyValues,
} from '../src/main/modfiles/paradox-parser';

describe('parseParadoxScript', () => {
  it('parses simple key-value pairs', () => {
    const nodes = parseParadoxScript('culture = norse\nreligion = catholic');
    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toMatchObject({ type: 'value', key: 'culture', value: 'norse' });
    expect(nodes[1]).toMatchObject({ type: 'value', key: 'religion', value: 'catholic' });
  });

  it('parses nested blocks', () => {
    const source = `
e_britannia = {
  k_england = {
    c_london = {
      b_london = {
        province = 42
      }
    }
  }
}`;
    const nodes = parseParadoxScript(source);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe('block');
    expect(nodes[0].key).toBe('e_britannia');

    const kEngland = nodes[0].children![0];
    expect(kEngland.key).toBe('k_england');
    expect(kEngland.type).toBe('block');

    const cLondon = kEngland.children![0];
    expect(cLondon.key).toBe('c_london');

    const bLondon = cLondon.children![0];
    expect(bLondon.key).toBe('b_london');

    const province = bLondon.children![0];
    expect(province).toMatchObject({ type: 'value', key: 'province', value: '42' });
  });

  it('parses inline list blocks (like color = { 100 50 50 })', () => {
    const nodes = parseParadoxScript('color = { 100 50 50 }');
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe('block');
    expect(nodes[0].key).toBe('color');
    expect(nodes[0].children).toHaveLength(3);
    expect(nodes[0].children![0]).toMatchObject({ type: 'value', value: '100' });
    expect(nodes[0].children![1]).toMatchObject({ type: 'value', value: '50' });
    expect(nodes[0].children![2]).toMatchObject({ type: 'value', value: '50' });
  });

  it('ignores comments', () => {
    const source = `# This is a comment
culture = norse # inline comment
# Another comment
religion = catholic`;
    const nodes = parseParadoxScript(source);
    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toMatchObject({ key: 'culture', value: 'norse' });
    expect(nodes[1]).toMatchObject({ key: 'religion', value: 'catholic' });
  });

  it('handles quoted strings', () => {
    const nodes = parseParadoxScript('name = "Ile de France"');
    expect(nodes).toHaveLength(1);
    expect(nodes[0].value).toBe('"Ile de France"');
  });

  it('handles empty input', () => {
    expect(parseParadoxScript('')).toEqual([]);
    expect(parseParadoxScript('   \n\n  ')).toEqual([]);
  });

  it('handles Windows-style line endings', () => {
    const source = 'culture = norse\r\nreligion = catholic\r\n';
    const nodes = parseParadoxScript(source);
    expect(nodes).toHaveLength(2);
  });

  it('parses mixed key-values and blocks', () => {
    const source = `
name = "Test County"
color = { 200 100 50 }
capital = b_test
c_test = {
  b_test = {
    province = 1
  }
}`;
    const nodes = parseParadoxScript(source);
    expect(nodes).toHaveLength(4);
    expect(nodes[0]).toMatchObject({ type: 'value', key: 'name' });
    expect(nodes[1]).toMatchObject({ type: 'block', key: 'color' });
    expect(nodes[2]).toMatchObject({ type: 'value', key: 'capital' });
    expect(nodes[3]).toMatchObject({ type: 'block', key: 'c_test' });
  });
});

describe('serializeParadoxScript', () => {
  it('round-trips simple key-value pairs', () => {
    const source = 'culture = norse\nreligion = catholic';
    const nodes = parseParadoxScript(source);
    const output = serializeParadoxScript(nodes);
    expect(output).toBe(source);
  });

  it('serializes inline list blocks on one line', () => {
    const nodes = parseParadoxScript('color = { 100 50 50 }');
    const output = serializeParadoxScript(nodes);
    expect(output).toBe('color = { 100 50 50 }');
  });

  it('serializes nested blocks with tab indentation', () => {
    const source = `c_test = {
\tb_test = {
\t\tprovince = 1
\t}
}`;
    const nodes = parseParadoxScript(source);
    const output = serializeParadoxScript(nodes);
    expect(output).toBe(source);
  });

  it('handles deeply nested structures', () => {
    const nodes = parseParadoxScript(`
e_test = {
  k_test = {
    d_test = {
      c_test = {
        b_test = {
          province = 99
        }
      }
    }
  }
}`);
    const output = serializeParadoxScript(nodes);
    expect(output).toContain('e_test = {');
    expect(output).toContain('\t\t\t\t\tprovince = 99');
  });
});

describe('findNode', () => {
  const source = `
e_britannia = {
  k_england = {
    c_london = {
      b_london = {
        province = 42
      }
    }
  }
}`;
  let nodes: ReturnType<typeof parseParadoxScript>;

  beforeAll(() => {
    nodes = parseParadoxScript(source);
  });

  it('finds a top-level node', () => {
    const node = findNode(nodes, ['e_britannia']);
    expect(node).toBeDefined();
    expect(node!.key).toBe('e_britannia');
    expect(node!.type).toBe('block');
  });

  it('finds a deeply nested node', () => {
    const node = findNode(nodes, ['e_britannia', 'k_england', 'c_london', 'b_london']);
    expect(node).toBeDefined();
    expect(node!.key).toBe('b_london');
  });

  it('finds a leaf value', () => {
    const node = findNode(nodes, ['e_britannia', 'k_england', 'c_london', 'b_london', 'province']);
    expect(node).toBeDefined();
    expect(node!.value).toBe('42');
  });

  it('returns undefined for non-existent path', () => {
    expect(findNode(nodes, ['e_nonexistent'])).toBeUndefined();
    expect(findNode(nodes, ['e_britannia', 'k_france'])).toBeUndefined();
  });

  it('returns undefined for empty path', () => {
    expect(findNode(nodes, [])).toBeUndefined();
  });
});

describe('applyEdits', () => {
  it('modifies an existing key-value pair', () => {
    const source = 'culture = norse\nreligion = catholic';
    const result = applyEdits(source, [{ key: 'culture', value: 'french' }]);
    expect(result).toContain('culture = french');
    expect(result).toContain('religion = catholic');
  });

  it('preserves indentation when editing', () => {
    const source = '\tculture = norse\n\treligion = catholic';
    const result = applyEdits(source, [{ key: 'culture', value: 'greek' }]);
    expect(result).toContain('\tculture = greek');
  });

  it('appends a new key if not found', () => {
    const source = 'culture = norse';
    const result = applyEdits(source, [{ key: 'holding', value: 'castle_holding' }]);
    expect(result).toContain('culture = norse');
    expect(result).toContain('holding = castle_holding');
  });

  it('handles multiple edits', () => {
    const source = 'culture = norse\nreligion = catholic\nholding = tribal_holding';
    const result = applyEdits(source, [
      { key: 'culture', value: 'greek' },
      { key: 'holding', value: 'castle_holding' },
    ]);
    expect(result).toContain('culture = greek');
    expect(result).toContain('religion = catholic');
    expect(result).toContain('holding = castle_holding');
  });

  it('preserves Windows line endings', () => {
    const source = 'culture = norse\r\nreligion = catholic';
    const result = applyEdits(source, [{ key: 'religion', value: 'orthodox' }]);
    expect(result).toContain('\r\n');
    expect(result).toContain('religion = orthodox');
  });
});

describe('readKeyValues', () => {
  it('reads simple key-value pairs', () => {
    const source = 'culture = norse\nreligion = catholic\nholding = castle_holding';
    const map = readKeyValues(source);
    expect(map.get('culture')).toBe('norse');
    expect(map.get('religion')).toBe('catholic');
    expect(map.get('holding')).toBe('castle_holding');
  });

  it('ignores comments', () => {
    const source = '# This is a comment\nculture = norse\n# Another comment';
    const map = readKeyValues(source);
    expect(map.size).toBe(1);
    expect(map.get('culture')).toBe('norse');
  });

  it('strips inline comments from values', () => {
    const source = 'culture = norse # this is norse';
    const map = readKeyValues(source);
    expect(map.get('culture')).toBe('norse');
  });

  it('ignores empty lines', () => {
    const source = '\n\nculture = norse\n\n';
    const map = readKeyValues(source);
    expect(map.size).toBe(1);
  });

  it('skips date block openers but reads their flat children', () => {
    // readKeyValues is a simple line-by-line reader — it skips the "1066.1.1 = {"
    // date header and the braces, but still reads flat key=values inside.
    // The later "culture = greek" overwrites the earlier "culture = norse".
    const source = `culture = norse
religion = catholic
1066.1.1 = {
  culture = greek
}`;
    const map = readKeyValues(source);
    expect(map.get('culture')).toBe('greek');
    expect(map.get('religion')).toBe('catholic');
  });

  it('ignores brace-only lines', () => {
    const source = 'culture = norse\n{\n}\nreligion = catholic';
    const map = readKeyValues(source);
    expect(map.get('culture')).toBe('norse');
    expect(map.get('religion')).toBe('catholic');
  });

  it('skips block-opening values', () => {
    const source = 'some_block = {\nculture = norse\n}';
    const map = readKeyValues(source);
    // "some_block = {" should be skipped (value is "{")
    expect(map.has('some_block')).toBe(false);
    expect(map.get('culture')).toBe('norse');
  });
});

// Need to import beforeAll for findNode tests
import { beforeAll } from 'vitest';
