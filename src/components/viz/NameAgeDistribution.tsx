import * as duckdb from "@duckdb/duckdb-wasm";
import duckdbEhWasm from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import duckdbEhWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";
import duckdbMvpWasm from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";
import duckdbMvpWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";
import { useId, useMemo, useState, type CSSProperties, type JSX } from "react";

const DATA_FILE = "/data/name-age/ssa-national-names.csv.gz";
const META_FILE = "/data/name-age/ssa-national-names.meta.json";
const CURRENT_YEAR = new Date().getFullYear();

const WIDTH = 920;
const HEIGHT = 390;
const PAD = { top: 30, right: 28, bottom: 58, left: 58 };
const PLOT_WIDTH = WIDTH - PAD.left - PAD.right;
const PLOT_HEIGHT = HEIGHT - PAD.top - PAD.bottom;

const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
  mvp: {
    mainModule: duckdbMvpWasm,
    mainWorker: duckdbMvpWorker
  },
  eh: {
    mainModule: duckdbEhWasm,
    mainWorker: duckdbEhWorker
  }
};

type Sex = "F" | "M";
type Status = "idle" | "loading" | "ready" | "no-data" | "error";

interface DataMeta {
  sourceUrl: string;
  sourceDatasetUrl: string;
  downloadedFrom: string;
  generatedAt: string;
  minBirthYear: number;
  maxBirthYear: number;
  rowCount: number;
  totalCount: number;
}

interface QueryDatum {
  birthYear: number;
  births: number;
  probability: number;
  overallBirthCount: number;
  overallPercentile: number;
  yearBirthCount: number;
  yearPercentile: number;
}

