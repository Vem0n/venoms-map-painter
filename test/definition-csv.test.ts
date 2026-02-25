import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProvinceData } from '@shared/types';

// Mock fs/promises before importing the module
vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    copyFile: vi.fn(),
  },
}));

import fs from 'fs/promises';
import { parseDefinitionCsv, writeDefinitionCsv } from '../src/main/modfiles/definition-csv';

describe('parseDefinitionCsv', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses a standard definition.csv', async () => {
    const csv = `id;r;g;b;name;x
0;0;0;0;Unused;x
1;130;12;56;Normandie;x
2;255;0;128;Ile de France;x
3;50;100;200;Aquitaine;x`;

    vi.mocked(fs.readFile).mockResolvedValue(csv);

    const provinces = await parseDefinitionCsv('/fake/definition.csv');
    expect(provinces).toHaveLength(4);
    expect(provinces[0]).toMatchObject({ id: 0, color: { r: 0, g: 0, b: 0 }, name: 'Unused' });
    expect(provinces[1]).toMatchObject({ id: 1, color: { r: 130, g: 12, b: 56 }, name: 'Normandie' });
    expect(provinces[2]).toMatchObject({ id: 2, color: { r: 255, g: 0, b: 128 }, name: 'Ile de France' });
    expect(provinces[3]).toMatchObject({ id: 3, color: { r: 50, g: 100, b: 200 }, name: 'Aquitaine' });
  });

  it('strips UTF-8 BOM', async () => {
    const csv = '\uFEFFid;r;g;b;name;x\n1;100;200;50;TestLand;x';
    vi.mocked(fs.readFile).mockResolvedValue(csv);

    const provinces = await parseDefinitionCsv('/fake/definition.csv');
    expect(provinces).toHaveLength(1);
    expect(provinces[0].name).toBe('TestLand');
  });

  it('handles Windows-style line endings', async () => {
    const csv = 'id;r;g;b;name;x\r\n1;10;20;30;Province1;x\r\n2;40;50;60;Province2;x\r\n';
    vi.mocked(fs.readFile).mockResolvedValue(csv);

    const provinces = await parseDefinitionCsv('/fake/definition.csv');
    expect(provinces).toHaveLength(2);
  });

  it('skips lines with fewer than 5 fields', async () => {
    const csv = 'id;r;g;b;name;x\n1;10;20;30;Valid;x\nbad line\n2;40;50;60;Also Valid;x';
    vi.mocked(fs.readFile).mockResolvedValue(csv);

    const provinces = await parseDefinitionCsv('/fake/definition.csv');
    expect(provinces).toHaveLength(2);
  });

  it('skips lines with non-numeric values', async () => {
    const csv = 'id;r;g;b;name;x\n1;10;20;30;Valid;x\nabc;10;20;30;Invalid ID;x\n2;xx;50;60;Invalid RGB;x';
    vi.mocked(fs.readFile).mockResolvedValue(csv);

    const provinces = await parseDefinitionCsv('/fake/definition.csv');
    expect(provinces).toHaveLength(1);
    expect(provinces[0].name).toBe('Valid');
  });

  it('trims whitespace from names', async () => {
    const csv = 'id;r;g;b;name;x\n1;10;20;30;  Spaced Name  ;x';
    vi.mocked(fs.readFile).mockResolvedValue(csv);

    const provinces = await parseDefinitionCsv('/fake/definition.csv');
    expect(provinces[0].name).toBe('Spaced Name');
  });

  it('handles empty file (header only)', async () => {
    const csv = 'id;r;g;b;name;x';
    vi.mocked(fs.readFile).mockResolvedValue(csv);

    const provinces = await parseDefinitionCsv('/fake/definition.csv');
    expect(provinces).toHaveLength(0);
  });
});

describe('writeDefinitionCsv', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.writeFile).mockResolvedValue();
    vi.mocked(fs.copyFile).mockResolvedValue();
  });

  it('writes correct CSV format with header', async () => {
    const provinces: ProvinceData[] = [
      { id: 1, color: { r: 130, g: 12, b: 56 }, name: 'Normandie' },
      { id: 2, color: { r: 255, g: 0, b: 128 }, name: 'Ile de France' },
    ];

    await writeDefinitionCsv('/fake/definition.csv', provinces);

    expect(fs.writeFile).toHaveBeenCalledWith(
      '/fake/definition.csv',
      'id;r;g;b;name;x\n1;130;12;56;Normandie;x\n2;255;0;128;Ile de France;x',
      'utf-8'
    );
  });

  it('creates a backup before writing', async () => {
    await writeDefinitionCsv('/fake/definition.csv', []);

    expect(fs.copyFile).toHaveBeenCalledWith('/fake/definition.csv', '/fake/definition.csv.bak');
    const copyOrder = vi.mocked(fs.copyFile).mock.invocationCallOrder[0];
    const writeOrder = vi.mocked(fs.writeFile).mock.invocationCallOrder[0];
    expect(copyOrder).toBeLessThan(writeOrder);
  });

  it('proceeds with write even if backup fails (no existing file)', async () => {
    vi.mocked(fs.copyFile).mockRejectedValue(new Error('ENOENT'));

    await writeDefinitionCsv('/fake/definition.csv', [
      { id: 1, color: { r: 10, g: 20, b: 30 }, name: 'Test' },
    ]);

    expect(fs.writeFile).toHaveBeenCalled();
  });
});
