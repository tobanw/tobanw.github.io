import * as duckdb from "@duckdb/duckdb-wasm";
import duckdbEhWasm from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import duckdbEhWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";
import duckdbMvpWasm from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";
import duckdbMvpWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";
import { gunzipSync, strFromU8 } from "fflate";
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type JSX } from "react";

const DATA_FILE = "/data/name-age/ssa-national-names.csv.gz";
const META_FILE = "/data/name-age/ssa-national-names.meta.json";
const NAME_INDEX_CACHE_DB = "name-age-index-cache";
const NAME_INDEX_CACHE_STORE = "indexes";
const NAME_INDEX_CACHE_KEY = "name-age-ssa-v1";
const CACHE_SCHEMA_VERSION = 1;
const CURRENT_YEAR = new Date().getFullYear();
const SHARE_APP_PATH = "/names";
const SHARE_APP_URL = "https://tobanwiebe.com/names/";
const SHARE_APP_CTA = "Try your name at tobanwiebe.com/names";
const SHARE_APP_LABEL = "tobanwiebe.com/names";

const WIDTH = 920;
const HEIGHT = 390;
const PAD = { top: 30, right: 28, bottom: 58, left: 58 };
const PLOT_WIDTH = WIDTH - PAD.left - PAD.right;
const PLOT_HEIGHT = HEIGHT - PAD.top - PAD.bottom;
const SHARE_PLOT = { top: 44, bottom: 158, left: 44, right: 656, width: 612, height: 114 };

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

const NAME_AGE_CACHE_TABLES = [
  "names",
  "overall_name_popularity",
  "yearly_name_popularity",
  "recent_name_popularity",
  "name_age_cache_meta"
] as const;

type Sex = "F" | "M";
type Status = "idle" | "loading" | "ready" | "no-data" | "error";
type ShareRangeStatus = "idle" | "loading" | "ready" | "error";
type DataStorage = "indexeddb" | "duckdb-memory";

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
  recentPercentile: number | null;
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
  recentPercentile: number | null;
  recentStartYear: number;
  recentEndYear: number;
  highestYearPercentile: number;
  highestPercentileYear: number;
  peakYear: number;
  medianYear: number;
  rows: QueryDatum[];
  meta: DataMeta;
}

interface ShareDetails {
  text: string;
  url: string;
  appUrl: string;
  appPath: string;
  cta: string;
  appLabel: string;
  filename: string;
  resultLabel: string;
  resultName: string;
  sexSymbol: string;
  source: string;
  sourceUrl: string;
  rangeLabel: string;
  rangePercentile: number | null;
  rangePeakYear: number | null;
  rangeStatus: ShareRangeStatus;
}

interface ShareRange {
  startYear: number;
  endYear: number;
  percentile: number | null;
  status: ShareRangeStatus;
}

interface DuckState {
  kind: "duckdb";
  conn: duckdb.AsyncDuckDBConnection;
  statement: duckdb.AsyncPreparedStatement;
  rangeStatement: duckdb.AsyncPreparedStatement;
  meta: DataMeta;
  storage: DataStorage;
}

interface NameIndexState {
  kind: "index";
  index: NameIndex;
  meta: DataMeta;
  storage: DataStorage;
}

type DataState = DuckState | NameIndexState;

interface NameIndex {
  meta: DataMeta;
  minBirthYear: number;
  maxBirthYear: number;
  yearCount: number;
  nameLcs: string[];
  names: string[];
  sexCodes: Uint8Array;
  rowStarts: Uint32Array;
  yearOffsets: Uint16Array;
  counts: Uint32Array;
  yearPercentiles: Float32Array;
  totalBirths: Uint32Array;
  recentBirths: Uint32Array;
  overallPercentiles: Float32Array;
  recentPercentiles: Float32Array;
  overallBirthCounts: { F: number; M: number };
  yearBirthCounts: { F: Uint32Array; M: Uint32Array };
  recordByKey: Map<string, number>;
  recordsBySex: { F: number[]; M: number[] };
}

interface CachedNameIndexRecord {
  schemaVersion: number;
  generatedAt: string;
  minBirthYear: number;
  maxBirthYear: number;
  rowCount: number;
  totalCount: number;
  nameLcs: string[];
  names: string[];
  sexCodes: Uint8Array;
  rowStarts: Uint32Array;
  yearOffsets: Uint16Array;
  counts: Uint32Array;
  yearPercentiles: Float32Array;
  totalBirths: Uint32Array;
  recentBirths: Uint32Array;
  overallPercentiles: Float32Array;
  recentPercentiles: Float32Array;
  overallBirthCountF: number;
  overallBirthCountM: number;
  yearBirthCountsF: Uint32Array;
  yearBirthCountsM: Uint32Array;
}

interface MutableNameRecord {
  nameLc: string;
  name: string;
  sex: Sex;
  years: number[];
  counts: number[];
  totalBirths: number;
  recentBirths: number;
}

let dataStatePromise: Promise<DataState> | null = null;

function LoadingDots(): JSX.Element {
  return (
    <span className="name-age-loading-dots" aria-hidden="true">
      <span>.</span>
      <span>.</span>
      <span>.</span>
    </span>
  );
}

