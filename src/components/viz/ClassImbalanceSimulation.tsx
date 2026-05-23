import { useId, useMemo, useState, type JSX } from "react";

const N = 20_000;
const TARGET_RATE = 0.01;
const SLOPE = 2.2;
const ACTION_THRESHOLD = 0.05;
const WIDTH = 720;
const HEIGHT = 440;
const PAD = { top: 60, right: 28, bottom: 52, left: 58 };
const PLOT_WIDTH = WIDTH - PAD.left - PAD.right;
const PLOT_HEIGHT = HEIGHT - PAD.top - PAD.bottom;

interface Row {
  x: number;
  p: number;
  y: 0 | 1;
}

interface CalibrationBin {
  meanPredicted: number;
  observedRate: number;
  count: number;
}

interface Metrics {
  auc: number;
  logLoss: number;
  meanPredicted: number;
}

const rows = makeRows();
const basePredictions = rows.map((row) => row.p);
const observedRate = rows.reduce((sum, row) => sum + row.y, 0) / rows.length;
const positiveCount = rows.reduce((sum, row) => sum + row.y, 0);
const baseMetrics = makeMetrics(basePredictions);
const baseCalibration = makeCalibration(basePredictions);

export default function ClassImbalanceSimulation(): JSX.Element {
  const figureId = useId();
  const sliderId = useId();
  const [logWeight, setLogWeight] = useState(Math.log10(25));
  const positiveWeight = 10 ** logWeight;

  const weighted = useMemo(() => {
    const predictions = rows.map((row) => transformProbability(row.p, positiveWeight));
    return {
      calibration: makeCalibration(predictions),
      metrics: makeMetrics(predictions)
    };
  }, [positiveWeight]);

  const equivalentThreshold = transformProbability(ACTION_THRESHOLD, positiveWeight);

  return (
    <figure className="viz imbalance-viz" aria-labelledby={figureId}>
      <div className="viz-header">
        <div>
          <figcaption id={figureId}>Weighted logistic regression on a representative test set</figcaption>
          <p>
            The data-generating process has a {formatPercent(observedRate, 2)} positive rate. Weighting positives
            shifts the fitted log-odds by log(weight), which changes probabilities but preserves ranking.
          </p>
        </div>
        <code>{formatCount(positiveCount)} positives / {formatCount(N)}</code>
      </div>

      <div className="imbalance-control">
        <div className="imbalance-control-head">
          <label htmlFor={sliderId}>positive class weight</label>
          <output htmlFor={sliderId}>{formatWeight(positiveWeight)}</output>
        </div>
        <input
          id={sliderId}
          aria-label="Positive class weight"
          className="imbalance-slider"
          max={2}
          min={0}
          step={0.01}
          type="range"
          value={logWeight}
          onChange={(event) => setLogWeight(event.currentTarget.valueAsNumber)}
        />
        <div className="imbalance-presets" aria-label="Positive class weight presets">
          {[1, 10, 100].map((weight) => (
            <button
              className={isSelectedWeight(positiveWeight, weight) ? "is-selected" : ""}
              key={weight}
              type="button"
              aria-pressed={isSelectedWeight(positiveWeight, weight)}
              onClick={() => setLogWeight(Math.log10(weight))}
            >
              {weight}x
            </button>
          ))}
        </div>
      </div>

      <dl className="imbalance-metrics" aria-label="Simulation metrics">
        <Metric
          label="mean predicted"
          value={`${formatPercent(baseMetrics.meanPredicted, 2)} -> ${formatPercent(weighted.metrics.meanPredicted, 2)}`}
          note={`true rate ${formatPercent(observedRate, 2)}`}
          tone={weighted.metrics.meanPredicted > baseMetrics.meanPredicted * 1.5 ? "harm" : "neutral"}
        />
        <Metric
          label="test log loss"
          value={`${baseMetrics.logLoss.toFixed(4)} -> ${weighted.metrics.logLoss.toFixed(4)}`}
          note={weighted.metrics.logLoss > baseMetrics.logLoss ? "worse on real base rate" : "same objective"}
          tone={weighted.metrics.logLoss > baseMetrics.logLoss * 1.05 ? "harm" : "neutral"}
        />
        <Metric
          label="ROC AUC"
          value={`${baseMetrics.auc.toFixed(3)} -> ${weighted.metrics.auc.toFixed(3)}`}
          note="ranking unchanged"
          tone="good"
        />
        <Metric
          label="decision threshold"
          value={formatPercent(equivalentThreshold, 1)}
          note={`matches a calibrated ${formatPercent(ACTION_THRESHOLD, 1)} cutoff`}
          tone="neutral"
        />
      </dl>

      <div className="imbalance-chart-wrap">
        <svg
          className="viz-plot imbalance-plot"
          role="img"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          aria-label="Calibration plot comparing an unweighted calibrated logistic model with a positive-class weighted model."
        >
          <text className="imbalance-plot-title" x={PAD.left} y={24}>
            Calibration curve: predicted vs observed rates
          </text>

          <line className="viz-axis" x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + PLOT_HEIGHT} />
          <line
            className="viz-axis"
            x1={PAD.left}
            y1={PAD.top + PLOT_HEIGHT}
            x2={PAD.left + PLOT_WIDTH}
            y2={PAD.top + PLOT_HEIGHT}
          />

          {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
            const x = xForRate(tick);
            const y = yForRate(tick);
            return (
              <g key={tick}>
                <line className="viz-grid" x1={x} y1={PAD.top} x2={x} y2={PAD.top + PLOT_HEIGHT} />
                <line className="viz-grid" x1={PAD.left} y1={y} x2={PAD.left + PLOT_WIDTH} y2={y} />
                <text className="viz-label" x={x} y={PAD.top + PLOT_HEIGHT + 28} textAnchor="middle">
                  {formatPercent(tick, 0)}
                </text>
                <text className="viz-label" x={PAD.left - 10} y={y + 4} textAnchor="end">
                  {formatPercent(tick, 0)}
                </text>
              </g>
            );
          })}

          <line
            className="imbalance-ideal"
            x1={PAD.left}
            y1={PAD.top + PLOT_HEIGHT}
            x2={PAD.left + PLOT_WIDTH}
            y2={PAD.top}
          />

          <CalibrationPath bins={baseCalibration} className="imbalance-base-line" />
          <CalibrationPath bins={weighted.calibration} className="imbalance-weighted-line" />

          {baseCalibration.map((bin) => (
            <circle
              className="imbalance-base-point"
              cx={xForRate(bin.meanPredicted)}
              cy={yForRate(bin.observedRate)}
              key={`base-${bin.meanPredicted}`}
              r={4}
            />
          ))}
          {weighted.calibration.map((bin) => (
            <circle
              className="imbalance-weighted-point"
              cx={xForRate(bin.meanPredicted)}
              cy={yForRate(bin.observedRate)}
              key={`weighted-${bin.meanPredicted}`}
              r={4}
            />
          ))}

          <text className="viz-label" x={PAD.left} y={PAD.top - 10}>
            observed positive rate
          </text>
          <text className="viz-label" x={PAD.left + PLOT_WIDTH} y={PAD.top + PLOT_HEIGHT + 44} textAnchor="end">
            mean predicted probability
          </text>
        </svg>

        <div className="imbalance-legend" aria-hidden="true">
          <span><i className="imbalance-key imbalance-key-base" /> calibrated</span>
          <span><i className="imbalance-key imbalance-key-weighted" /> weighted</span>
          <span><i className="imbalance-key imbalance-key-ideal" /> perfect calibration</span>
        </div>
      </div>
    </figure>
  );
}

