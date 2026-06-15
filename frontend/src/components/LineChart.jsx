const toNumber = (value) => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};

const getPoints = (values, dimensions, minValue, maxValue) => {
  const { width, height, paddingX, paddingY } = dimensions;
  const range = maxValue - minValue || 1;
  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingY * 2;
  const lastIndex = Math.max(values.length - 1, 1);

  return values.map((value, index) => {
    const x = paddingX + (index / lastIndex) * chartWidth;
    const y =
      height - paddingY - ((toNumber(value) - minValue) / range) * chartHeight;

    return { x, y };
  });
};

const buildSmoothPath = (points) => {
  if (!points.length) return "";
  if (points.length === 1) {
    return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  }

  const commands = [`M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`];

  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] || points[index];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[index + 2] || p2;
    const controlPoint1 = {
      x: p1.x + (p2.x - p0.x) / 6,
      y: p1.y + (p2.y - p0.y) / 6,
    };
    const controlPoint2 = {
      x: p2.x - (p3.x - p1.x) / 6,
      y: p2.y - (p3.y - p1.y) / 6,
    };

    commands.push(
      `C ${controlPoint1.x.toFixed(2)} ${controlPoint1.y.toFixed(2)}, ${controlPoint2.x.toFixed(2)} ${controlPoint2.y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,
    );
  }

  return commands.join(" ");
};

const buildAreaPath = (points, baselineY) => {
  if (points.length < 2) return "";

  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];

  return [
    `M ${firstPoint.x.toFixed(2)} ${baselineY.toFixed(2)}`,
    buildSmoothPath(points).replace(/^M /, "L "),
    `L ${lastPoint.x.toFixed(2)} ${baselineY.toFixed(2)}`,
    "Z",
  ].join(" ");
};

const getDimensions = (variant) =>
  variant === "sparkline"
    ? { width: 180, height: 56, paddingX: 8, paddingY: 8 }
    : { width: 420, height: 210, paddingX: 34, paddingY: 22 };

const LineChart = ({
  ariaLabel,
  className = "",
  labels = [],
  series,
  showAxis = false,
  showArea,
  showGrid = false,
  showLegend = false,
  variant = "panel",
}) => {
  const cleanSeries = series
    .map((item) => ({
      ...item,
      values: item.values.map(toNumber),
    }))
    .filter((item) => item.values.length);

  const allValues = cleanSeries.flatMap((item) => item.values);
  const dimensions = getDimensions(variant);
  const minValue = Math.min(0, ...allValues);
  const maxValue = Math.max(0, ...allValues);
  const middleLabelIndex = Math.floor((labels.length - 1) / 2);
  const shouldShowArea =
    showArea ?? (variant === "sparkline" && cleanSeries.length === 1);

  if (!cleanSeries.length) {
    return null;
  }

  return (
    <figure className={`line-chart line-chart-${variant} ${className}`}>
      <svg
        aria-label={ariaLabel}
        role="img"
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
      >
        {showGrid
          ? [0, 1, 2].map((line) => {
              const y =
                dimensions.paddingY +
                (line / 2) * (dimensions.height - dimensions.paddingY * 2);

              return (
                <line
                  className="line-chart-grid"
                  key={line}
                  x1={dimensions.paddingX}
                  x2={dimensions.width - dimensions.paddingX}
                  y1={y}
                  y2={y}
                />
              );
            })
          : null}

        {cleanSeries.map((item) => {
          const points = getPoints(item.values, dimensions, minValue, maxValue);
          const tone = item.tone || "neutral";
          const path = buildSmoothPath(points);
          const areaPath = buildAreaPath(
            points,
            dimensions.height - dimensions.paddingY,
          );

          return (
            <g
              className={`line-chart-series line-chart-series-${tone}`}
              key={item.name}
            >
              {shouldShowArea && areaPath ? (
                <path
                  className={`line-chart-area line-chart-area-${tone}`}
                  d={areaPath}
                />
              ) : null}
              <path
                className={`line-chart-line line-chart-line-${tone}`}
                d={path}
              />
            </g>
          );
        })}

        {showAxis && labels.length ? (
          <g className="line-chart-axis">
            {[0, middleLabelIndex, labels.length - 1]
              .filter(
                (index, position, indexes) => indexes.indexOf(index) === position,
              )
              .map((index) => {
                const lastIndex = Math.max(labels.length - 1, 1);
                const x =
                  dimensions.paddingX +
                  (index / lastIndex) *
                    (dimensions.width - dimensions.paddingX * 2);

                return (
                  <text
                    key={`${labels[index]}-${index}`}
                    textAnchor={
                      index === 0
                        ? "start"
                        : index === labels.length - 1
                          ? "end"
                          : "middle"
                    }
                    x={x}
                    y={dimensions.height - 3}
                  >
                    {labels[index]}
                  </text>
                );
              })}
          </g>
        ) : null}
      </svg>

      {showLegend ? (
        <figcaption className="line-chart-legend">
          {cleanSeries.map((item) => (
            <span
              className={`line-chart-legend-${item.tone || "neutral"}`}
              key={item.name}
            >
              <i aria-hidden="true" />
              {item.name}
            </span>
          ))}
        </figcaption>
      ) : null}
    </figure>
  );
};

export default LineChart;