export default function NameAgeDistribution(): JSX.Element {
  const nameInputId = useId();
  const statusId = useId();
  const shareTitleId = useId();
  const hydratedFromUrl = useRef(false);
  const [name, setName] = useState("");
  const [sex, setSex] = useState<Sex | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [activeBar, setActiveBar] = useState<ChartDatum | null>(null);
  const [activePopularity, setActivePopularity] = useState<ChartDatum | null>(null);
  const [message, setMessage] = useState("Enter a name and choose female or male.");
  const [shareMessage, setShareMessage] = useState("");
  const [manualShareText, setManualShareText] = useState("");
  const [shareRangeStartYear, setShareRangeStartYear] = useState<number | null>(null);
  const [shareRangeEndYear, setShareRangeEndYear] = useState<number | null>(null);
  const [shareRangePercentile, setShareRangePercentile] = useState<number | null>(null);
  const [shareRangeStatus, setShareRangeStatus] = useState<ShareRangeStatus>("idle");

  const chart = useMemo(() => (result ? makeChartData(result) : null), [result]);
  const shareRange = useMemo<ShareRange | null>(() => {
    if (shareRangeStartYear === null || shareRangeEndYear === null) return null;
    return {
      startYear: shareRangeStartYear,
      endYear: shareRangeEndYear,
      percentile: shareRangePercentile,
      status: shareRangeStatus
    };
  }, [shareRangeEndYear, shareRangePercentile, shareRangeStartYear, shareRangeStatus]);
  const share = useMemo(() => (result && shareRange ? makeShareDetails(result, shareRange) : null), [result, shareRange]);

  useEffect(() => {
    if (hydratedFromUrl.current) return;
    hydratedFromUrl.current = true;

    const params = new URLSearchParams(window.location.search);
    const urlName = params.get("name");
    const urlSex = parseSex(params.get("sex"));
    if (!urlName || !urlSex) return;

    const initialName = displayNameFromParam(urlName);
    setName(initialName);
    setSex(urlSex);
    void runQuery(initialName, urlSex, false, parseRangeParams(params));
  }, []);

  useEffect(() => {
    if (!result || shareRangeStartYear === null || shareRangeEndYear === null) return;

    if (shareRangeStartYear === result.recentStartYear && shareRangeEndYear === result.recentEndYear) {
      setShareRangePercentile(result.recentPercentile);
      setShareRangeStatus("ready");
      return;
    }

    let cancelled = false;
    setShareRangeStatus("loading");

    const timeout = window.setTimeout(() => {
      void (async () => {
        try {
          const state = await getDataState();
          const percentile = await queryRangePercentile(
            state,
            result.normalizedName,
            result.sex,
            shareRangeStartYear,
            shareRangeEndYear
          );
          if (cancelled) return;
          setShareRangePercentile(percentile);
          setShareRangeStatus("ready");
        } catch (error) {
          console.error(error);
          if (cancelled) return;
          setShareRangePercentile(null);
          setShareRangeStatus("error");
        }
      })();
    }, 160);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [result, shareRangeEndYear, shareRangeStartYear]);

  async function handleSubmit(event: { preventDefault: () => void }) {
    event.preventDefault();
    await runQuery(name, sex, true);
  }

  async function runQuery(
    rawName: string,
    selectedSex: Sex | null,
    updateUrl: boolean,
    requestedRange: { startYear: number; endYear: number } | null = null
  ) {
    const displayName = rawName.trim();
    const normalizedName = normalizeName(displayName);
    setShareMessage("");
    setManualShareText("");

    if (!normalizedName) {
      setStatus("idle");
      setResult(null);
      setShareRangeStartYear(null);
      setShareRangeEndYear(null);
      setShareRangePercentile(null);
      setShareRangeStatus("idle");
      setMessage("Enter a first name.");
      return;
    }

    if (!selectedSex) {
      setStatus("idle");
      setResult(null);
      setShareRangeStartYear(null);
      setShareRangeEndYear(null);
      setShareRangePercentile(null);
      setShareRangeStatus("idle");
      setMessage("Choose female or male.");
      return;
    }

    setStatus("loading");
    setActiveBar(null);
    setActivePopularity(null);
    setMessage("Opening the name data");

    try {
      const state = await getDataState();
      const rows = await queryDistribution(state, normalizedName, selectedSex);
      if (rows.length === 0) {
        setResult(null);
        setShareRangeStartYear(null);
        setShareRangeEndYear(null);
        setShareRangePercentile(null);
        setShareRangeStatus("idle");
        setStatus("no-data");
        setMessage(`No SSA records found for ${displayName || normalizedName} (${sexLabel(selectedSex)}).`);
        return;
      }

      const totalBirths = rows.reduce((sum, row) => sum + row.births, 0);
      const peak = rows.reduce((best, row) => (row.births > best.births ? row : best), rows[0]);
      const highestPercentile = rows.reduce((best, row) => (row.yearPercentile > best.yearPercentile ? row : best), rows[0]);
      const nextResult = {
        name: displayName || titleCaseName(normalizedName),
        normalizedName,
        sex: selectedSex,
        totalBirths,
        overallBirthCount: rows[0].overallBirthCount,
        overallPercentile: rows[0].overallPercentile,
        recentPercentile: rows[0].recentPercentile,
        recentStartYear: state.meta.maxBirthYear - 9,
        recentEndYear: state.meta.maxBirthYear,
        highestYearPercentile: highestPercentile.yearPercentile,
        highestPercentileYear: highestPercentile.birthYear,
        peakYear: peak.birthYear,
        medianYear: findMedianYear(rows, totalBirths),
        rows,
        meta: state.meta
      };
      setResult(nextResult);
      const nextRange = requestedRange
        ? clampShareRange(requestedRange.startYear, requestedRange.endYear, state.meta.minBirthYear, state.meta.maxBirthYear)
        : { startYear: nextResult.recentStartYear, endYear: nextResult.recentEndYear };
      const isDefaultRange = nextRange.startYear === nextResult.recentStartYear && nextRange.endYear === nextResult.recentEndYear;
      setShareRangeStartYear(nextRange.startYear);
      setShareRangeEndYear(nextRange.endYear);
      setShareRangePercentile(isDefaultRange ? nextResult.recentPercentile : null);
      setShareRangeStatus(isDefaultRange ? "ready" : "loading");
      setStatus("ready");
      setMessage(`Showing ${rows.length} birth-year records for ${nextResult.name} (${sexLabel(selectedSex)}).`);
      if (updateUrl) {
        syncResultUrl(nextResult);
      }
    } catch (error) {
      console.error(error);
      setResult(null);
      setShareRangeStartYear(null);
      setShareRangeEndYear(null);
      setShareRangePercentile(null);
      setShareRangeStatus("idle");
      setStatus("error");
      setMessage("The data failed to load. Try refreshing the page.");
    }
  }

  function updateShareRange(nextStartYear: number, nextEndYear: number) {
    if (!result) return;
    const minYear = result.meta.minBirthYear;
    const maxYear = result.meta.maxBirthYear;
    const range = clampShareRange(nextStartYear, nextEndYear, minYear, maxYear);
    setShareRangeStartYear(range.startYear);
    setShareRangeEndYear(range.endYear);
    setShareRangePercentile(null);
    setShareRangeStatus("loading");
    setShareMessage("");
    setManualShareText("");
  }

  function handleShareRangeStartChange(event: { currentTarget: HTMLInputElement }) {
    if (shareRangeEndYear === null) return;
    updateShareRange(Math.min(Number(event.currentTarget.value), shareRangeEndYear), shareRangeEndYear);
  }

  function handleShareRangeEndChange(event: { currentTarget: HTMLInputElement }) {
    if (shareRangeStartYear === null) return;
    updateShareRange(shareRangeStartYear, Math.max(Number(event.currentTarget.value), shareRangeStartYear));
  }

  async function handleCopyShare() {
    if (!share) return;
    try {
      await copySharePayload(share);
      setShareMessage("Share text copied.");
      setManualShareText("");
    } catch (error) {
      console.error(error);
      setManualShareText(formatSharePayload(share));
      setShareMessage("Copy blocked. Copy the text below.");
    }
  }

  async function handleDownloadImage() {
    if (!result || !chart || !share) return;
    try {
      const file = await makeShareImageFile(result, chart, share);
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      link.click();
      URL.revokeObjectURL(url);
      setShareMessage("Image downloaded.");
      setManualShareText("");
    } catch (error) {
      console.error(error);
      setShareMessage("Could not create the image.");
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
          {status === "loading" ? (
            <>
              loading
              <LoadingDots />
            </>
          ) : (
            "estimate"
          )}
        </button>
      </form>

      <p className={`name-age-status name-age-status-${status}`} id={statusId} role="status">
        {message}
        {status === "loading" && <LoadingDots />}
      </p>

      {status === "no-data" && (
        <p className="name-age-note">
          SSA suppresses low-count name/year/sex cells, so rare names can have missing or no rows.
        </p>
      )}

      {result && chart && share && (
        <>
          <dl className="name-age-summary" aria-label="Distribution summary">
            <div>
              <dt>Total named {result.name}</dt>
              <dd>{formatCount(result.totalBirths)}</dd>
            </div>
            <div>
              <dt>Overall percentile</dt>
              <dd>{formatPercentileValue(result.overallPercentile)}</dd>
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
                    aria-label={`${row.birthYear}: ${formatPercentileLabel(row.yearPercentile)}, ${formatCount(row.births)} births`}
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

          <section className="name-age-share" aria-labelledby={shareTitleId}>
            <h3 className="name-age-share-heading" id={shareTitleId}>Share card</h3>
            {shareRange && (
              <div className="name-age-share-range" aria-label="Custom stats year range">
                <div className="name-age-share-range-header">
                  <span>Custom stats range</span>
                  <output>{share.rangeLabel}</output>
                </div>
                <div
                  className="name-age-share-range-slider"
                  style={shareRangeTrackStyle(result, shareRange)}
                >
                  <div className="name-age-share-range-track" aria-hidden="true">
                    <span />
                  </div>
                  <input
                    aria-label="Range start year"
                    max={result.meta.maxBirthYear}
                    min={result.meta.minBirthYear}
                    step="1"
                    type="range"
                    value={shareRange.startYear}
                    onChange={handleShareRangeStartChange}
                  />
                  <input
                    aria-label="Range end year"
                    max={result.meta.maxBirthYear}
                    min={result.meta.minBirthYear}
                    step="1"
                    type="range"
                    value={shareRange.endYear}
                    onChange={handleShareRangeEndChange}
                  />
                </div>
                <div className="name-age-share-range-bounds" aria-hidden="true">
                  <span>{result.meta.minBirthYear}</span>
                  <span>{result.meta.maxBirthYear}</span>
                </div>
              </div>
            )}
            <div className="name-age-share-card">
              <h4 aria-label={share.resultLabel}>
                <span>{share.resultName}</span>
                <span className="name-age-share-sex-symbol" aria-hidden="true">
                  {share.sexSymbol}
                </span>
              </h4>
              <dl className="name-age-share-stats" aria-label="Share stats">
                <div>
                  <dt>Birth-year probability</dt>
                  <dd className="name-age-share-metric-list">
                    <span>
                      <span>Peak</span>
                      <strong>{result.peakYear}</strong>
                    </span>
                    <span>
                      <span>Median</span>
                      <strong>{result.medianYear}</strong>
                    </span>
                    <span>
                      <span>{peakInPeriodLabel(share)}</span>
                      <strong>{formatOptionalYear(share.rangePeakYear)}</strong>
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Popularity percentile</dt>
                  <dd className="name-age-share-metric-list">
                    <span>
                      <span>{overallRangeLabel(result)}</span>
                      <strong>{renderSharePercentileValue(result.overallPercentile)}</strong>
                    </span>
                    <span>
                      <span>Best year ({result.highestPercentileYear})</span>
                      <strong>{renderSharePercentileValue(result.highestYearPercentile)}</strong>
                    </span>
                    <span>
                      <span>{overPeriodLabel(share)}</span>
                      <strong>{renderShareRangePercentileValue(share)}</strong>
                    </span>
                  </dd>
                </div>
              </dl>
              <svg
                aria-hidden="true"
                className="name-age-share-plot"
                focusable="false"
                viewBox="0 0 680 196"
              >
                <text className="name-age-share-plot-title" x="24" y="18">
                  Birth-year probability
                </text>
                {makeShareYAxisTicks(chart.yMax).map((tick) => {
                  const y = shareYForProbability(tick, chart.yMax);
                  return (
                    <g key={tick}>
                      {tick > 0 && (
                        <line className="name-age-share-grid" x1={SHARE_PLOT.left} y1={y} x2={SHARE_PLOT.right} y2={y} />
                      )}
                      <text className="name-age-share-label" x={SHARE_PLOT.left - 8} y={y + 4} textAnchor="end">
                        {formatShareAxisPercent(tick)}
                      </text>
                    </g>
                  );
                })}
                <line className="name-age-share-axis" x1={SHARE_PLOT.left} y1={SHARE_PLOT.top} x2={SHARE_PLOT.left} y2={SHARE_PLOT.bottom} />
                <line className="name-age-share-axis" x1={SHARE_PLOT.left} y1={SHARE_PLOT.bottom} x2={SHARE_PLOT.right} y2={SHARE_PLOT.bottom} />
                {makeShareYearTicks(chart.minBirthYear, chart.maxBirthYear).map((year) => {
                  const x = shareXForYear(year, chart.minBirthYear, chart.maxBirthYear);
                  const textAnchor = year === chart.minBirthYear ? "start" : year === chart.maxBirthYear ? "end" : "middle";
                  return (
                    <g key={year}>
                      <line className="name-age-share-tick" x1={x} y1={SHARE_PLOT.bottom} x2={x} y2={SHARE_PLOT.bottom + 7} />
                      <text className="name-age-share-label" x={x} y={SHARE_PLOT.bottom + 26} textAnchor={textAnchor}>
                        {year}
                      </text>
                    </g>
                  );
                })}
                {chart.rows.map((row) => {
                  const slotWidth = SHARE_PLOT.width / chart.rows.length;
                  const barWidth = Math.max(1.8, slotWidth * 0.7);
                  const height = (row.probability / chart.yMax) * SHARE_PLOT.height;
                  return (
                    <rect
                      className="name-age-share-bar"
                      height={height}
                      key={row.birthYear}
                      width={barWidth}
                      x={SHARE_PLOT.left + row.index * slotWidth + (slotWidth - barWidth) / 2}
                      y={SHARE_PLOT.bottom - height}
                    />
                  );
                })}
              </svg>
              <p className="name-age-share-source">
                Data source:{" "}
                <a href={share.sourceUrl} rel="noreferrer" target="_blank">
                  SSA baby-name records
                </a>{" "}
                {result.meta.minBirthYear}-{result.meta.maxBirthYear} (USA).
              </p>
              <p className="name-age-share-cta">
                Try your name at <a href={share.appPath}>{share.appLabel}</a>
              </p>
            </div>

            <div className="name-age-share-actions" aria-label="Share result">
              <button type="button" onClick={handleDownloadImage}>Download card (image/png)</button>
              <button type="button" onClick={handleCopyShare}>Copy stats (plaintext)</button>
            </div>

            {shareMessage && (
              <p className="name-age-share-message" role="status">
                {shareMessage}
              </p>
            )}

            {manualShareText && (
              <textarea
                aria-label="Share text"
                className="name-age-share-text"
                readOnly
                value={manualShareText}
                onClick={(event) => event.currentTarget.select()}
                onFocus={(event) => event.currentTarget.select()}
              />
            )}
          </section>
        </>
      )}
    </section>
  );
}

function makeShareDetails(result: QueryResult, range: ShareRange): ShareDetails {
  const resultLabel = `${result.name} (${sexLabel(result.sex)})`;
  const sexSymbol = sexIcon(result.sex);
  const url = makeResultUrl(result, range);
  const popularity = formatPercentileLabel(result.overallPercentile);
  const highestPopularity = formatPercentileLabel(result.highestYearPercentile);
  const rangePopularity = formatOptionalPercentileLabel(range.percentile);
  const rangeLabel = `${range.startYear}-${range.endYear}`;
  const rangePeak = findRangePeakYear(result.rows, range);
  const source = `Data source: SSA baby-name records ${result.meta.minBirthYear}-${result.meta.maxBirthYear} (USA).`;
  const text = [
    `${resultLabel} name profile`,
    "",
    "Popularity:",
    `- ${overallRangeLabel(result)}: ${popularity}`,
    `- Best year (${result.highestPercentileYear}): ${highestPopularity}`,
    `- Over period ${rangeLabel}: ${rangePopularity}`,
    "",
    "Birth-year stats:",
    `- Overall most likely birth-year: ${result.peakYear}`,
    `- Peak in period ${rangeLabel}: ${formatOptionalYear(rangePeak)}`
  ].join("\n");
  const fileNameParts = [result.normalizedName, result.sex.toLowerCase(), "name-profile"];

  return {
    text,
    url,
    appUrl: SHARE_APP_URL,
    appPath: SHARE_APP_PATH,
    cta: SHARE_APP_CTA,
    appLabel: SHARE_APP_LABEL,
    filename: `${fileNameParts.join("-")}.png`,
    resultLabel,
    resultName: result.name,
    sexSymbol,
    source,
    sourceUrl: result.meta.sourceUrl,
    rangeLabel,
    rangePercentile: range.percentile,
    rangePeakYear: rangePeak,
    rangeStatus: range.status
  };
}

function makeResultUrl(result: QueryResult, range: ShareRange) {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("name", result.normalizedName);
  url.searchParams.set("sex", result.sex);
  if (range.startYear !== result.recentStartYear || range.endYear !== result.recentEndYear) {
    url.searchParams.set("from", `${range.startYear}`);
    url.searchParams.set("to", `${range.endYear}`);
  }
  url.hash = "";
  return url.toString();
}

function syncResultUrl(result: QueryResult) {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("name", result.normalizedName);
  url.searchParams.set("sex", result.sex);
  window.history.replaceState(null, "", `${url.pathname}${url.search}`);
}

function parseSex(value: string | null): Sex | null {
  const normalized = value?.toUpperCase();
  return normalized === "F" || normalized === "M" ? normalized : null;
}

function parseRangeParams(params: URLSearchParams) {
  if (!params.has("from") || !params.has("to")) return null;
  const startYear = Number(params.get("from"));
  const endYear = Number(params.get("to"));
  if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) return null;
  return { startYear, endYear };
}

function displayNameFromParam(value: string) {
  const decoded = value.trim();
  return decoded ? titleCaseName(decoded) : "";
}

function titleCaseName(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/(^|[\s-])([a-z])/g, (_match, boundary: string, letter: string) => `${boundary}${letter.toLocaleUpperCase("en-US")}`);
}

