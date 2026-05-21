import type { JSX } from "react";

const WIDTH = 720;
const HEIGHT = 360;
const PAD = { top: 28, right: 26, bottom: 48, left: 46 };
const PLOT_WIDTH = WIDTH - PAD.left - PAD.right;
const PLOT_HEIGHT = HEIGHT - PAD.top - PAD.bottom;

interface Props {
  alpha: number;
  beta: number;
  priorAlpha: number;
  priorBeta: number;
  title: string;
  description?: string;
}

function logGamma(z: number): number {
  const coefficients = [
    676.5203681218851,
    -1259.1392167224028,
    771.3234287776531,
    -176.6150291621406,
    12.507343278686905,
    -0.13857109526572012,
    9.984369578019572e-6,
    1.5056327351493116e-7
  ];

  if (z < 0.5) {
    return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  }

  let x = 0.9999999999998099;
  const shifted = z - 1;
  for (let i = 0; i < coefficients.length; i += 1) {
    x += coefficients[i] / (shifted + i + 1);
  }
  const t = shifted + coefficients.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (shifted + 0.5) * Math.log(t) - t + Math.log(x);
}

function betaPdf(x: number, alpha: number, beta: number) {
  const boundedX = Math.min(Math.max(x, 0.0001), 0.9999);
  const logPdf =
    (alpha - 1) * Math.log(boundedX) +
    (beta - 1) * Math.log(1 - boundedX) +
    logGamma(alpha + beta) -
    logGamma(alpha) -
    logGamma(beta);
  return Math.exp(logPdf);
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
}

function makeSamples(alpha: number, beta: number) {
  return Array.from({ length: 180 }, (_, index) => {
    const x = index / 179;
    return { x, y: betaPdf(x, alpha, beta) };
  });
}

function makePath(samples: Array<{ x: number; y: number }>, yMax: number) {
  return samples
    .map((sample, index) => {
      const px = PAD.left + sample.x * PLOT_WIDTH;
      const py = PAD.top + PLOT_HEIGHT - (sample.y / yMax) * PLOT_HEIGHT;
      return `${index === 0 ? "M" : "L"} ${px.toFixed(2)} ${py.toFixed(2)}`;
    })
    .join(" ");
}

export default function BetaDistributionPlot({
  alpha,
  beta,
  priorAlpha,
  priorBeta,
  title,
  description
}: Props): JSX.Element {
  const posteriorSamples = makeSamples(alpha, beta);
  const priorSamples = makeSamples(priorAlpha, priorBeta);
  const yMax = Math.max(
    ...posteriorSamples.map((sample) => sample.y),
    ...priorSamples.map((sample) => sample.y),
    1
  );
  const posteriorPath = makePath(posteriorSamples, yMax);
  const priorPath = makePath(priorSamples, yMax);
  const mean = alpha / (alpha + beta);
  const meanX = PAD.left + mean * PLOT_WIDTH;
  const priorMean = priorAlpha / (priorAlpha + priorBeta);
  const priorMeanX = PAD.left + priorMean * PLOT_WIDTH;
  const figureId = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-plot`;
  const defaultDescription = `Posterior Beta(${alpha}, ${beta}) and prior Beta(${priorAlpha}, ${priorBeta}) densities over predicted probabilities.`;

  return (
    <figure className="viz beta-viz" aria-labelledby={figureId}>
      <div className="viz-header">
        <div>
          <figcaption id={figureId}>{title}</figcaption>
          <p>{description ?? defaultDescription}</p>
        </div>
        <code>
          posterior Beta({formatNumber(alpha)}, {formatNumber(beta)})
        </code>
      </div>

      <svg
        className="viz-plot"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Posterior beta distribution with alpha ${formatNumber(alpha)} and beta ${formatNumber(beta)}, compared with prior beta distribution with alpha ${formatNumber(priorAlpha)} and beta ${formatNumber(priorBeta)}.`}
      >
        <line className="viz-axis" x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + PLOT_HEIGHT} />
        <line className="viz-axis" x1={PAD.left} y1={PAD.top + PLOT_HEIGHT} x2={PAD.left + PLOT_WIDTH} y2={PAD.top + PLOT_HEIGHT} />
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
          const x = PAD.left + tick * PLOT_WIDTH;
          return (
            <g key={tick}>
              <line className="viz-grid" x1={x} y1={PAD.top} x2={x} y2={PAD.top + PLOT_HEIGHT} />
              <text className="viz-label" x={x} y={PAD.top + PLOT_HEIGHT + 26} textAnchor="middle">
                {tick.toFixed(2).replace(/^0/, "")}
              </text>
            </g>
          );
        })}
        {[0.25, 0.5, 0.75].map((tick) => {
          const y = PAD.top + tick * PLOT_HEIGHT;
          return <line key={tick} className="viz-grid" x1={PAD.left} y1={y} x2={PAD.left + PLOT_WIDTH} y2={y} />;
        })}
        <path
          className="viz-fill"
          d={`${posteriorPath} L ${PAD.left + PLOT_WIDTH} ${PAD.top + PLOT_HEIGHT} L ${PAD.left} ${PAD.top + PLOT_HEIGHT} Z`}
        />
        <path className="viz-line" d={posteriorPath} />
        <path className="viz-prior-line" d={priorPath} />
        <line className="viz-mean" x1={meanX} y1={PAD.top} x2={meanX} y2={PAD.top + PLOT_HEIGHT} />
        <text className="viz-label" x={meanX} y={PAD.top + 16} textAnchor="middle">
          posterior mean
        </text>
        <line className="viz-prior-mean" x1={priorMeanX} y1={PAD.top} x2={priorMeanX} y2={PAD.top + PLOT_HEIGHT} />
        <text className="viz-label" x={priorMeanX} y={PAD.top + 31} textAnchor="middle">
          prior mean
        </text>
        <text className="viz-label" x={PAD.left} y={PAD.top - 10}>
          density, scaled to max {yMax.toFixed(2)}
        </text>
        <text className="viz-label" x={PAD.left + PLOT_WIDTH} y={PAD.top + PLOT_HEIGHT + 42} textAnchor="end">
          predicted probability
        </text>
      </svg>

      <dl className="viz-stats" aria-label="Plot parameters">
        <div>
          <dt>posterior</dt>
          <dd>Beta({formatNumber(alpha)}, {formatNumber(beta)})</dd>
        </div>
        <div>
          <dt>prior</dt>
          <dd>Beta({formatNumber(priorAlpha)}, {formatNumber(priorBeta)})</dd>
        </div>
        <div>
          <dt>means</dt>
          <dd>{mean.toFixed(2)} / {priorMean.toFixed(2)}</dd>
        </div>
      </dl>
    </figure>
  );
}
