/**
 * definition.csv parser — Reads and writes CK3 province definitions.
 * 
 * Format: id;r;g;b;name;x
 * 
 * Example:
 *   0;0;0;0;Unused;x
 *   1;130;12;56;Normandie;x
 *   2;255;0;128;Ile de France;x
 */

import { ProvinceData } from '@shared/types';
import fs from 'fs/promises';

/**
 * Parse a definition.csv file into ProvinceData array.
 */
export async function parseDefinitionCsv(filePath: string): Promise<ProvinceData[]> {
  let content = await fs.readFile(filePath, 'utf-8');

  // Strip BOM if present
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }

  const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
  const provinces: ProvinceData[] = [];

  // Skip header line
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(';');
    if (parts.length < 5) continue;

    const id = parseInt(parts[0], 10);
    const r = parseInt(parts[1], 10);
    const g = parseInt(parts[2], 10);
    const b = parseInt(parts[3], 10);
    const name = parts[4].trim();

    if (isNaN(id) || isNaN(r) || isNaN(g) || isNaN(b)) continue;

    provinces.push({
      id,
      color: { r, g, b },
      name,
    });
  }

  return provinces;
}

/**
 * Write provinces back to a definition.csv file.
 * Preserves the header line and semicolon format.
 */
export async function writeDefinitionCsv(
  filePath: string,
  provinces: ProvinceData[]
): Promise<void> {
  // Read original to detect BOM, EOL style, and header line
  let hasBom = false;
  let eol = '\r\n';
  let headerLine = '0;0;0;0;x;x';
  try {
    const original = await fs.readFile(filePath, 'utf-8');
    hasBom = original.charCodeAt(0) === 0xFEFF;
    if (original.includes('\r\n')) eol = '\r\n';
    else eol = '\n';
    // Preserve the original header/first line exactly
    const stripped = hasBom ? original.slice(1) : original;
    const firstLine = stripped.split(/\r?\n/)[0];
    if (firstLine) headerLine = firstLine;
  } catch { /* no existing file */ }

  // Backup is handled by the caller (VMP-Backups/)

  const lines = [headerLine];
  for (const p of provinces) {
    lines.push(`${p.id};${p.color.r};${p.color.g};${p.color.b};${p.name};x`);
  }

  const content = (hasBom ? '\uFEFF' : '') + lines.join(eol) + eol;
  await fs.writeFile(filePath, content, 'utf-8');
}
