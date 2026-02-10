import fs from "node:fs";
import readline from "node:readline";

function splitCsv(sqlFragment) {
  return sqlFragment
    .split(",")
    .map((part) => part.trim().replace(/^`|`$/g, ""))
    .filter(Boolean);
}

function decodeSqlString(value) {
  let out = value;
  out = out.replace(/\\0/g, "\0");
  out = out.replace(/\\n/g, "\n");
  out = out.replace(/\\r/g, "\r");
  out = out.replace(/\\t/g, "\t");
  out = out.replace(/\\b/g, "\b");
  out = out.replace(/\\Z/g, "\x1A");
  out = out.replace(/\\"/g, "\"");
  out = out.replace(/\\'/g, "'");
  out = out.replace(/\\\\/g, "\\");
  out = out.replace(/''/g, "'");
  return out;
}

function decodeSqlValue(raw) {
  const text = raw.trim();
  if (/^null$/i.test(text)) return null;
  if (text.startsWith("'") && text.endsWith("'")) {
    return decodeSqlString(text.slice(1, -1));
  }
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  return text;
}

function parseTuple(tupleText) {
  const values = [];
  let current = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < tupleText.length; i += 1) {
    const ch = tupleText[i];
    if (inString) {
      current += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "'") {
        inString = false;
      }
      continue;
    }

    if (ch === "'") {
      inString = true;
      current += ch;
      continue;
    }
    if (ch === ",") {
      values.push(decodeSqlValue(current));
      current = "";
      continue;
    }
    current += ch;
  }
  values.push(decodeSqlValue(current));
  return values;
}

function extractTuples(valuesBlock) {
  const tuples = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < valuesBlock.length; i += 1) {
    const ch = valuesBlock[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "'") {
        inString = false;
      }
      continue;
    }

    if (ch === "'") {
      inString = true;
      continue;
    }
    if (ch === "(") {
      if (depth === 0) start = i + 1;
      depth += 1;
      continue;
    }
    if (ch === ")") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        tuples.push(valuesBlock.slice(start, i));
        start = -1;
      }
    }
  }
  return tuples;
}

function parseInsertStatement(statement) {
  const match = statement.match(
    /INSERT\s+INTO\s+`?([a-zA-Z0-9_]+)`?\s*\(([\s\S]*?)\)\s*VALUES\s*([\s\S]*?)\s*;?\s*$/i
  );
  if (!match) return null;
  const table = match[1];
  const columns = splitCsv(match[2]);
  const tuples = extractTuples(match[3]).map(parseTuple);
  return { table, columns, tuples };
}

export async function parseSqlFileInserts(sqlPath, onRow) {
  const input = fs.createReadStream(sqlPath, { encoding: "utf8" });
  const rl = readline.createInterface({ input, crlfDelay: Infinity });

  let collecting = false;
  let statement = "";
  let rowsParsed = 0;

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!collecting) {
      if (!/^INSERT\s+INTO/i.test(trimmed)) continue;
      collecting = true;
      statement = `${line}\n`;
      if (trimmed.endsWith(";")) {
        const parsed = parseInsertStatement(statement);
        if (parsed) {
          for (const tuple of parsed.tuples) {
            const row = Object.fromEntries(parsed.columns.map((c, idx) => [c, tuple[idx]]));
            await onRow({ table: parsed.table, row });
            rowsParsed += 1;
          }
        }
        collecting = false;
        statement = "";
      }
      continue;
    }

    statement += `${line}\n`;
    if (trimmed.endsWith(";")) {
      const parsed = parseInsertStatement(statement);
      if (parsed) {
        for (const tuple of parsed.tuples) {
          const row = Object.fromEntries(parsed.columns.map((c, idx) => [c, tuple[idx]]));
          await onRow({ table: parsed.table, row });
          rowsParsed += 1;
        }
      }
      collecting = false;
      statement = "";
    }
  }

  return rowsParsed;
}