async function copySharePayload(share: ShareDetails) {
  const payload = formatSharePayload(share);

  if (!navigator.clipboard?.writeText) {
    throw new Error("Clipboard API is unavailable.");
  }

  await navigator.clipboard.writeText(payload);
}

function formatSharePayload(share: ShareDetails) {
  return `${share.text}\n\nTry your name at ${share.appUrl}\nView this result: ${share.url}`;
}

async function makeShareImageFile(
  result: QueryResult,
  chart: ReturnType<typeof makeChartData>,
  share: ShareDetails
) {
  const blob = await renderShareImage(result, chart, share);
  return new File([blob], share.filename, { type: "image/png" });
}

async function renderShareImage(
  result: QueryResult,
  chart: ReturnType<typeof makeChartData>,
  share: ShareDetails
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 900;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas rendering is unavailable.");

  const theme = getShareCanvasTheme();
  const cardX = 40;
  const cardY = 38;
  const cardWidth = 1000;
  const cardHeight = 824;
  const innerX = cardX + 44;
  const innerWidth = cardWidth - 88;
  const statsY = cardY + 236;
  const statsGap = 24;
  const statWidth = (innerWidth - statsGap) / 2;

  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawGrid(ctx, canvas.width, canvas.height, theme.gridA, theme.gridB);
  drawShareCardBackground(ctx, cardX, cardY, cardWidth, cardHeight, 12, theme);

  ctx.fillStyle = theme.accent;
  ctx.font = "800 44px ui-monospace, SFMono-Regular, Menlo, monospace";
  fitText(ctx, "What's in a Name?", innerX, cardY + 72, innerWidth);

  ctx.fillStyle = theme.muted;
  ctx.font = "500 26px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
  fitText(ctx, "Infer someone's age from their first name", innerX, cardY + 116, innerWidth);

  ctx.fillStyle = theme.ink;
  drawNameWithSymbol(ctx, share.resultName, share.sexSymbol, innerX, cardY + 204, innerWidth, theme);

  drawYearsStatCard(
    ctx,
    innerX,
    statsY,
    statWidth,
    150,
    result,
    share,
    theme.ink,
    theme.muted,
    theme.statBg,
    theme.quiet
  );
  drawPopularityStatCard(
    ctx,
    innerX + statWidth + statsGap,
    statsY,
    statWidth,
    150,
    result,
    share,
    theme.ink,
    theme.muted,
    theme.statBg,
    theme.quiet
  );

  drawShareCardDistribution(ctx, chart, innerX + 34, cardY + 420, innerWidth - 68, 320, theme);

  ctx.fillStyle = theme.muted;
  ctx.font = "16px ui-monospace, SFMono-Regular, Menlo, monospace";
  fitText(ctx, share.source, innerX, cardY + cardHeight - 58, innerWidth);

  ctx.fillStyle = theme.accent;
  ctx.font = "800 22px ui-monospace, SFMono-Regular, Menlo, monospace";
  fitText(ctx, share.cta, innerX, cardY + cardHeight - 26, innerWidth);

  return await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error("Could not encode share image."));
    }, "image/png");
  });
}

