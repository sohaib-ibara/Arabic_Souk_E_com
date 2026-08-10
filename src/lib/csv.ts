/**
 * Minimal RFC-4180 CSV reader/writer.
 *
 * Hand-rolled rather than pulled from npm: the admin only ever ingests two-to-
 * three column price sheets, and a parser we own is one less dependency in the
 * supply chain for a file format this small.
 *
 * Handles quoted fields, embedded commas/newlines, doubled quotes ("" -> "),
 * CRLF line endings and a leading UTF-8 BOM (Excel writes one).
 */

/** Split raw CSV text into rows of raw string cells. Blank lines are dropped. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    // Ignore rows that are entirely empty (trailing newline, blank separators).
    if (row.some((c) => c.trim() !== "")) rows.push(row);
    row = [];
  };

  while (i < src.length) {
    const ch = src[i];

    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      quoted = true;
      i++;
      continue;
    }
    if (ch === ",") {
      endField();
      i++;
      continue;
    }
    if (ch === "\r") {
      // Swallow CR; the following LF (or its absence) ends the row.
      if (src[i + 1] === "\n") i++;
      endRow();
      i++;
      continue;
    }
    if (ch === "\n") {
      endRow();
      i++;
      continue;
    }

    field += ch;
    i++;
  }

  // Flush whatever is buffered when the file doesn't end in a newline.
  if (field !== "" || row.length) endRow();

  return rows;
}

/** Serialise rows to CSV text, quoting only cells that need it. */
export function toCsv(rows: Array<Array<string | number | null | undefined>>): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const s = cell == null ? "" : String(cell);
          return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\r\n");
}

/**
 * Reads a CSV with a header row into objects keyed by lower-cased header name.
 * Returns `null` when the file has no usable rows.
 */
export function parseCsvWithHeader(
  text: string,
): { headers: string[]; rows: Array<Record<string, string>> } | null {
  const raw = parseCsv(text);
  if (raw.length < 1) return null;

  const headers = raw[0].map((h) => h.trim().toLowerCase());
  const rows = raw.slice(1).map((cells) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (cells[idx] ?? "").trim();
    });
    return obj;
  });

  return { headers, rows };
}
