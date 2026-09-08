/**
 * A scatter plot of sleep against test scores.
 *
 * Shared, because it does two different jobs. On the landing page it is the
 * hero: the one image this app has that nobody else does, stating the whole
 * product before a word is read. In onboarding it appears beside the password
 * step, which is the most expensive thing Insight asks for — a second
 * password, unrecoverable — and used to be asked with nothing on screen to
 * justify it.
 *
 * The points are coloured by which side of *this student's own average* they
 * fall, which is exactly the split the engine makes, so the picture is the
 * algorithm rather than a decoration of it.
 *
 * Inline SVG rather than a screenshot: a PNG goes stale the first time the
 * dashboard changes, blurs on a retina display unless shipped at 3x, and
 * carries no text for a screen reader. The numbers are the demo student's, and
 * the card says so.
 */
export function ScatterCard() {
  // Sleep hours against the score on the next test. The upward drift is the
  // effect planted in `src/lib/demo-data.ts`, not an invention for this page.
  // Deliberately noisy. An earlier version stepped the scores up in order and
  // produced a near-perfect diagonal, which reads as a drawn line rather than
  // as measurements — and a study app illustrating itself with data too clean
  // to be real is the wrong first impression to make.
  const points: [number, number][] = [
    [4.6, 68], [4.8, 55], [5.2, 71], [5.3, 62], [5.4, 59], [5.9, 74],
    [6.0, 66], [6.1, 81], [6.3, 70], [6.6, 63], [6.7, 77], [6.9, 85],
    [7.0, 72], [7.2, 90], [7.2, 79], [7.5, 68], [7.6, 88], [7.7, 76],
    [8.0, 95], [8.1, 83], [8.2, 71], [8.5, 92], [8.6, 86], [8.9, 79],
    [9.2, 97], [9.3, 88],
  ];

  const mean = points.reduce((sum, [x]) => sum + x, 0) / points.length;

  // The two group means, computed from the dots rather than typed in beneath
  // them. A hardcoded caption drifts the moment anyone edits a point, and the
  // whole argument of this page is that the number matches the data.
  const average = (xs: number[]) =>
    xs.reduce((sum, n) => sum + n, 0) / Math.max(xs.length, 1);
  const below = points.filter(([x]) => x < mean);
  const gap =
    average(below.map(([, y]) => y)) -
    average(points.filter(([x]) => x >= mean).map(([, y]) => y));

  // Plot area inside the 340×260 box, leaving room for the axis labels.
  const [L, R, T, B] = [46, 322, 22, 214];
  const [xMin, xMax, yMin, yMax] = [4, 10, 50, 100];
  const px = (x: number) => L + ((x - xMin) / (xMax - xMin)) * (R - L);
  const py = (y: number) => B - ((y - yMin) / (yMax - yMin)) * (B - T);

  return (
    <figure className="mk-card overflow-hidden p-1.5 shadow-[0_36px_90px_-38px_rgba(27,31,42,0.55)]">
      <div className="rounded-[13px] bg-bg p-5 sm:p-6">
        <figcaption className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="h3 text-[16px] text-text">Sleep against test scores</h2>
          <span className="label text-text-faint">Sample data</span>
        </figcaption>

        <svg
          viewBox="0 0 340 260"
          className="mt-3 w-full"
          role="img"
          aria-label="A scatter plot of 26 tests against the hours slept the night before. The points are scattered, but tests that followed a shorter-than-average night average about 14 percentage points lower than those that followed a longer one."
        >
          {/* Gridlines, then axes over them. */}
          {[50, 60, 70, 80, 90, 100].map((y) => (
            <g key={y}>
              <line
                x1={L}
                x2={R}
                y1={py(y)}
                y2={py(y)}
                stroke="var(--line)"
                strokeDasharray="2 4"
              />
              <text
                x={L - 10}
                y={py(y) + 4}
                textAnchor="end"
                className="fill-[var(--text-faint)] text-[10px]"
              >
                {y}
              </text>
            </g>
          ))}

          {[5, 6, 7, 8, 9].map((x) => (
            <text
              key={x}
              x={px(x)}
              y={B + 18}
              textAnchor="middle"
              className="fill-[var(--text-faint)] text-[10px]"
            >
              {x}h
            </text>
          ))}

          {/* The split. Everything left of this line is a short night *for this
              student* — which is the comparison the engine makes, and the
              reason the page never says "eight hours". */}
          <line
            x1={px(mean)}
            x2={px(mean)}
            y1={T - 2}
            y2={B + 4}
            stroke="var(--line-hi)"
            strokeDasharray="4 4"
          />
          {/* Above the top gridline, not level with it — set at T + 4 the words
              sat directly on the 100 rule and read as part of it. */}
          <text
            x={px(mean) + 6}
            y={T - 8}
            className="fill-[var(--text-faint)] text-[9px]"
          >
            your average
          </text>

          {points.map(([x, y], i) => (
            <circle
              key={i}
              cx={px(x)}
              cy={py(y)}
              r="4.5"
              fill={x < mean ? "var(--ember)" : "var(--accent)"}
              fillOpacity="0.9"
            />
          ))}

          <text
            x={L}
            y={252}
            className="fill-[var(--text-faint)] text-[10px]"
          >
            hours slept the night before
          </text>
        </svg>

        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line pt-4 text-[13px] text-text-muted">
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-ember" aria-hidden />
            Below your average ({below.length})
          </span>
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-accent" aria-hidden />
            Above it ({points.length - below.length})
          </span>
          <span className="ml-auto text-down">
            {gap.toFixed(0)} points apart
          </span>
        </div>
      </div>
    </figure>
  );
}