interface ShareCanvasTheme {
  background: string;
  paper: string;
  statBg: string;
  ink: string;
  muted: string;
  line: string;
  quiet: string;
  accent: string;
  accent2: string;
  gridA: string;
  gridB: string;
}

function getShareCanvasTheme(): ShareCanvasTheme {
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  return {
    background: read("--bg", "#f7f8f7"),
    paper: read("--paper", "#ffffff"),
    statBg: read("--viz-stat-bg", "#ffffff"),
    ink: read("--ink", "#171717"),
    muted: read("--muted", "#5f6462"),
    line: read("--line", "#c8ceca"),
    quiet: read("--quiet", "#d9ddda"),
    accent: read("--accent", "#0f766e"),
    accent2: read("--accent-2", "#a43f2f"),
    gridA: read("--grid-a", "rgba(15, 118, 110, 0.055)"),
    gridB: read("--grid-b", "rgba(164, 63, 47, 0.045)")
  };
}

function drawShareCardBackground(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  theme: ShareCanvasTheme
) {
  ctx.save();
  drawRoundedRect(ctx, x, y, width, height, radius);
  ctx.fillStyle = theme.paper;
  ctx.fill();
  ctx.restore();

  ctx.save();
  drawRoundedRect(ctx, x, y, width, height, radius);
  ctx.strokeStyle = theme.line;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawNameWithSymbol(
  ctx: CanvasRenderingContext2D,
  name: string,
  symbol: string,
  x: number,
  y: number,
  maxWidth: number,
  theme: ShareCanvasTheme
) {
  let fontSize = 74;
  const gap = 14;
  while (fontSize > 42) {
    ctx.font = `800 ${fontSize}px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif`;
    const nameWidth = ctx.measureText(name).width;
    ctx.font = `800 ${Math.round(fontSize * 0.92)}px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif`;
    const symbolWidth = ctx.measureText(symbol).width;
    if (nameWidth + gap + symbolWidth <= maxWidth) break;
    fontSize -= 2;
  }

  ctx.fillStyle = theme.ink;
  ctx.font = `800 ${fontSize}px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif`;
  fitText(ctx, name, x, y, maxWidth);
  const nameWidth = Math.min(ctx.measureText(name).width, maxWidth);
  ctx.fillStyle = theme.accent;
  ctx.font = `800 ${Math.round(fontSize * 0.92)}px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif`;
  ctx.fillText(symbol, Math.min(x + nameWidth + gap, x + maxWidth - ctx.measureText(symbol).width), y);
}

function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number, colorA: string, colorB: string) {
  ctx.save();
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x += 32) {
    ctx.strokeStyle = colorB;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += 32) {
    ctx.strokeStyle = colorA;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawShareCardDistribution(
  ctx: CanvasRenderingContext2D,
  chart: ReturnType<typeof makeChartData>,
  x: number,
  y: number,
  width: number,
  height: number,
  theme: ShareCanvasTheme
) {
  const plotLeft = x + 64;
  const plotRight = x + width;
  const plotTop = y + 64;
  const plotBottom = y + height - 50;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;
  const slotWidth = plotWidth / chart.rows.length;

  ctx.save();
  ctx.fillStyle = theme.ink;
  ctx.font = "800 30px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText("Birth-year probability", x, y + 30);

  ctx.fillStyle = theme.muted;
  ctx.font = "600 18px ui-monospace, SFMono-Regular, Menlo, monospace";
  for (const tick of makeShareYAxisTicks(chart.yMax)) {
    const tickY = plotBottom - (tick / chart.yMax) * plotHeight;
    const label = formatShareAxisPercent(tick);
    if (tick > 0) {
      ctx.strokeStyle = theme.quiet;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(plotLeft, tickY);
      ctx.lineTo(plotRight, tickY);
      ctx.stroke();
    }
    ctx.fillText(label, plotLeft - ctx.measureText(label).width - 14, tickY + 6);
  }

  ctx.strokeStyle = theme.line;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(plotLeft, plotTop);
  ctx.lineTo(plotLeft, plotBottom);
  ctx.lineTo(plotRight, plotBottom);
  ctx.stroke();

  for (const year of makeShareYearTicks(chart.minBirthYear, chart.maxBirthYear)) {
    const tickX = shareXForYear(year, chart.minBirthYear, chart.maxBirthYear, plotLeft, plotWidth);
    const label = `${year}`;
    ctx.strokeStyle = theme.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tickX, plotBottom);
    ctx.lineTo(tickX, plotBottom + 12);
    ctx.stroke();

    if (year === chart.minBirthYear) {
      ctx.fillText(label, tickX, plotBottom + 42);
    } else if (year === chart.maxBirthYear) {
      ctx.fillText(label, tickX - ctx.measureText(label).width, plotBottom + 42);
    } else {
      ctx.fillText(label, tickX - ctx.measureText(label).width / 2, plotBottom + 42);
    }
  }

  ctx.fillStyle = theme.accent;
  for (const row of chart.rows) {
    const barHeight = (row.probability / chart.yMax) * plotHeight;
    const barWidth = Math.max(2.2, slotWidth * 0.7);
    ctx.fillRect(plotLeft + row.index * slotWidth + (slotWidth - barWidth) / 2, plotBottom - barHeight, barWidth, barHeight);
  }
  ctx.restore();
}

function drawYearsStatCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  result: QueryResult,
  share: ShareDetails,
  ink: string,
  muted: string,
  paper: string,
  line: string
) {
  ctx.save();
  drawRoundedRect(ctx, x, y, width, height, 18);
  ctx.fillStyle = paper;
  ctx.fill();
  ctx.strokeStyle = line;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = ink;
  ctx.font = "800 21px ui-monospace, SFMono-Regular, Menlo, monospace";
  fitText(ctx, "Birth-year probability", x + 30, y + 36, width - 60);
  ctx.strokeStyle = line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 30, y + 52);
  ctx.lineTo(x + width - 30, y + 52);
  ctx.stroke();

  drawYearStatRow(ctx, x + 30, y + 78, width - 60, "Peak", `${result.peakYear}`, ink, muted);
  drawYearStatRow(ctx, x + 30, y + 106, width - 60, "Median", `${result.medianYear}`, ink, muted);
  drawYearStatRow(ctx, x + 30, y + 134, width - 60, peakInPeriodLabel(share), formatOptionalYear(share.rangePeakYear), ink, muted);
  ctx.restore();
}

function drawPopularityStatCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  result: QueryResult,
  share: ShareDetails,
  ink: string,
  muted: string,
  paper: string,
  line: string
) {
  ctx.save();
  drawRoundedRect(ctx, x, y, width, height, 18);
  ctx.fillStyle = paper;
  ctx.fill();
  ctx.strokeStyle = line;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = ink;
  ctx.font = "800 21px ui-monospace, SFMono-Regular, Menlo, monospace";
  fitText(ctx, "Popularity percentile", x + 30, y + 36, width - 60);
  ctx.strokeStyle = line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 30, y + 52);
  ctx.lineTo(x + width - 30, y + 52);
  ctx.stroke();

  drawPopularityStatRow(ctx, x + 30, y + 78, width - 60, overallRangeLabel(result), formatPercentileValue(result.overallPercentile), ink, muted);
  drawPopularityStatRow(
    ctx,
    x + 30,
    y + 106,
    width - 60,
    `Best year (${result.highestPercentileYear})`,
    formatPercentileValue(result.highestYearPercentile),
    ink,
    muted
  );
  drawPopularityStatRow(
    ctx,
    x + 30,
    y + 134,
    width - 60,
    overPeriodLabel(share),
    formatShareRangePercentileValue(share),
    ink,
    muted
  );
  ctx.restore();
}

function drawPopularityStatRow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string,
  ink: string,
  muted: string
) {
  const valueFont = "800 19px ui-monospace, SFMono-Regular, Menlo, monospace";

  ctx.fillStyle = muted;
  ctx.font = valueFont;
  const valueWidth = ctx.measureText(value).width;
  ctx.font = "650 18px ui-monospace, SFMono-Regular, Menlo, monospace";
  fitText(ctx, label, x, y, Math.max(48, width - valueWidth - 22));
  ctx.fillStyle = ink;
  ctx.font = valueFont;
  ctx.fillText(value, x + width - valueWidth, y);
}

function drawYearStatRow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string,
  ink: string,
  muted: string
) {
  ctx.fillStyle = muted;
  ctx.font = "650 18px ui-monospace, SFMono-Regular, Menlo, monospace";
  fitText(ctx, label, x, y, width - 88);
  ctx.fillStyle = ink;
  ctx.font = "760 18px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
  ctx.fillText(value, x + width - ctx.measureText(value).width, y);
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) {
    ctx.fillText(text, x, y);
    return;
  }

  let truncated = text;
  while (truncated.length > 1 && ctx.measureText(`${truncated}...`).width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  ctx.fillText(`${truncated}...`, x, y);
}

async function getDataState() {
  dataStatePromise ??= initializeDataState();
  return dataStatePromise;
}

async function initializeDataState(): Promise<DataState> {
  const [bundle, meta] = await Promise.all([
    duckdb.selectBundle(MANUAL_BUNDLES),
    fetchDataMeta()
  ]);

  try {
    return await initializeCachedNameIndexState(meta);
  } catch (error) {
    console.info("Name analytics indexed cache is unavailable; using in-memory DuckDB.", describeError(error), error);
    return initializeMemoryDuckState(bundle, meta);
  }
}

async function fetchDataMeta() {
  const response = await fetch(META_FILE);
  if (!response.ok) {
    throw new Error(`Could not fetch ${META_FILE}: ${response.status}`);
  }
  return await response.json() as DataMeta;
}

async function initializeCachedNameIndexState(meta: DataMeta): Promise<NameIndexState> {
  if (!hasIndexedDBSupport()) {
    throw new Error("IndexedDB is unavailable in this browser context.");
  }

  const cached = await readCachedNameIndexRecord(meta);
  if (cached) {
    return {
      kind: "index",
      index: hydrateNameIndex(cached, meta),
      meta,
      storage: "indexeddb"
    };
  }

  const index = await buildNameIndexFromDataset(meta);
  await writeCachedNameIndexRecord(index);
  return {
    kind: "index",
    index,
    meta,
    storage: "indexeddb"
  };
}

async function initializeMemoryDuckState(bundle: duckdb.DuckDBBundle, meta: DataMeta): Promise<DuckState> {
  const db = await createDuckDB(bundle);
  const conn = await db.connect();
  await rebuildNameAgeDatabase(db, conn, meta);
  return prepareDuckState(conn, meta, "duckdb-memory");
}

async function createDuckDB(bundle: duckdb.DuckDBBundle) {
  const worker = new Worker(bundle.mainWorker!);
  const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  return db;
}

async function rebuildNameAgeDatabase(
  db: duckdb.AsyncDuckDB,
  conn: duckdb.AsyncDuckDBConnection,
  meta: DataMeta
) {
  const dataResponse = await fetch(DATA_FILE);
  if (!dataResponse.ok) {
    throw new Error(`Could not fetch ${DATA_FILE}: ${dataResponse.status}`);
  }

  await dropNameAgeTables(conn);

  const dataBytes = new Uint8Array(await dataResponse.arrayBuffer());
  const duckdbFile = isGzip(dataBytes) ? "ssa-national-names.csv.gz" : "ssa-national-names.csv";
  const recentStartYear = meta.maxBirthYear - 9;
  await db.registerFileBuffer(duckdbFile, dataBytes);

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
  await conn.query(`
    CREATE TABLE recent_name_popularity AS
      WITH totals AS (
        SELECT sex, name_lc, SUM("count") AS recent_births
        FROM names
        WHERE birth_year BETWEEN ${recentStartYear} AND ${meta.maxBirthYear}
        GROUP BY sex, name_lc
      ),
      ranked AS (
        SELECT
          sex,
          name_lc,
          recent_births,
          SUM(recent_births) OVER (
            PARTITION BY sex
            ORDER BY recent_births
            RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ) AS births_as_rare_or_rarer,
          SUM(recent_births) OVER (PARTITION BY sex) AS recent_birth_count
        FROM totals
      )
      SELECT
        sex,
        name_lc,
        recent_births,
        births_as_rare_or_rarer / CAST(recent_birth_count AS DOUBLE) AS recent_percentile,
        recent_birth_count
      FROM ranked;
  `);

  await conn.query(`
    CREATE TABLE name_age_cache_meta AS
      SELECT
        ${CACHE_SCHEMA_VERSION}::INTEGER AS schema_version,
        ${sqlString(meta.generatedAt)}::VARCHAR AS generated_at,
        ${meta.minBirthYear}::INTEGER AS min_birth_year,
        ${meta.maxBirthYear}::INTEGER AS max_birth_year,
        ${meta.rowCount}::INTEGER AS row_count,
        ${meta.totalCount}::UBIGINT AS total_count;
  `);

  await db.dropFile(duckdbFile).catch(() => undefined);
}

async function dropNameAgeTables(conn: duckdb.AsyncDuckDBConnection) {
  for (const tableName of [...NAME_AGE_CACHE_TABLES].reverse()) {
    await conn.query(`DROP TABLE IF EXISTS ${tableName};`);
  }
}

