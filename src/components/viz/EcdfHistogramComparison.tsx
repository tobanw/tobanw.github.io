import { useId, useMemo, useState, type JSX } from "react";

const N = 420;
const WIDTH = 1040;
const HEIGHT = 360;
const PANEL_TOP = 58;
const PANEL_WIDTH = 430;
const PANEL_HEIGHT = 230;
const HIST_PANEL = { left: 58, top: PANEL_TOP, width: PANEL_WIDTH, height: PANEL_HEIGHT };
const ECDF_PANEL = { left: 568, top: PANEL_TOP, width: PANEL_WIDTH, height: PANEL_HEIGHT };
const ZOOM_DOMAIN: [number, number] = [-3, 3];

interface HistogramBin {
  start: number;
  end: number;
  count: number;
}

interface PlotPanel {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Summary {
  median: number;
  p90: number;
  shown: number;
  hiddenBelow: number;
  hiddenAbove: number;
  ecdfStart: number;
  ecdfEnd: number;
}

export default function EcdfHistogramComparison(): JSX.Element {
  const figureId = useId();
  const binSliderId = useId();
  const [sampleIndex, setSampleIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const [binWidth, setBinWidth] = useState(0.5);

  const sample = useMemo(() => makeSample(20260606 + sampleIndex * 9973), [sampleIndex]);
  const sorted = useMemo(() => [...sample].sort((a, b) => a - b), [sample]);
  const domain = zoomed ? ZOOM_DOMAIN : makeFullDomain(sample);
  const updateBinWidth = (value: number) => setBinWidth(clampBinWidth(value));
  const stepBinWidth = (delta: number) => setBinWidth((value) => clampBinWidth(value + delta));

  const histogram = useMemo(() => makeHistogram(sample, domain, binWidth), [binWidth, domain, sample]);
  const summary = useMemo(() => makeSummary(sample, sorted, domain), [domain, sample, sorted]);
  const maxBinShare = Math.max(...histogram.map((bin) => bin.count / sample.length), 0.01);
  const histogramYMax = niceCeil(maxBinShare);

  return (
    <figure className="viz ecdf-viz" aria-labelledby={figureId}>
      <div className="viz-header">
        <div>
          <figcaption id={figureId}>Histogram vs eCDF on the same sample</figcaption>
          <p>
            The sample has a visible right-tailed outlier component. Zooming hides those x-values, but the eCDF still
            shows the missing tail mass as vertical distance from 100%.
          </p>
        </div>
        <code>{zoomed ? "x-axis zoomed" : "full sample range"}</code>
      </div>

      <div className="ecdf-controls" aria-label="Visualization controls">
        <button type="button" onClick={() => setSampleIndex((index) => index + 1)}>
          draw random sample
        </button>
        <button
          className={zoomed ? "is-selected" : ""}
          type="button"
          aria-pressed={zoomed}
          onClick={() => setZoomed((value) => !value)}
        >
          {zoomed ? "show full range" : "zoom x-axis"}
        </button>
        <div className="ecdf-slider-control">
          <div>
            <label htmlFor={binSliderId}>bin width</label>
            <output htmlFor={binSliderId}>{binWidth.toFixed(1)}</output>
          </div>
          <input
            id={binSliderId}
            aria-label="Histogram bin width"
            max={2}
            min={0.2}
            step={0.1}
            type="range"
            value={binWidth}
            onChange={(event) => updateBinWidth(event.currentTarget.valueAsNumber)}
            onInput={(event) => updateBinWidth(event.currentTarget.valueAsNumber)}
          />
          <div className="ecdf-stepper" aria-label="Bin width step controls">
            <button type="button" aria-label="Decrease bin width" title="Decrease bin width" onClick={() => stepBinWidth(-0.1)}>
              -
            </button>
            <button type="button" aria-label="Increase bin width" title="Increase bin width" onClick={() => stepBinWidth(0.1)}>
              +
            </button>
          </div>
        </div>
      </div>

      <dl className="ecdf-stats" aria-label="Sample summary">
        <Stat label="sample size" value={formatCount(sample.length)} note={`${formatCount(summary.shown)} visible`} />
        <Stat label="hidden tails" value={formatPercent((summary.hiddenBelow + summary.hiddenAbove) / sample.length, 1)} note={`${summary.hiddenBelow} below / ${summary.hiddenAbove} above`} />
        <Stat label="median" value={formatNumber(summary.median)} note="read at eCDF = 50%" />
        <Stat label="90th pct." value={formatNumber(summary.p90)} note="read at eCDF = 90%" />
      </dl>

      <svg
        className="viz-plot ecdf-plot"
        role="img"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        aria-label="Two-panel plot comparing a histogram and empirical cumulative distribution function for the same sample."
      >
        <PanelTitle x={HIST_PANEL.left} y={26} title="Histogram" subtitle="local mass depends on bin width" />
        <PanelTitle x={ECDF_PANEL.left} y={26} title="eCDF" subtitle="cumulative share keeps the tail mass visible" />

        <HistogramPanel bins={histogram} domain={domain} yMax={histogramYMax} />
        <EcdfPanel domain={domain} sorted={sorted} summary={summary} />
      </svg>
    </figure>
  );
}

function HistogramPanel({ bins, domain, yMax }: { bins: HistogramBin[]; domain: [number, number]; yMax: number }) {
  return (
    <g>
      <Axes panel={HIST_PANEL} domain={domain} yTicks={[0, yMax / 2, yMax]} yMax={yMax} yFormat={formatPercentTick} />
      {bins.map((bin) => {
        const x = xForValue(bin.start, domain, HIST_PANEL);
        const width = Math.max(1, xForValue(bin.end, domain, HIST_PANEL) - x);
        const share = bin.count / N;
        const y = yForShare(share, yMax, HIST_PANEL);
        return (
          <rect
            className="ecdf-hist-bar"
            key={`${bin.start}-${bin.end}`}
            x={x + 1}
            y={y}
            width={Math.max(0, width - 2)}
            height={HIST_PANEL.top + HIST_PANEL.height - y}
          />
        );
      })}
      <text className="viz-label" x={HIST_PANEL.left + HIST_PANEL.width} y={HIST_PANEL.top + HIST_PANEL.height + 42} textAnchor="end">
        value
      </text>
    </g>
  );
}

function EcdfPanel({ domain, sorted, summary }: { domain: [number, number]; sorted: number[]; summary: Summary }) {
  const path = makeEcdfPath(sorted, domain, ECDF_PANEL);
  const medianVisible = isWithin(summary.median, domain);
  const p90Visible = isWithin(summary.p90, domain);

  return (
    <g>
      <rect
        className="ecdf-tail-gap"
        x={ECDF_PANEL.left}
        y={ECDF_PANEL.top}
        width={ECDF_PANEL.width}
        height={Math.max(0, yForCdf(summary.ecdfEnd, ECDF_PANEL) - ECDF_PANEL.top)}
      />
      <Axes panel={ECDF_PANEL} domain={domain} yTicks={[0, 0.25, 0.5, 0.75, 1]} yMax={1} yFormat={formatPercentTick} />
      <path className="ecdf-step-line" d={path} />
      {medianVisible && <QuantileMarker panel={ECDF_PANEL} value={summary.median} share={0.5} domain={domain} label="median" />}
      {p90Visible && <QuantileMarker panel={ECDF_PANEL} value={summary.p90} share={0.9} domain={domain} label="90th" />}
      <text className="viz-label" x={ECDF_PANEL.left + ECDF_PANEL.width} y={ECDF_PANEL.top + ECDF_PANEL.height + 42} textAnchor="end">
        value
      </text>
      <text
        className="ecdf-tail-label"
        x={ECDF_PANEL.left + ECDF_PANEL.width - 4}
        y={Math.max(ECDF_PANEL.top + 15, yForCdf(summary.ecdfEnd, ECDF_PANEL) - 7)}
        textAnchor="end"
      >
        {formatPercent(1 - summary.ecdfEnd, 1)} above range
      </text>
    </g>
  );
}

function Axes({
  domain,
  panel,
  yFormat,
  yMax,
  yTicks
}: {
  domain: [number, number];
  panel: PlotPanel;
  yFormat: (value: number) => string;
  yMax: number;
  yTicks: number[];
}) {
  const xTicks = makeXTicks(domain);

  return (
    <g>
      <line className="viz-axis" x1={panel.left} y1={panel.top} x2={panel.left} y2={panel.top + panel.height} />
      <line className="viz-axis" x1={panel.left} y1={panel.top + panel.height} x2={panel.left + panel.width} y2={panel.top + panel.height} />
      {yTicks.map((tick) => {
        const y = panel.top + panel.height - (tick / yMax) * panel.height;
        return (
          <g key={`${panel.left}-y-${tick}`}>
            <line className="viz-grid" x1={panel.left} y1={y} x2={panel.left + panel.width} y2={y} />
            <text className="viz-label" x={panel.left - 10} y={y + 4} textAnchor="end">
              {yFormat(tick)}
            </text>
          </g>
        );
      })}
      {xTicks.map((tick) => {
        const x = xForValue(tick, domain, panel);
        return (
          <g key={`${panel.left}-x-${tick}`}>
            <line className="viz-grid" x1={x} y1={panel.top} x2={x} y2={panel.top + panel.height} />
            <text className="viz-label" x={x} y={panel.top + panel.height + 24} textAnchor="middle">
              {formatNumber(tick)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function QuantileMarker({
  domain,
  label,
  panel,
  share,
  value
}: {
  domain: [number, number];
  label: string;
  panel: PlotPanel;
  share: number;
  value: number;
}) {
  const x = xForValue(value, domain, panel);
  const y = yForCdf(share, panel);

  return (
    <g>
      <line className="ecdf-quantile-line" x1={panel.left} y1={y} x2={x} y2={y} />
      <line className="ecdf-quantile-line" x1={x} y1={y} x2={x} y2={panel.top + panel.height} />
      <circle className="ecdf-quantile-point" cx={x} cy={y} r={4} />
      <text className="viz-label" x={x + 6} y={y - 7}>
        {label}
      </text>
    </g>
  );
}

function PanelTitle({ subtitle, title, x, y }: { subtitle: string; title: string; x: number; y: number }) {
  return (
    <g>
      <text className="ecdf-panel-title" x={x} y={y}>
        {title}
      </text>
      <text className="viz-label" x={x + 94} y={y}>
        {subtitle}
      </text>
    </g>
  );
}

function Stat({ label, note, value }: { label: string; note: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
      <span>{note}</span>
    </div>
  );
}

function makeSample(seed: number): number[] {
  const rng = mulberry32(seed);
  return Array.from({ length: N }, () => {
    const draw = rng();
    if (draw < 0.84) {
      return normal(rng);
    }
    if (draw < 0.915) {
      return 1.8 + normal(rng) * 0.45;
    }
    const sign = rng() < 0.18 ? -1 : 1;
    return sign * (7 + exponential(rng) * 3.2);
  });
}

function makeHistogram(sample: number[], domain: [number, number], binWidth: number): HistogramBin[] {
  const [min, max] = domain;
  const binCount = Math.max(1, Math.ceil((max - min) / binWidth));
  const bins = Array.from({ length: binCount }, (_, index) => ({
    start: min + index * binWidth,
    end: index === binCount - 1 ? max : min + (index + 1) * binWidth,
    count: 0
  }));

  for (const value of sample) {
    if (value < min || value > max) continue;
    const index = Math.min(Math.floor((value - min) / binWidth), binCount - 1);
    bins[index].count += 1;
  }

  return bins;
}

function makeSummary(sample: number[], sorted: number[], domain: [number, number]): Summary {
  const [min, max] = domain;
  const hiddenBelow = sample.filter((value) => value < min).length;
  const hiddenAbove = sample.filter((value) => value > max).length;

  return {
    median: quantile(sorted, 0.5),
    p90: quantile(sorted, 0.9),
    shown: sample.length - hiddenBelow - hiddenAbove,
    hiddenBelow,
    hiddenAbove,
    ecdfStart: countLessOrEqual(sorted, min) / sorted.length,
    ecdfEnd: countLessOrEqual(sorted, max) / sorted.length
  };
}

function makeFullDomain(sample: number[]): [number, number] {
  const min = Math.min(...sample);
  const max = Math.max(...sample);
  const paddedMin = Math.floor(min - 0.5);
  const paddedMax = Math.ceil(max + 0.5);
  return [paddedMin, paddedMax];
}

function makeEcdfPath(sorted: number[], domain: [number, number], panel: PlotPanel): string {
  const [min, max] = domain;
  let currentShare = countLessOrEqual(sorted, min) / sorted.length;
  const commands = [`M ${panel.left.toFixed(2)} ${yForCdf(currentShare, panel).toFixed(2)}`];

  sorted.forEach((value, index) => {
    if (value < min || value > max) return;
    const x = xForValue(value, domain, panel);
    const nextShare = (index + 1) / sorted.length;
    commands.push(`L ${x.toFixed(2)} ${yForCdf(currentShare, panel).toFixed(2)}`);
    commands.push(`L ${x.toFixed(2)} ${yForCdf(nextShare, panel).toFixed(2)}`);
    currentShare = nextShare;
  });

  commands.push(`L ${(panel.left + panel.width).toFixed(2)} ${yForCdf(currentShare, panel).toFixed(2)}`);
  return commands.join(" ");
}

function makeXTicks(domain: [number, number]): number[] {
  const [min, max] = domain;
  const span = max - min;
  const step = span <= 8 ? 1 : span <= 20 ? 5 : 10;
  const first = Math.ceil(min / step) * step;
  const ticks: number[] = [];

  for (let value = first; value <= max + 1e-9; value += step) {
    ticks.push(value);
  }

  return ticks;
}

function quantile(sorted: number[], q: number): number {
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function countLessOrEqual(sorted: number[], value: number): number {
  let low = 0;
  let high = sorted.length;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (sorted[mid] <= value) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
}

function xForValue(value: number, domain: [number, number], panel: PlotPanel): number {
  const [min, max] = domain;
  return panel.left + ((value - min) / (max - min)) * panel.width;
}

function yForShare(share: number, yMax: number, panel: PlotPanel): number {
  return panel.top + panel.height - (share / yMax) * panel.height;
}

function yForCdf(share: number, panel: PlotPanel): number {
  return panel.top + panel.height - share * panel.height;
}

function normal(rng: () => number): number {
  const u1 = Math.max(rng(), 1e-12);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function exponential(rng: () => number): number {
  return -Math.log(Math.max(1 - rng(), 1e-12));
}

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function niceCeil(value: number): number {
  if (value <= 0.05) return 0.05;
  if (value <= 0.1) return 0.1;
  if (value <= 0.2) return 0.2;
  return Math.ceil(value * 5) / 5;
}

function isWithin(value: number, domain: [number, number]): boolean {
  return value >= domain[0] && value <= domain[1];
}

function clampBinWidth(value: number): number {
  return Math.min(Math.max(Math.round(value * 10) / 10, 0.2), 2);
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatNumber(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}

function formatPercent(value: number, digits: number): string {
  return `${(value * 100).toFixed(digits)}%`;
}

function formatPercentTick(value: number): string {
  return `${Math.round(value * 100)}%`;
}
