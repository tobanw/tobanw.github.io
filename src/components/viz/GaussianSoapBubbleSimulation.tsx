import { useId, useMemo, useState, type JSX } from "react";

const SAMPLE_COUNT = 8_000;
const BIN_COUNT = 44;
const MIN_DIMENSIONS = 1;
const MAX_DIMENSIONS = 200;
const WIDTH = 720;
const HEIGHT = 390;
const PAD = { top: 42, right: 28, bottom: 54, left: 56 };
const PLOT_WIDTH = WIDTH - PAD.left - PAD.right;
const PLOT_HEIGHT = HEIGHT - PAD.top - PAD.bottom;

interface HistogramBin {
  x0: number;
  x1: number;
  count: number;
}

interface Simulation {
  bins: HistogramBin[];
  center: number;
  mean: number;
  q05: number;
  q95: number;
  xMax: number;
  xMin: number;
  yMax: number;
}

export default function GaussianSoapBubbleSimulation(): JSX.Element {
  const figureId = useId();
  const sliderId = useId();
  const [dimensions, setDimensions] = useState(50);
  const simulation = useMemo(() => makeSimulation(dimensions), [dimensions]);
  const shellWidth = simulation.q95 - simulation.q05;
  const relativeWidth = shellWidth / simulation.center;
  const centerX = xForDistance(simulation.center, simulation);
  const cltPath = makeCltPath(dimensions, simulation);

  return (
    <figure className="viz gaussian-viz" aria-labelledby={figureId}>
      <div className="viz-header">
        <div>
          <figcaption id={figureId}>Distance from the origin for a Gaussian point</figcaption>
          <p>
            Each sample is a draw from N(0, I_d). As d grows, the radius moves outward to sqrt(d)
            while R / sqrt(d) concentrates near 1.
          </p>
        </div>
        <code>{dimensions} dimensions</code>
      </div>

      <div className="gaussian-control">
        <div className="gaussian-control-head">
          <label htmlFor={sliderId}>dimensions</label>
          <output htmlFor={sliderId}>{dimensions}</output>
        </div>
        <input
          id={sliderId}
          aria-label="Number of dimensions"
          className="gaussian-slider"
          max={MAX_DIMENSIONS}
          min={MIN_DIMENSIONS}
          step={1}
          type="range"
          value={dimensions}
          onChange={(event) => setDimensions(event.currentTarget.valueAsNumber)}
        />
        <div className="gaussian-presets" aria-label="Dimension presets">
          {[2, 10, 50, 200].map((dimension) => (
            <button
              className={dimensions === dimension ? "is-selected" : ""}
              key={dimension}
              type="button"
              aria-pressed={dimensions === dimension}
              onClick={() => setDimensions(dimension)}
            >
              {dimension}d
            </button>
          ))}
        </div>
      </div>

      <svg
        className="viz-plot gaussian-plot"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Histogram of simulated distances from the origin for ${dimensions} dimensional standard Gaussian samples.`}
      >
        <line className="viz-axis" x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + PLOT_HEIGHT} />
        <line
          className="viz-axis"
          x1={PAD.left}
          y1={PAD.top + PLOT_HEIGHT}
          x2={PAD.left + PLOT_WIDTH}
          y2={PAD.top + PLOT_HEIGHT}
        />

        {[0.25, 0.5, 0.75, 1].map((tick) => {
          const y = PAD.top + PLOT_HEIGHT - tick * PLOT_HEIGHT;
          return <line className="viz-grid" key={tick} x1={PAD.left} y1={y} x2={PAD.left + PLOT_WIDTH} y2={y} />;
        })}

        {makeTicks(simulation.xMin, simulation.xMax).map((tick) => {
          const x = xForDistance(tick, simulation);
          return (
            <g key={tick}>
              <line className="viz-grid" x1={x} y1={PAD.top} x2={x} y2={PAD.top + PLOT_HEIGHT} />
              <text className="viz-label" x={x} y={PAD.top + PLOT_HEIGHT + 28} textAnchor="middle">
                {formatAxis(tick)}
              </text>
            </g>
          );
        })}

        {simulation.bins.map((bin) => {
          const x = xForDistance(bin.x0, simulation);
          const y = yForCount(bin.count, simulation.yMax);
          const width = Math.max(1, xForDistance(bin.x1, simulation) - x - 1);
          const height = PAD.top + PLOT_HEIGHT - y;
          return (
            <rect
              className="gaussian-bar"
              height={height}
              key={bin.x0}
              width={width}
              x={x}
              y={y}
            />
          );
        })}

        <path className="gaussian-clt-line" d={cltPath} />
        <line
          className="gaussian-center-line"
          x1={centerX}
          y1={PAD.top}
          x2={centerX}
          y2={PAD.top + PLOT_HEIGHT}
        />
        <text className="viz-label gaussian-center-label" x={centerX} y={PAD.top + 16} textAnchor="middle">
          sqrt(d)
        </text>

        <text className="viz-label" x={PAD.left} y={PAD.top - 12}>
          simulated count
        </text>
        <text className="viz-label" x={PAD.left + PLOT_WIDTH} y={PAD.top + PLOT_HEIGHT + 46} textAnchor="end">
          distance from origin
        </text>
      </svg>

      <div className="gaussian-legend" aria-hidden="true">
        <span><i className="gaussian-key gaussian-key-bars" /> simulated radius</span>
        <span><i className="gaussian-key gaussian-key-clt" /> CLT approximation</span>
        <span><i className="gaussian-key gaussian-key-center" /> sqrt(d)</span>
      </div>

      <dl className="viz-stats gaussian-stats" aria-label="Simulation summary">
        <div>
          <dt>sqrt(d)</dt>
          <dd>{formatStat(simulation.center)}</dd>
        </div>
        <div>
          <dt>mean radius</dt>
          <dd>{formatStat(simulation.mean)}</dd>
        </div>
        <div>
          <dt>middle 90%</dt>
          <dd>{formatStat(simulation.q05)} to {formatStat(simulation.q95)}</dd>
        </div>
        <div>
          <dt>relative width</dt>
          <dd>{formatPercent(relativeWidth)}</dd>
        </div>
      </dl>
    </figure>
  );
}

function makeSimulation(dimensions: number): Simulation {
  const radii = makeRadii(dimensions);
  const sorted = [...radii].sort((a, b) => a - b);
  const q05 = quantile(sorted, 0.05);
  const q95 = quantile(sorted, 0.95);
  const q999 = quantile(sorted, 0.999);
  const center = Math.sqrt(dimensions);
  const mean = radii.reduce((sum, radius) => sum + radius, 0) / radii.length;
  const padding = Math.max(0.08, 0.04 * q999);
  const xMin = 0;
  const xMax = q999 + padding;
  const binWidth = (xMax - xMin) / BIN_COUNT;
  const bins = Array.from({ length: BIN_COUNT }, (_, index) => ({
    x0: xMin + index * binWidth,
    x1: xMin + (index + 1) * binWidth,
    count: 0
  }));

  for (const radius of radii) {
    const binIndex = Math.min(BIN_COUNT - 1, Math.max(0, Math.floor(((radius - xMin) / (xMax - xMin)) * BIN_COUNT)));
    bins[binIndex].count += 1;
  }

  const cltPeak = SAMPLE_COUNT * binWidth * normalPdf(center, center, 1 / Math.sqrt(2));
  const yMax = Math.max(...bins.map((bin) => bin.count), cltPeak, 1);
  return { bins, center, mean, q05, q95, xMax, xMin, yMax };
}

function makeRadii(dimensions: number): number[] {
  const random = makeRandom(0x6d2b79f5 ^ dimensions);
  const radii: number[] = [];

  for (let sample = 0; sample < SAMPLE_COUNT; sample += 1) {
    let sumSquares = 0;
    let remaining = dimensions;
    while (remaining >= 2) {
      const [z0, z1] = normalPair(random);
      sumSquares += z0 * z0 + z1 * z1;
      remaining -= 2;
    }
    if (remaining === 1) {
      const [z0] = normalPair(random);
      sumSquares += z0 * z0;
    }
    radii.push(Math.sqrt(sumSquares));
  }

  return radii;
}

function makeRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return (state + 0.5) / 4294967296;
  };
}

function normalPair(random: () => number): [number, number] {
  const u1 = Math.max(random(), Number.MIN_VALUE);
  const u2 = random();
  const magnitude = Math.sqrt(-2 * Math.log(u1));
  const angle = 2 * Math.PI * u2;
  return [magnitude * Math.cos(angle), magnitude * Math.sin(angle)];
}

function quantile(sorted: number[], p: number): number {
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function makeCltPath(dimensions: number, simulation: Simulation): string {
  const center = Math.sqrt(dimensions);
  const sigma = 1 / Math.sqrt(2);
  const binWidth = (simulation.xMax - simulation.xMin) / BIN_COUNT;

  return Array.from({ length: 180 }, (_, index) => {
    const distance = simulation.xMin + (index / 179) * (simulation.xMax - simulation.xMin);
    const count = SAMPLE_COUNT * binWidth * normalPdf(distance, center, sigma);
    const x = xForDistance(distance, simulation);
    const y = yForCount(count, simulation.yMax);
    return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ");
}

function normalPdf(x: number, mean: number, sigma: number): number {
  const z = (x - mean) / sigma;
  return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI));
}

function xForDistance(distance: number, simulation: Pick<Simulation, "xMax" | "xMin">): number {
  return PAD.left + ((distance - simulation.xMin) / (simulation.xMax - simulation.xMin)) * PLOT_WIDTH;
}

function yForCount(count: number, yMax: number): number {
  return PAD.top + PLOT_HEIGHT - (count / yMax) * PLOT_HEIGHT;
}

function makeTicks(min: number, max: number): number[] {
  return Array.from({ length: 5 }, (_, index) => min + (index / 4) * (max - min));
}

function formatAxis(value: number): string {
  if (Math.abs(value) < 0.005) return "0";
  return value < 10 ? value.toFixed(1) : value.toFixed(0);
}

function formatStat(value: number): string {
  return value < 10 ? value.toFixed(2) : value.toFixed(1);
}

function formatPercent(value: number): string {
  return `${(100 * value).toFixed(1)}%`;
}