interface ChartDatum extends QueryDatum {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface QueryResult {
  name: string;
  normalizedName: string;
  sex: Sex;
  totalBirths: number;
  overallBirthCount: number;
  overallPercentile: number;
  peakYear: number;
  medianYear: number;
  rows: QueryDatum[];
  meta: DataMeta;
}

interface DuckState {
  conn: duckdb.AsyncDuckDBConnection;
  statement: duckdb.AsyncPreparedStatement;
  meta: DataMeta;
}

let duckStatePromise: Promise<DuckState> | null = null;

export default function NameAgeDistribution(): JSX.Element {
  const nameInputId = useId();
  const statusId = useId();
  const [name, setName] = useState("");
  const [sex, setSex] = useState<Sex | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [activeBar, setActiveBar] = useState<ChartDatum | null>(null);
  const [activePopularity, setActivePopularity] = useState<ChartDatum | null>(null);
  const [message, setMessage] = useState("Enter a name and choose female or male.");

  const chart = useMemo(() => (result ? makeChartData(result) : null), [result]);

  async function handleSubmit(event: { preventDefault: () => void }) {
    event.preventDefault();
    const normalizedName = normalizeName(name);

    if (!normalizedName) {
      setStatus("idle");
      setResult(null);
      setMessage("Enter a first name.");
      return;
    }

    if (!sex) {
      setStatus("idle");
      setResult(null);
      setMessage("Choose female or male.");
      return;
    }

    setStatus("loading");
    setActiveBar(null);
    setActivePopularity(null);
    setMessage("Loading the SSA dataset into DuckDB.");

    try {
      const state = await getDuckState();
      const rows = await queryDistribution(state, normalizedName, sex);
      if (rows.length === 0) {
        setResult(null);
        setStatus("no-data");
        setMessage(`No SSA records found for ${name.trim()} (${sexLabel(sex)}).`);
        return;
      }

      const totalBirths = rows.reduce((sum, row) => sum + row.births, 0);
      const peak = rows.reduce((best, row) => (row.births > best.births ? row : best), rows[0]);
      setResult({
        name: name.trim(),
        normalizedName,
        sex,
        totalBirths,
        overallBirthCount: rows[0].overallBirthCount,
        overallPercentile: rows[0].overallPercentile,
        peakYear: peak.birthYear,
        medianYear: findMedianYear(rows, totalBirths),
        rows,
        meta: state.meta
      });
      setStatus("ready");
      setMessage(`Showing ${rows.length} birth-year records for ${name.trim()} (${sexLabel(sex)}).`);
    } catch (error) {
      console.error(error);
      setResult(null);
      setStatus("error");
      setMessage("The data failed to load. Try refreshing the page.");
    }
  }

  return (
    <section className="name-age-app" aria-labelledby="name-age-app-title">
      <div className="name-age-app-header">
        <div>
          <h2 id="name-age-app-title">Estimate a birth cohort</h2>
          <p>Exact first-name matches, separated by sex, from SSA national counts.</p>
        </div>
        {result && (
          <code>
            data through {result.meta.maxBirthYear}
          </code>
        )}
      </div>

      <form className="name-age-form" onSubmit={handleSubmit}>
        <label className="name-age-field" htmlFor={nameInputId}>
          <span>First name</span>
          <input
            id={nameInputId}
            autoComplete="given-name"
            inputMode="text"
            placeholder="Mary"
            type="text"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
        </label>

        <fieldset className="name-age-sex">
          <legend>Sex</legend>
          <div role="radiogroup" aria-label="Sex">
            {(["F", "M"] as const).map((option) => (
              <label className={sex === option ? "is-selected" : ""} key={option}>
                <input
                  checked={sex === option}
                  name="sex"
                  type="radio"
                  value={option}
                  onChange={() => setSex(option)}
                />
                <span>{sexLabel(option)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <button className="name-age-submit" type="submit" disabled={status === "loading"}>
          {status === "loading" ? "loading" : "estimate"}
        </button>
      </form>

      <p className={`name-age-status name-age-status-${status}`} id={statusId} role="status">
        {message}
      </p>

      {status === "no-data" && (
        <p className="name-age-note">
          SSA suppresses low-count name/year/sex cells, so rare names can have missing or no rows.
        </p>
      )}

      {result && chart && (
        <>
          <dl className="name-age-summary" aria-label="Distribution summary">
            <div>
              <dt>Total records</dt>
              <dd>{formatCount(result.totalBirths)}</dd>
            </div>
            <div>
              <dt>Overall percentile</dt>
              <dd>{formatPercentileLabel(result.overallPercentile)}</dd>
            </div>
            <div>
              <dt>Peak year</dt>
              <dd>{result.peakYear}</dd>
            </div>
            <div>
              <dt>Median year</dt>
              <dd>{result.medianYear}</dd>
            </div>
          </dl>

          <figure className="name-age-chart" aria-labelledby="name-age-chart-title">
            <figcaption id="name-age-chart-title">
              P(birth year | {result.normalizedName}, {result.sex})
            </figcaption>
            <div className="name-age-chart-wrap" onMouseLeave={() => setActiveBar(null)}>
              <svg
                aria-describedby={statusId}
                className="name-age-svg"
                role="img"
                viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              >
                <line className="name-age-axis" x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + PLOT_HEIGHT} />
                <line
                  className="name-age-axis"
                  x1={PAD.left}
                  y1={PAD.top + PLOT_HEIGHT}
                  x2={PAD.left + PLOT_WIDTH}
                  y2={PAD.top + PLOT_HEIGHT}
                />

                {chart.yTicks.map((tick) => {
                  const y = yForProbability(tick, chart.yMax);
                  return (
                    <g key={tick}>
                      <line className="name-age-grid" x1={PAD.left} y1={y} x2={PAD.left + PLOT_WIDTH} y2={y} />
                      <text className="name-age-label" x={PAD.left - 10} y={y + 4} textAnchor="end">
                        {formatPercent(tick, tick < 0.1 ? 1 : 0)}
                      </text>
                    </g>
                  );
                })}

                {chart.xTicks.map((year) => {
                  const x = xForYear(year, chart);
                  return (
                    <g key={year}>
                      <line className="name-age-grid" x1={x} y1={PAD.top} x2={x} y2={PAD.top + PLOT_HEIGHT} />
                      <text className="name-age-label" x={x} y={PAD.top + PLOT_HEIGHT + 28} textAnchor="middle">
                        {year}
                      </text>
                    </g>
                  );
                })}

                {chart.rows.map((row) => (
                  <rect
                    aria-label={`${row.birthYear}: ${formatPercent(row.probability, 3)} probability, ${formatCount(row.births)} births, turns ${CURRENT_YEAR - row.birthYear} in ${CURRENT_YEAR}`}
                    className={activeBar?.birthYear === row.birthYear ? "name-age-bar is-active" : "name-age-bar"}
                    height={row.height}
                    key={row.birthYear}
                    role={row.births > 0 ? "img" : undefined}
                    tabIndex={row.births > 0 ? 0 : -1}
                    width={row.width}
                    x={row.x}
                    y={row.y}
                    onBlur={() => setActiveBar(null)}
                    onFocus={() => row.births > 0 && setActiveBar(row)}
                    onMouseEnter={() => row.births > 0 && setActiveBar(row)}
                  />
                ))}

                <text className="name-age-label" x={PAD.left} y={PAD.top - 12}>
                  probability mass
                </text>
                <text className="name-age-label" x={PAD.left + PLOT_WIDTH} y={PAD.top + PLOT_HEIGHT + 48} textAnchor="end">
                  birth year
                </text>
              </svg>

              {activeBar && (
                <div className="name-age-tooltip" style={tooltipStyle(activeBar)}>
                  <strong>{activeBar.birthYear}</strong>
                  <span>{formatPercent(activeBar.probability, 3)} probability</span>
                  <span>{formatCount(activeBar.births)} births</span>
                  <span>turns {CURRENT_YEAR - activeBar.birthYear} in {CURRENT_YEAR}</span>
                </div>
              )}
            </div>
          </figure>

          <figure className="name-age-chart" aria-labelledby="name-age-popularity-title">
            <figcaption id="name-age-popularity-title">
              Birth-weighted popularity percentile
            </figcaption>
            <div className="name-age-chart-wrap" onMouseLeave={() => setActivePopularity(null)}>
              <svg
                aria-describedby={statusId}
                className="name-age-svg"
                role="img"
                viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              >
                <line className="name-age-axis" x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + PLOT_HEIGHT} />
                <line
                  className="name-age-axis"
                  x1={PAD.left}
                  y1={PAD.top + PLOT_HEIGHT}
                  x2={PAD.left + PLOT_WIDTH}
                  y2={PAD.top + PLOT_HEIGHT}
                />

                {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
                  const y = yForPercentile(tick);
                  return (
                    <g key={tick}>
                      <line className="name-age-grid" x1={PAD.left} y1={y} x2={PAD.left + PLOT_WIDTH} y2={y} />
                      <text className="name-age-label" x={PAD.left - 10} y={y + 4} textAnchor="end">
                        {formatPercent(tick, 0)}
                      </text>
                    </g>
                  );
                })}

                {chart.xTicks.map((year) => {
                  const x = xForYear(year, chart);
                  return (
                    <g key={year}>
                      <line className="name-age-grid" x1={x} y1={PAD.top} x2={x} y2={PAD.top + PLOT_HEIGHT} />
                      <text className="name-age-label" x={x} y={PAD.top + PLOT_HEIGHT + 28} textAnchor="middle">
                        {year}
                      </text>
                    </g>
                  );
                })}

                {chart.rows.map((row) => (
                  <rect
                    aria-label={`${row.birthYear}: ${formatPercentileLabel(row.yearPercentile)}, ${formatPercent(row.yearPercentile, 1)} of ${sexLabel(result.sex).toLowerCase()} births had names as rare or rarer, ${formatCount(row.births)} births`}
                    className={
                      activePopularity?.birthYear === row.birthYear
                        ? "name-age-bar name-age-popularity-bar is-active"
                        : "name-age-bar name-age-popularity-bar"
                    }
                    height={(row.yearPercentile / 1) * PLOT_HEIGHT}
                    key={row.birthYear}
                    role={row.births > 0 ? "img" : undefined}
                    tabIndex={row.births > 0 ? 0 : -1}
                    width={row.width}
                    x={row.x}
                    y={yForPercentile(row.yearPercentile)}
                    onBlur={() => setActivePopularity(null)}
                    onFocus={() => row.births > 0 && setActivePopularity(row)}
                    onMouseEnter={() => row.births > 0 && setActivePopularity(row)}
                  />
                ))}

                <text className="name-age-label" x={PAD.left} y={PAD.top - 12}>
                  share of births with names as rare or rarer
                </text>
                <text className="name-age-label" x={PAD.left + PLOT_WIDTH} y={PAD.top + PLOT_HEIGHT + 48} textAnchor="end">
                  birth year
                </text>
              </svg>

              {activePopularity && (
                <div className="name-age-tooltip" style={tooltipStyle(activePopularity)}>
                  <strong>{activePopularity.birthYear}</strong>
                  <span>{formatPercentileLabel(activePopularity.yearPercentile)}</span>
                  <span>{formatPercent(activePopularity.yearPercentile, 1)} of {sexLabel(result.sex).toLowerCase()} births had names as rare or rarer</span>
                  <span>{formatCount(activePopularity.births)} births</span>
                </div>
              )}
            </div>
          </figure>
          <p className="name-age-plot-note">
            Popularity percentiles are weighted by births, not by distinct name
            labels. A value of 75% means that 75% of babies in that sex/year
            group had names that were as rare or rarer, and 25% had more common
            names.
          </p>
        </>
      )}
    </section>
  );
}

async function getDuckState() {
  duckStatePromise ??= initializeDuckState();
  return duckStatePromise;
}

async function initializeDuckState(): Promise<DuckState> {
  const [bundle, dataResponse, metaResponse] = await Promise.all([
    duckdb.selectBundle(MANUAL_BUNDLES),
    fetch(DATA_FILE),
    fetch(META_FILE)
  ]);

  if (!dataResponse.ok) {
    throw new Error(`Could not fetch ${DATA_FILE}: ${dataResponse.status}`);
  }
  if (!metaResponse.ok) {
    throw new Error(`Could not fetch ${META_FILE}: ${metaResponse.status}`);
  }

  const worker = new Worker(bundle.mainWorker!);
  const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  const dataBytes = new Uint8Array(await dataResponse.arrayBuffer());
  const duckdbFile = isGzip(dataBytes) ? "ssa-national-names.csv.gz" : "ssa-national-names.csv";
  await db.registerFileBuffer(duckdbFile, dataBytes);

  const conn = await db.connect();
  await conn.query(`
    CREATE TABLE names AS
      SELECT name_lc, name, sex, birth_year, "count"
      FROM read_csv(
        '${duckdbFile}',
        header = true,
        columns = {
          'name_lc': 'VARCHAR',
          'name': 'VARCHAR',
          'sex': 'VARCHAR',
          'birth_year': 'INTEGER',
          'count': 'INTEGER'
        }
      );
  `);
  try {
    await conn.query("CREATE INDEX names_lookup ON names(name_lc, sex);");
  } catch {
    // DuckDB can still scan this small local table if indexes are unavailable.
  }
  await conn.query(`
    CREATE TABLE overall_name_popularity AS
      WITH totals AS (
        SELECT sex, name_lc, SUM("count") AS total_births
        FROM names
        GROUP BY sex, name_lc
      ),
      ranked AS (
        SELECT
          sex,
          name_lc,
          total_births,
          SUM(total_births) OVER (
            PARTITION BY sex
            ORDER BY total_births
            RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ) AS births_as_rare_or_rarer,
          SUM(total_births) OVER (PARTITION BY sex) AS overall_birth_count
        FROM totals
      )
      SELECT
        sex,
        name_lc,
        total_births,
        births_as_rare_or_rarer / CAST(overall_birth_count AS DOUBLE) AS overall_percentile,
        overall_birth_count
      FROM ranked;
  `);
  await conn.query(`
    CREATE TABLE yearly_name_popularity AS
      WITH ranked AS (
        SELECT
          sex,
          birth_year,
          name_lc,
          "count" AS births,
          SUM("count") OVER (
            PARTITION BY sex, birth_year
            ORDER BY "count"
            RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ) AS births_as_rare_or_rarer,
          SUM("count") OVER (PARTITION BY sex, birth_year) AS year_birth_count
        FROM names
      )
      SELECT
        sex,
        birth_year,
        name_lc,
        births,
        births_as_rare_or_rarer / CAST(year_birth_count AS DOUBLE) AS year_percentile,
        year_birth_count
      FROM ranked;
  `);

  const statement = await conn.prepare(`
    WITH selected AS (
      SELECT birth_year, sex, name_lc, SUM("count") AS births
      FROM names
      WHERE name_lc = ? AND sex = ?
      GROUP BY birth_year, sex, name_lc
    ),
    total AS (
      SELECT SUM(births) AS total_births FROM selected
    )
    SELECT
      selected.birth_year,
      selected.births,
      selected.births / CAST(total.total_births AS DOUBLE) AS probability,
      yearly_name_popularity.year_percentile,
      yearly_name_popularity.year_birth_count,
      overall_name_popularity.overall_percentile,
      overall_name_popularity.overall_birth_count
    FROM selected
    CROSS JOIN total
    JOIN yearly_name_popularity
      ON yearly_name_popularity.sex = selected.sex
      AND yearly_name_popularity.name_lc = selected.name_lc
      AND yearly_name_popularity.birth_year = selected.birth_year
    JOIN overall_name_popularity
      ON overall_name_popularity.sex = selected.sex
      AND overall_name_popularity.name_lc = selected.name_lc
    ORDER BY selected.birth_year;
  `);

  return {
    conn,
    statement,
    meta: await metaResponse.json() as DataMeta
  };
}

async function queryDistribution(state: DuckState, normalizedName: string, sex: Sex): Promise<QueryDatum[]> {
  const table = await state.statement.query(normalizedName, sex);
  return (table.toArray() as Array<Record<string, unknown>>).map((row) => ({
    birthYear: numberFromCell(row.birth_year),
    births: numberFromCell(row.births),
    probability: numberFromCell(row.probability),
    yearBirthCount: numberFromCell(row.year_birth_count),
    yearPercentile: numberFromCell(row.year_percentile),
    overallBirthCount: numberFromCell(row.overall_birth_count),
    overallPercentile: numberFromCell(row.overall_percentile)
  }));
}

function makeChartData(result: QueryResult) {
  const byYear = new Map(result.rows.map((row) => [row.birthYear, row]));
  const years = Array.from(
    { length: result.meta.maxBirthYear - result.meta.minBirthYear + 1 },
    (_, index) => result.meta.minBirthYear + index
  );
  const yMax = niceProbabilityMax(Math.max(...result.rows.map((row) => row.probability)));
  const slotWidth = PLOT_WIDTH / years.length;
  const barWidth = Math.max(2, slotWidth * 0.72);
  const rows = years.map((year, index) => {
    const source = byYear.get(year) ?? {
      birthYear: year,
      births: 0,
      probability: 0,
      overallBirthCount: result.overallBirthCount,
      overallPercentile: result.overallPercentile,
      yearBirthCount: 0,
      yearPercentile: 0
    };
    const height = (source.probability / yMax) * PLOT_HEIGHT;
    return {
      ...source,
      index,
      x: PAD.left + index * slotWidth + (slotWidth - barWidth) / 2,
      y: PAD.top + PLOT_HEIGHT - height,
      width: barWidth,
      height
    };
  });

  return {
    rows,
    yMax,
    yTicks: [0, yMax / 4, yMax / 2, (yMax * 3) / 4, yMax],
    xTicks: makeYearTicks(result.meta.minBirthYear, result.meta.maxBirthYear),
    minBirthYear: result.meta.minBirthYear,
    maxBirthYear: result.meta.maxBirthYear
  };
}

function findMedianYear(rows: QueryDatum[], totalBirths: number) {
  let cumulative = 0;
  for (const row of rows) {
    cumulative += row.births;
    if (cumulative >= totalBirths / 2) {
      return row.birthYear;
    }
  }
  return rows.at(-1)?.birthYear ?? CURRENT_YEAR;
}

function xForYear(year: number, chart: ReturnType<typeof makeChartData>) {
  const span = chart.maxBirthYear - chart.minBirthYear;
  return PAD.left + ((year - chart.minBirthYear) / span) * PLOT_WIDTH;
}

function yForProbability(probability: number, yMax: number) {
  return PAD.top + PLOT_HEIGHT - (probability / yMax) * PLOT_HEIGHT;
}

function yForPercentile(percentile: number) {
  return PAD.top + PLOT_HEIGHT - percentile * PLOT_HEIGHT;
}

function makeYearTicks(minYear: number, maxYear: number) {
  const ticks = [minYear];
  for (let year = Math.ceil(minYear / 20) * 20; year < maxYear; year += 20) {
    if (year !== minYear) ticks.push(year);
  }
  ticks.push(maxYear);
  return ticks;
}

function niceProbabilityMax(value: number) {
  const padded = Math.max(value * 1.08, 0.01);
  if (padded <= 0.02) return 0.02;
  if (padded <= 0.05) return 0.05;
  if (padded <= 0.1) return 0.1;
  if (padded <= 0.2) return 0.2;
  return Math.min(1, Math.ceil(padded * 10) / 10);
}

function normalizeName(value: string) {
  return value.trim().replace(/[\s-]+/g, "").toLocaleLowerCase("en-US");
}

function sexLabel(value: Sex) {
  return value === "F" ? "Female" : "Male";
}

function numberFromCell(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  return Number(String(value));
}

function isGzip(bytes: Uint8Array) {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatPercent(value: number, digits = 2) {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value);
}

function formatPercentileLabel(value: number) {
  const percentile = value * 100;
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: percentile < 99 ? 1 : 0,
    maximumFractionDigits: percentile < 99 ? 1 : 0
  }).format(percentile);
  return `${formatted}${ordinalSuffix(percentile)} percentile`;
}

function ordinalSuffix(value: number) {
  const rounded = Math.round(value);
  const mod100 = rounded % 100;
  if (mod100 >= 11 && mod100 <= 13) return "th";
  switch (rounded % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

function tooltipStyle(row: ChartDatum): CSSProperties {
  return {
    left: `${((row.x + row.width / 2) / WIDTH) * 100}%`,
    top: `${((row.y + Math.min(row.height, 12)) / HEIGHT) * 100}%`
  };
}
