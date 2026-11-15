// Canvas drawing shared by the Turbo price charts.

export interface PriceAxisLayout {
  /** Lowest and highest price the plot shows. */
  yMin: number
  yMax: number
  /** Left edge and width of the plot in CSS pixels; the labels sit just right of it. */
  plotLeft: number
  plotWidth: number
  /** Canvas y of a price. */
  toY: (price: number) => number
  /** Also draw a faint line across the plot at each labelled price. */
  gridLines: boolean
}

// About five labels over the range, on steps of 1, 2 or 5 times a power of ten.
function niceStep(range: number): number {
  const raw = range / 5
  const base = Math.pow(10, Math.floor(Math.log10(raw)))
  const m = raw / base
  return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * base
}

/** Right-axis price labels at round prices, with optional grid lines across the plot. */
export function drawPriceAxis(ctx: CanvasRenderingContext2D, layout: PriceAxisLayout): void {
  const { yMin, yMax, plotLeft, plotWidth, toY, gridLines } = layout
  const range = yMax - yMin
  const step = niceStep(range)
  // Show decimals when the price range is small (e.g. SOL $82-$83).
  const fracDigits = range < 10 ? 2 : range < 100 ? 1 : 0
  ctx.font = '11px ui-monospace, SFMono-Regular, monospace'
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'
  ctx.textAlign = 'left'
  for (let p = Math.ceil(yMin / step) * step; p <= yMax; p += step) {
    const y = toY(p)
    if (gridLines) {
      // Subtle on the dark background.
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(plotLeft, y + 0.5)
      ctx.lineTo(plotLeft + plotWidth, y + 0.5)
      ctx.stroke()
    }
    ctx.fillText(
      `$${p.toLocaleString(undefined, { minimumFractionDigits: fracDigits, maximumFractionDigits: fracDigits })}`,
      plotLeft + plotWidth + 6,
      y + 4,
    )
  }
}
