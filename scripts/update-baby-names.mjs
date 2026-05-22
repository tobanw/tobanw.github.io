import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync, strFromU8, unzipSync } from "fflate";

const OFFICIAL_SOURCE_URL = "https://www.ssa.gov/oact/babynames/names.zip";
const FALLBACK_SOURCE_URL = "https://github.com/MalinMorris/NameData/archive/refs/heads/main.zip";
const SOURCE_DATASET_URL = "https://catalog.data.gov/dataset/baby-names-from-social-security-card-applications-national-data";
const OUTPUT_DIR = "public/data/name-age";
const CSV_PATH = path.join(OUTPUT_DIR, "ssa-national-names.csv.gz");
const META_PATH = path.join(OUTPUT_DIR, "ssa-national-names.meta.json");

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (!key?.startsWith("--") || !value) {
    throw new Error(`Expected arguments in --key value pairs. Received ${key ?? ""} ${value ?? ""}`.trim());
  }
  args.set(key.slice(2), value);
}

const sources = args.has("source")
  ? [args.get("source")]
  : [OFFICIAL_SOURCE_URL, FALLBACK_SOURCE_URL];

const downloaded = await downloadFirstAvailable(sources);
const rows = parseSource(downloaded);
if (rows.length === 0) {
  throw new Error("No baby name rows were parsed from the source data.");
}

rows.sort((a, b) => {
  if (a.nameLc !== b.nameLc) return a.nameLc.localeCompare(b.nameLc);
  if (a.sex !== b.sex) return a.sex.localeCompare(b.sex);
  return a.birthYear - b.birthYear;
});

let minBirthYear = Infinity;
let maxBirthYear = -Infinity;
let totalCount = 0;
const lines = ["name_lc,name,sex,birth_year,count"];
for (const row of rows) {
  minBirthYear = Math.min(minBirthYear, row.birthYear);
  maxBirthYear = Math.max(maxBirthYear, row.birthYear);
  totalCount += row.count;
  lines.push(`${row.nameLc},${row.name},${row.sex},${row.birthYear},${row.count}`);
}

await mkdir(OUTPUT_DIR, { recursive: true });
await writeFile(CSV_PATH, gzipSync(new TextEncoder().encode(`${lines.join("\n")}\n`)));
await writeFile(
  META_PATH,
  `${JSON.stringify(
    {
      sourceUrl: OFFICIAL_SOURCE_URL,
      sourceDatasetUrl: SOURCE_DATASET_URL,
      downloadedFrom: downloaded.url,
      generatedAt: new Date().toISOString(),
      minBirthYear,
      maxBirthYear,
      rowCount: rows.length,
      totalCount
    },
    null,
    2
  )}\n`
);

console.log(`Wrote ${CSV_PATH} with ${rows.length.toLocaleString("en-US")} rows.`);
console.log(`Wrote ${META_PATH}.`);

async function downloadFirstAvailable(urls) {
  const errors = [];
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "tobanwiebe.com baby names data updater"
        }
      });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      return {
        url,
        bytes: new Uint8Array(await response.arrayBuffer())
      };
    } catch (error) {
      errors.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`Could not download any baby names source:\n${errors.join("\n")}`);
}

function parseSource({ url, bytes }) {
  if (url.endsWith(".zip")) {
    return parseSsaZip(bytes);
  }
  return parseCombinedText(strFromU8(bytes));
}

function parseSsaZip(bytes) {
  const files = unzipSync(bytes);
  const rows = [];
  for (const [fileName, fileBytes] of Object.entries(files)) {
    const match = fileName.match(/(?:^|\/)yob(\d{4})\.txt$/);
    if (!match) continue;
    const birthYear = Number(match[1]);
    for (const line of strFromU8(fileBytes).trim().split(/\r?\n/)) {
      const [name, sex, count] = line.split(",");
      rows.push(makeRow(name, sex, birthYear, Number(count)));
    }
  }
  return rows;
}

function parseCombinedText(text) {
  const rows = [];
  for (const line of text.trim().split(/\r?\n/)) {
    const [name, sex, count, birthYear] = line.split(",");
    rows.push(makeRow(name, sex, Number(birthYear), Number(count)));
  }
  return rows;
}

function makeRow(name, sex, birthYear, count) {
  if (!name || !/^[FM]$/.test(sex) || !Number.isInteger(birthYear) || !Number.isInteger(count)) {
    throw new Error(`Invalid row: ${[name, sex, birthYear, count].join(",")}`);
  }

  return {
    name,
    nameLc: name.toLocaleLowerCase("en-US"),
    sex,
    birthYear,
    count
  };
}
