/**
 * A small RFC 4180 CSV reader and writer.
 *
 * Hand-written rather than pulled in, because the whole job is one state
 * machine and the failure mode of getting it wrong — a quoted field with a
 * comma in it silently splitting a row — is the kind of bug that corrupts an
 * import quietly. It is tested directly.
 */

export type CsvRow = Record<string, string>;

/** Splits CSV text into rows of raw cells. Handles quotes, escaped quotes,
 *  embedded commas and newlines, and both CRLF and LF line endings. */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let started = false;

  // Strip a UTF-8 BOM: Excel writes one and it poisons the first header.
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field === "") {
      inQuotes = true;
      started = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
      started = true;
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      started = false;
    } else {
      field += char;
      started = true;
    }
  }

  // A trailing newline should not produce a phantom empty row.
  if (started || field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/** Parses into objects keyed by header. Headers are trimmed and lowercased. */
export function parseCsvRows(input: string): { headers: string[]; rows: CsvRow[] } {
  const raw = parseCsv(input).filter((row) => row.some((cell) => cell.trim() !== ""));
  if (raw.length === 0) return { headers: [], rows: [] };

  const headers = raw[0]!.map((header) => header.trim().toLowerCase());
  const rows = raw.slice(1).map((cells) => {
    const row: CsvRow = {};
    headers.forEach((header, index) => {
      row[header] = (cells[index] ?? "").trim();
    });
    return row;
  });
  return { headers, rows };
}

/** Quotes only where it has to, which keeps hand-edited files readable. */
export function toCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const lines = [headers.map(toCsvCell).join(",")];
  for (const row of rows) lines.push(row.map(toCsvCell).join(","));
  // CRLF, because that is what spreadsheet software expects.
  return lines.join("\r\n") + "\r\n";
}