async function prepareDuckState(
  conn: duckdb.AsyncDuckDBConnection,
  meta: DataMeta,
  storage: DataStorage
): Promise<DuckState> {
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
      overall_name_popularity.overall_birth_count,
      recent_name_popularity.recent_percentile
    FROM selected
    CROSS JOIN total
    JOIN yearly_name_popularity
      ON yearly_name_popularity.sex = selected.sex
      AND yearly_name_popularity.name_lc = selected.name_lc
      AND yearly_name_popularity.birth_year = selected.birth_year
    JOIN overall_name_popularity
      ON overall_name_popularity.sex = selected.sex
      AND overall_name_popularity.name_lc = selected.name_lc
    LEFT JOIN recent_name_popularity
      ON recent_name_popularity.sex = selected.sex
      AND recent_name_popularity.name_lc = selected.name_lc
    ORDER BY selected.birth_year;
  `);
  const rangeStatement = await conn.prepare(`
    WITH totals AS (
      SELECT sex, name_lc, SUM("count") AS range_births
      FROM names
      WHERE sex = ? AND birth_year BETWEEN ? AND ?
      GROUP BY sex, name_lc
    ),
    ranked AS (
      SELECT
        sex,
        name_lc,
        range_births,
        SUM(range_births) OVER (
          PARTITION BY sex
          ORDER BY range_births
          RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS births_as_rare_or_rarer,
        SUM(range_births) OVER (PARTITION BY sex) AS range_birth_count
      FROM totals
    )
    SELECT
      births_as_rare_or_rarer / CAST(range_birth_count AS DOUBLE) AS range_percentile
    FROM ranked
    WHERE name_lc = ?;
  `);

  return {
    kind: "duckdb",
    conn,
    statement,
    rangeStatement,
    meta,
    storage
  };
}

function hasIndexedDBSupport() {
  return typeof indexedDB !== "undefined";
}

async function readCachedNameIndexRecord(meta: DataMeta) {
  const db = await openNameIndexCache();
  try {
    const transaction = db.transaction(NAME_INDEX_CACHE_STORE, "readonly");
    const record = await idbRequest<CachedNameIndexRecord | undefined>(
      transaction.objectStore(NAME_INDEX_CACHE_STORE).get(NAME_INDEX_CACHE_KEY)
    );
    if (!record || !cachedNameIndexRecordMatches(record, meta)) return null;
    return record;
  } finally {
    db.close();
  }
}

async function writeCachedNameIndexRecord(index: NameIndex) {
  const db = await openNameIndexCache();
  try {
    const transaction = db.transaction(NAME_INDEX_CACHE_STORE, "readwrite");
    transaction.objectStore(NAME_INDEX_CACHE_STORE).put({
      schemaVersion: CACHE_SCHEMA_VERSION,
      generatedAt: index.meta.generatedAt,
      minBirthYear: index.meta.minBirthYear,
      maxBirthYear: index.meta.maxBirthYear,
      rowCount: index.meta.rowCount,
      totalCount: index.meta.totalCount,
      nameLcs: index.nameLcs,
      names: index.names,
      sexCodes: index.sexCodes,
      rowStarts: index.rowStarts,
      yearOffsets: index.yearOffsets,
      counts: index.counts,
      yearPercentiles: index.yearPercentiles,
      totalBirths: index.totalBirths,
      recentBirths: index.recentBirths,
      overallPercentiles: index.overallPercentiles,
      recentPercentiles: index.recentPercentiles,
      overallBirthCountF: index.overallBirthCounts.F,
      overallBirthCountM: index.overallBirthCounts.M,
      yearBirthCountsF: index.yearBirthCounts.F,
      yearBirthCountsM: index.yearBirthCounts.M
    } satisfies CachedNameIndexRecord, NAME_INDEX_CACHE_KEY);
    await idbTransactionDone(transaction);
  } finally {
    db.close();
  }
}

function cachedNameIndexRecordMatches(record: CachedNameIndexRecord, meta: DataMeta) {
  return (
    record.schemaVersion === CACHE_SCHEMA_VERSION &&
    record.generatedAt === meta.generatedAt &&
    record.minBirthYear === meta.minBirthYear &&
    record.maxBirthYear === meta.maxBirthYear &&
    record.rowCount === meta.rowCount &&
    record.totalCount === meta.totalCount &&
    record.nameLcs.length > 0 &&
    record.rowStarts.length === record.nameLcs.length + 1 &&
    record.counts.length === record.rowCount &&
    record.yearOffsets.length === record.rowCount &&
    record.yearPercentiles.length === record.rowCount
  );
}

function openNameIndexCache() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(NAME_INDEX_CACHE_DB, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(NAME_INDEX_CACHE_STORE);
    };
    request.onerror = () => reject(request.error ?? new Error("Could not open name index cache."));
    request.onsuccess = () => resolve(request.result);
  });
}

function idbRequest<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
    request.onsuccess = () => resolve(request.result);
  });
}

function idbTransactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.oncomplete = () => resolve();
  });
}

async function buildNameIndexFromDataset(meta: DataMeta) {
  const response = await fetch(DATA_FILE);
  if (!response.ok) {
    throw new Error(`Could not fetch ${DATA_FILE}: ${response.status}`);
  }
  const dataBytes = new Uint8Array(await response.arrayBuffer());
  const csv = isGzip(dataBytes) ? strFromU8(gunzipSync(dataBytes)) : strFromU8(dataBytes);
  return buildNameIndexFromCsv(csv, meta);
}

function buildNameIndexFromCsv(csv: string, meta: DataMeta): NameIndex {
  const minYear = meta.minBirthYear;
  const yearCount = meta.maxBirthYear - meta.minBirthYear + 1;
  const recentStartYear = meta.maxBirthYear - 9;
  const mutableRecords: MutableNameRecord[] = [];
  const yearBirthCounts = {
    F: new Uint32Array(yearCount),
    M: new Uint32Array(yearCount)
  };

  let lineStart = csv.indexOf("\n") + 1;
  let current: MutableNameRecord | null = null;
  while (lineStart > 0 && lineStart < csv.length) {
    let lineEnd = csv.indexOf("\n", lineStart);
    if (lineEnd === -1) lineEnd = csv.length;
    if (lineEnd > lineStart && csv.charCodeAt(lineEnd - 1) === 13) lineEnd -= 1;
    if (lineEnd > lineStart) {
      const firstComma = csv.indexOf(",", lineStart);
      const secondComma = csv.indexOf(",", firstComma + 1);
      const thirdComma = csv.indexOf(",", secondComma + 1);
      const fourthComma = csv.indexOf(",", thirdComma + 1);
      const nameLc = csv.slice(lineStart, firstComma);
      const name = csv.slice(firstComma + 1, secondComma);
      const sex = csv.slice(secondComma + 1, thirdComma) as Sex;
      const birthYear = Number(csv.slice(thirdComma + 1, fourthComma));
      const count = Number(csv.slice(fourthComma + 1, lineEnd));
      const yearOffset = birthYear - minYear;

      if (!current || current.nameLc !== nameLc || current.sex !== sex) {
        current = { nameLc, name, sex, years: [], counts: [], totalBirths: 0, recentBirths: 0 };
        mutableRecords.push(current);
      }

      current.years.push(yearOffset);
      current.counts.push(count);
      current.totalBirths += count;
      if (birthYear >= recentStartYear) current.recentBirths += count;
      yearBirthCounts[sex][yearOffset] += count;
    }
    lineStart = lineEnd + 1;
  }

  return flattenNameRecords(mutableRecords, yearBirthCounts, meta);
}

function flattenNameRecords(
  records: MutableNameRecord[],
  yearBirthCounts: { F: Uint32Array; M: Uint32Array },
  meta: DataMeta
): NameIndex {
  const rowCount = records.reduce((sum, record) => sum + record.counts.length, 0);
  const nameLcs = records.map((record) => record.nameLc);
  const names = records.map((record) => record.name);
  const sexCodes = new Uint8Array(records.length);
  const rowStarts = new Uint32Array(records.length + 1);
  const yearOffsets = new Uint16Array(rowCount);
  const counts = new Uint32Array(rowCount);
  const yearPercentiles = new Float32Array(rowCount);
  const totalBirths = new Uint32Array(records.length);
  const recentBirths = new Uint32Array(records.length);
  const overallPercentiles = new Float32Array(records.length);
  const recentPercentiles = new Float32Array(records.length);
  recentPercentiles.fill(-1);
  const recordByKey = new Map<string, number>();
  const recordsBySex = { F: [] as number[], M: [] as number[] };
  const overallBirthCounts = { F: 0, M: 0 };
  const yearCount = meta.maxBirthYear - meta.minBirthYear + 1;

  let rowIndex = 0;
  for (let recordIndex = 0; recordIndex < records.length; recordIndex += 1) {
    const record = records[recordIndex];
    sexCodes[recordIndex] = sexCode(record.sex);
    rowStarts[recordIndex] = rowIndex;
    totalBirths[recordIndex] = record.totalBirths;
    recentBirths[recordIndex] = record.recentBirths;
    overallBirthCounts[record.sex] += record.totalBirths;
    recordsBySex[record.sex].push(recordIndex);
    recordByKey.set(nameIndexKey(record.nameLc, record.sex), recordIndex);
    for (let index = 0; index < record.counts.length; index += 1) {
      yearOffsets[rowIndex] = record.years[index];
      counts[rowIndex] = record.counts[index];
      rowIndex += 1;
    }
  }
  rowStarts[records.length] = rowIndex;

  assignOverallPercentiles(recordsBySex.F, totalBirths, overallBirthCounts.F, overallPercentiles);
  assignOverallPercentiles(recordsBySex.M, totalBirths, overallBirthCounts.M, overallPercentiles);
  assignRecentPercentiles(recordsBySex.F, recentBirths, recentPercentiles);
  assignRecentPercentiles(recordsBySex.M, recentBirths, recentPercentiles);
  assignYearPercentiles(recordsBySex, rowStarts, yearOffsets, counts, yearBirthCounts, yearPercentiles, yearCount);

  return {
    meta,
    minBirthYear: meta.minBirthYear,
    maxBirthYear: meta.maxBirthYear,
    yearCount,
    nameLcs,
    names,
    sexCodes,
    rowStarts,
    yearOffsets,
    counts,
    yearPercentiles,
    totalBirths,
    recentBirths,
    overallPercentiles,
    recentPercentiles,
    overallBirthCounts,
    yearBirthCounts,
    recordByKey,
    recordsBySex
  };
}

function hydrateNameIndex(record: CachedNameIndexRecord, meta: DataMeta): NameIndex {
  const recordByKey = new Map<string, number>();
  const recordsBySex = { F: [] as number[], M: [] as number[] };
  for (let index = 0; index < record.nameLcs.length; index += 1) {
    const sex = sexFromCode(record.sexCodes[index]);
    recordByKey.set(nameIndexKey(record.nameLcs[index], sex), index);
    recordsBySex[sex].push(index);
  }

  return {
    meta,
    minBirthYear: meta.minBirthYear,
    maxBirthYear: meta.maxBirthYear,
    yearCount: meta.maxBirthYear - meta.minBirthYear + 1,
    nameLcs: record.nameLcs,
    names: record.names,
    sexCodes: record.sexCodes,
    rowStarts: record.rowStarts,
    yearOffsets: record.yearOffsets,
    counts: record.counts,
    yearPercentiles: record.yearPercentiles,
    totalBirths: record.totalBirths,
    recentBirths: record.recentBirths,
    overallPercentiles: record.overallPercentiles,
    recentPercentiles: record.recentPercentiles,
    overallBirthCounts: { F: record.overallBirthCountF, M: record.overallBirthCountM },
    yearBirthCounts: { F: record.yearBirthCountsF, M: record.yearBirthCountsM },
    recordByKey,
    recordsBySex
  };
}

function assignOverallPercentiles(recordIndices: number[], births: Uint32Array, totalBirthCount: number, output: Float32Array) {
  recordIndices.sort((left, right) => births[left] - births[right]);
  let cumulative = 0;
  let index = 0;
  while (index < recordIndices.length) {
    const start = index;
    const birthCount = births[recordIndices[index]];
    let groupBirths = 0;
    while (index < recordIndices.length && births[recordIndices[index]] === birthCount) {
      groupBirths += births[recordIndices[index]];
      index += 1;
    }
    cumulative += groupBirths;
    const percentile = totalBirthCount === 0 ? 0 : cumulative / totalBirthCount;
    for (let groupIndex = start; groupIndex < index; groupIndex += 1) {
      output[recordIndices[groupIndex]] = percentile;
    }
  }
}

function assignRecentPercentiles(recordIndices: number[], births: Uint32Array, output: Float32Array) {
  const recentIndices = recordIndices.filter((recordIndex) => births[recordIndex] > 0);
  const totalBirthCount = recentIndices.reduce((sum, recordIndex) => sum + births[recordIndex], 0);
  assignOverallPercentiles(recentIndices, births, totalBirthCount, output);
}

function assignYearPercentiles(
  recordsBySex: { F: number[]; M: number[] },
  rowStarts: Uint32Array,
  yearOffsets: Uint16Array,
  counts: Uint32Array,
  yearBirthCounts: { F: Uint32Array; M: Uint32Array },
  output: Float32Array,
  yearCount: number
) {
  const buckets = Array.from({ length: yearCount * 2 }, () => [] as number[]);
  for (const sex of ["F", "M"] as const) {
    const sexOffset = sex === "F" ? 0 : yearCount;
    for (const recordIndex of recordsBySex[sex]) {
      for (let rowIndex = rowStarts[recordIndex]; rowIndex < rowStarts[recordIndex + 1]; rowIndex += 1) {
        buckets[sexOffset + yearOffsets[rowIndex]].push(rowIndex);
      }
    }
  }

  for (const sex of ["F", "M"] as const) {
    const sexOffset = sex === "F" ? 0 : yearCount;
    for (let yearOffset = 0; yearOffset < yearCount; yearOffset += 1) {
      const bucket = buckets[sexOffset + yearOffset];
      const totalBirthCount = yearBirthCounts[sex][yearOffset];
      bucket.sort((left, right) => counts[left] - counts[right]);
      let cumulative = 0;
      let index = 0;
      while (index < bucket.length) {
        const start = index;
        const birthCount = counts[bucket[index]];
        let groupBirths = 0;
        while (index < bucket.length && counts[bucket[index]] === birthCount) {
          groupBirths += counts[bucket[index]];
          index += 1;
        }
        cumulative += groupBirths;
        const percentile = totalBirthCount === 0 ? 0 : cumulative / totalBirthCount;
        for (let groupIndex = start; groupIndex < index; groupIndex += 1) {
          output[bucket[groupIndex]] = percentile;
        }
      }
    }
  }
}

function nameIndexKey(normalizedName: string, sex: Sex) {
  return `${sex}:${normalizedName}`;
}

function sexCode(sex: Sex) {
  return sex === "F" ? 0 : 1;
}

function sexFromCode(code: number): Sex {
  return code === 0 ? "F" : "M";
}

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function describeError(error: unknown) {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

async function queryDistribution(state: DataState, normalizedName: string, sex: Sex): Promise<QueryDatum[]> {
  if (state.kind === "index") {
    return queryIndexedDistribution(state.index, normalizedName, sex);
  }

  const table = await state.statement.query(normalizedName, sex);
  return (table.toArray() as Array<Record<string, unknown>>).map((row) => ({
    birthYear: numberFromCell(row.birth_year),
    births: numberFromCell(row.births),
    probability: numberFromCell(row.probability),
    yearBirthCount: numberFromCell(row.year_birth_count),
    yearPercentile: numberFromCell(row.year_percentile),
    overallBirthCount: numberFromCell(row.overall_birth_count),
    overallPercentile: numberFromCell(row.overall_percentile),
    recentPercentile: nullableNumberFromCell(row.recent_percentile)
  }));
}

async function queryRangePercentile(
  state: DataState,
  normalizedName: string,
  sex: Sex,
  startYear: number,
  endYear: number
) {
  if (state.kind === "index") {
    return queryIndexedRangePercentile(state.index, normalizedName, sex, startYear, endYear);
  }

  const table = await state.rangeStatement.query(sex, startYear, endYear, normalizedName);
  const rows = table.toArray() as Array<Record<string, unknown>>;
  if (rows.length === 0) return null;
  return nullableNumberFromCell(rows[0].range_percentile);
}

function queryIndexedDistribution(index: NameIndex, normalizedName: string, sex: Sex): QueryDatum[] {
  const recordIndex = index.recordByKey.get(nameIndexKey(normalizedName, sex));
  if (recordIndex === undefined) return [];

  const rows: QueryDatum[] = [];
  const totalBirths = index.totalBirths[recordIndex];
  const overallPercentile = index.overallPercentiles[recordIndex];
  const recentPercentile = index.recentPercentiles[recordIndex] < 0 ? null : index.recentPercentiles[recordIndex];
  const overallBirthCount = index.overallBirthCounts[sex];
  const yearBirthCounts = index.yearBirthCounts[sex];

  for (let rowIndex = index.rowStarts[recordIndex]; rowIndex < index.rowStarts[recordIndex + 1]; rowIndex += 1) {
    const yearOffset = index.yearOffsets[rowIndex];
    const births = index.counts[rowIndex];
    rows.push({
      birthYear: index.minBirthYear + yearOffset,
      births,
      probability: totalBirths === 0 ? 0 : births / totalBirths,
      overallBirthCount,
      overallPercentile,
      recentPercentile,
      yearBirthCount: yearBirthCounts[yearOffset],
      yearPercentile: index.yearPercentiles[rowIndex]
    });
  }

  return rows;
}

function queryIndexedRangePercentile(
  index: NameIndex,
  normalizedName: string,
  sex: Sex,
  startYear: number,
  endYear: number
) {
  const selectedRecordIndex = index.recordByKey.get(nameIndexKey(normalizedName, sex));
  if (selectedRecordIndex === undefined) return null;

  const startOffset = startYear - index.minBirthYear;
  const endOffset = endYear - index.minBirthYear;
  const selectedBirths = sumIndexedRangeBirths(index, selectedRecordIndex, startOffset, endOffset);
  if (selectedBirths === 0) return null;

  let rangeBirthCount = 0;
  let birthsAsRareOrRarer = 0;
  for (const recordIndex of index.recordsBySex[sex]) {
    const rangeBirths = sumIndexedRangeBirths(index, recordIndex, startOffset, endOffset);
    if (rangeBirths === 0) continue;
    rangeBirthCount += rangeBirths;
    if (rangeBirths <= selectedBirths) {
      birthsAsRareOrRarer += rangeBirths;
    }
  }

  return rangeBirthCount === 0 ? null : birthsAsRareOrRarer / rangeBirthCount;
}

function sumIndexedRangeBirths(index: NameIndex, recordIndex: number, startOffset: number, endOffset: number) {
  let sum = 0;
  for (let rowIndex = index.rowStarts[recordIndex]; rowIndex < index.rowStarts[recordIndex + 1]; rowIndex += 1) {
    const yearOffset = index.yearOffsets[rowIndex];
    if (yearOffset < startOffset) continue;
    if (yearOffset > endOffset) break;
    sum += index.counts[rowIndex];
  }
  return sum;
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
      recentPercentile: result.recentPercentile,
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

function findRangePeakYear(rows: QueryDatum[], range: ShareRange) {
  const rangeRows = rows.filter((row) => row.birthYear >= range.startYear && row.birthYear <= range.endYear);
  if (rangeRows.length === 0) return null;
  return rangeRows.reduce((best, row) => (row.probability > best.probability ? row : best), rangeRows[0]).birthYear;
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

function makeShareYearTicks(minYear: number, maxYear: number) {
  const ticks = [minYear];
  for (let year = Math.ceil(minYear / 20) * 20; year < maxYear; year += 20) {
    if (year !== minYear && maxYear - year >= 12) {
      ticks.push(year);
    }
  }
  ticks.push(maxYear);
  return ticks;
}

function makeShareYAxisTicks(yMax: number) {
  return [0, yMax / 3, (yMax * 2) / 3, yMax];
}

function shareXForYear(year: number, minYear: number, maxYear: number, left = SHARE_PLOT.left, width = SHARE_PLOT.width) {
  const span = maxYear - minYear;
  if (span <= 0) return left;
  return left + ((year - minYear) / span) * width;
}

function shareYForProbability(probability: number, yMax: number) {
  if (yMax <= 0) return SHARE_PLOT.bottom;
  return SHARE_PLOT.bottom - (probability / yMax) * SHARE_PLOT.height;
}

function niceProbabilityMax(value: number) {
  const padded = Math.max(value * 1.08, 0.005);
  const steps = [
    0.005,
    0.0075,
    0.01,
    0.0125,
    0.015,
    0.02,
    0.025,
    0.03,
    0.035,
    0.04,
    0.05,
    0.075,
    0.1,
    0.15,
    0.2,
    0.25,
    0.3,
    0.4,
    0.5,
    0.75,
    1
  ];
  return steps.find((step) => padded <= step) ?? 1;
}

function normalizeName(value: string) {
  return value.trim().replace(/[\s-]+/g, "").toLocaleLowerCase("en-US");
}

function sexLabel(value: Sex) {
  return value === "F" ? "Female" : "Male";
}

function sexIcon(value: Sex) {
  return value === "F" ? "♀" : "♂";
}

function overallRangeLabel(result: QueryResult) {
  return `Overall (${result.meta.minBirthYear}-${result.meta.maxBirthYear})`;
}

function overPeriodLabel(share: ShareDetails) {
  return `Over period: ${share.rangeLabel}`;
}

function peakInPeriodLabel(share: ShareDetails) {
  return `Peak in period: ${share.rangeLabel}`;
}

function clampYear(value: number, minYear: number, maxYear: number) {
  if (!Number.isFinite(value)) return minYear;
  return Math.min(Math.max(Math.round(value), minYear), maxYear);
}

function clampShareRange(startYear: number, endYear: number, minYear: number, maxYear: number) {
  const clampedStart = clampYear(startYear, minYear, maxYear);
  const clampedEnd = clampYear(endYear, minYear, maxYear);
  return {
    startYear: Math.min(clampedStart, clampedEnd),
    endYear: Math.max(clampedStart, clampedEnd)
  };
}

function shareRangeTrackStyle(result: QueryResult, range: ShareRange): CSSProperties {
  const span = result.meta.maxBirthYear - result.meta.minBirthYear;
  const start = span <= 0 ? 0 : ((range.startYear - result.meta.minBirthYear) / span) * 100;
  const end = span <= 0 ? 100 : ((range.endYear - result.meta.minBirthYear) / span) * 100;
  return {
    "--range-start": `${start}%`,
    "--range-end": `${end}%`
  } as CSSProperties;
}

function numberFromCell(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  return Number(String(value));
}

function nullableNumberFromCell(value: unknown) {
  if (value === null || value === undefined) return null;
  const number = numberFromCell(value);
  return Number.isFinite(number) ? number : null;
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

function formatShareAxisPercent(value: number) {
  if (value === 0) return "0%";
  return formatPercent(value, value < 0.1 ? 1 : 0);
}

function formatPercentileLabel(value: number) {
  return `${formatPercentileValue(value)} percentile`;
}

function formatOptionalPercentileLabel(value: number | null) {
  return value === null ? "No range percentile" : formatPercentileLabel(value);
}

function formatOptionalPercentileValue(value: number | null) {
  return value === null ? "n/a" : formatPercentileValue(value);
}

function formatOptionalYear(value: number | null) {
  return value === null ? "n/a" : `${value}`;
}

function formatShareRangePercentileValue(share: ShareDetails) {
  if (share.rangeStatus === "loading") return "...";
  return formatOptionalPercentileValue(share.rangePercentile);
}

function renderShareRangePercentileValue(share: ShareDetails) {
  if (share.rangeStatus === "loading") return "...";
  return renderShareOptionalPercentileValue(share.rangePercentile);
}

function renderShareOptionalPercentileValue(value: number | null) {
  if (value === null) return "n/a";
  return renderSharePercentileValue(value);
}

function renderSharePercentileValue(value: number) {
  const formatted = formatPercentileValue(value);
  const suffix = formatted.match(/^(.*?)(th)$/);
  if (!suffix) return formatted;
  return (
    <>
      {suffix[1]}
      <sup className="name-age-percentile-suffix">{suffix[2]}</sup>
    </>
  );
}

function formatPercentileValue(value: number) {
  if (!Number.isFinite(value)) return "n/a";
  const percentile = Math.min(Math.max(value * 100, 0), 99.99);
  if (percentile >= 99.99) {
    return "99.99th";
  }
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(percentile);
  return `${formatted}th`;
}

function tooltipStyle(row: ChartDatum): CSSProperties {
  return {
    left: `${((row.x + row.width / 2) / WIDTH) * 100}%`,
    top: `${((row.y + Math.min(row.height, 12)) / HEIGHT) * 100}%`
  };
}