function Metric({
  label,
  note,
  tone,
  value
}: {
  label: string;
  note: string;
  tone: "good" | "harm" | "neutral";
  value: string;
}) {
  return (
    <div className={`imbalance-metric is-${tone}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
      <span>{note}</span>
    </div>
  );
}

function CalibrationPath({ bins, className }: { bins: CalibrationBin[]; className: string }) {
  const d = bins
    .map((bin, index) => {
      const x = xForRate(bin.meanPredicted);
      const y = yForRate(bin.observedRate);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  return <path className={className} d={d} />;
}

function makeRows(): Row[] {
  const rng = mulberry32(20260522);
  const xs = Array.from({ length: N }, () => clamp(normal(rng), -3.6, 3.6));
  const intercept = solveIntercept(xs);

  return xs.map((x) => {
    const p = sigmoid(intercept + SLOPE * x);
    return {
      x,
      p,
      y: rng() < p ? 1 : 0
    };
  });
}

function solveIntercept(xs: number[]): number {
  let low = -20;
  let high = 5;

  for (let i = 0; i < 80; i += 1) {
    const mid = (low + high) / 2;
    const mean = xs.reduce((sum, x) => sum + sigmoid(mid + SLOPE * x), 0) / xs.length;
    if (mean > TARGET_RATE) {
      high = mid;
    } else {
      low = mid;
    }
  }

  return (low + high) / 2;
}

function makeMetrics(predictions: number[]): Metrics {
  return {
    auc: makeAuc(predictions),
    logLoss: makeLogLoss(predictions),
    meanPredicted: predictions.reduce((sum, p) => sum + p, 0) / predictions.length
  };
}

function makeCalibration(predictions: number[]): CalibrationBin[] {
  const sorted = rows
    .map((row, index) => ({ prediction: predictions[index], y: row.y }))
    .sort((a, b) => a.prediction - b.prediction);
  const binCount = 10;
  const bins: CalibrationBin[] = [];

  for (let bin = 0; bin < binCount; bin += 1) {
    const start = Math.floor((bin / binCount) * sorted.length);
    const end = Math.floor(((bin + 1) / binCount) * sorted.length);
    const slice = sorted.slice(start, end);
    const meanPredicted = slice.reduce((sum, row) => sum + row.prediction, 0) / slice.length;
    const observedBinRate = slice.reduce((sum, row) => sum + row.y, 0) / slice.length;
    bins.push({ count: slice.length, meanPredicted, observedRate: observedBinRate });
  }

  return bins;
}

function makeLogLoss(predictions: number[]): number {
  const total = rows.reduce((sum, row, index) => {
    const p = clamp(predictions[index], 1e-8, 1 - 1e-8);
    return sum - (row.y * Math.log(p) + (1 - row.y) * Math.log(1 - p));
  }, 0);
  return total / rows.length;
}

function makeAuc(predictions: number[]): number {
  const sorted = rows
    .map((row, index) => ({ score: predictions[index], y: row.y }))
    .sort((a, b) => a.score - b.score);
  const positives = positiveCount;
  const negatives = rows.length - positiveCount;
  let rankSum = 0;

  for (let index = 0; index < sorted.length; index += 1) {
    if (sorted[index].y === 1) {
      rankSum += index + 1;
    }
  }

  return (rankSum - (positives * (positives + 1)) / 2) / (positives * negatives);
}

function transformProbability(p: number, positiveWeight: number): number {
  return sigmoid(logit(p) + Math.log(positiveWeight));
}

function xForRate(rate: number): number {
  return PAD.left + clamp(rate, 0, 1) * PLOT_WIDTH;
}

function yForRate(rate: number): number {
  return PAD.top + PLOT_HEIGHT - clamp(rate, 0, 1) * PLOT_HEIGHT;
}

function logit(p: number): number {
  const bounded = clamp(p, 1e-8, 1 - 1e-8);
  return Math.log(bounded / (1 - bounded));
}

function sigmoid(value: number): number {
  if (value >= 0) {
    const z = Math.exp(-value);
    return 1 / (1 + z);
  }
  const z = Math.exp(value);
  return z / (1 + z);
}

function normal(rng: () => number): number {
  const u1 = Math.max(rng(), 1e-12);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatPercent(value: number, digits: number): string {
  return `${(value * 100).toFixed(digits)}%`;
}

function formatWeight(value: number): string {
  if (value < 10) {
    return `${value.toFixed(value < 1.05 ? 0 : 1)}x`;
  }
  return `${value.toFixed(0)}x`;
}

function isSelectedWeight(current: number, preset: number): boolean {
  return Math.abs(current - preset) / preset < 0.02;
}
