/**
 * Render an accessible SVG chart for scenario employer costs by obligation.
 * @param {object[]} evaluations Monthly role-level engine evaluations.
 * @param {(key: string) => string} translate Translation lookup.
 * @param {(amount: number) => string} formatMoney Currency formatter.
 * @returns {string} Inline SVG markup.
 */
export function renderCostChart(evaluations, translate, formatMoney) {
  const totals = new Map();
  for (const evaluation of evaluations) {
    for (const item of evaluation.items) {
      if (
        item.employerCost > 0 &&
        ["epf", "esi", "gratuity"].includes(item.area)
      ) {
        totals.set(
          item.ruleId,
          (totals.get(item.ruleId) || 0) + item.employerCost
        );
      }
    }
  }
  const entries = [...totals.entries()];
  const largest = Math.max(1, ...entries.map(([, amount]) => amount));
  const rows = entries
    .map(([id, amount], index) => {
      const y = index * 48 + 14;
      const width = Math.round((amount / largest) * 360);
      return `<g>
      <text x="0" y="${y + 12}" class="chart-label">${escapeXml(translate(`ruleName.${id}`))}</text>
      <rect x="0" y="${y + 18}" width="360" height="13" rx="6" class="chart-track"/>
      <rect x="0" y="${y + 18}" width="${width}" height="13" rx="6" class="chart-bar"/>
      <text x="372" y="${y + 29}" class="chart-value">${escapeXml(formatMoney(amount))}</text>
    </g>`;
    })
    .join("");
  return `<svg class="cost-chart" viewBox="0 0 560 ${Math.max(60, entries.length * 48)}" role="img" aria-label="${escapeXml(translate("dashboard.breakdown"))}">
    ${entries.length ? rows : `<text x="0" y="24" class="chart-label">${escapeXml(translate("dashboard.noCosts"))}</text>`}
  </svg>`;
}

/**
 * Render an accessible SVG grant headcount timeline.
 * @param {object[]} timeline Grant and post-grant snapshots.
 * @param {number} selectedMonth Current scrubber month.
 * @param {(key: string) => string} translate Translation lookup.
 * @returns {string} Inline SVG timeline markup.
 */
export function renderGrantTimeline(timeline, selectedMonth, translate) {
  const largest = Math.max(
    1,
    ...timeline.map((point) => point.activeHeadcount)
  );
  const barWidth = Math.max(3, 720 / timeline.length - 2);
  const bars = timeline
    .map((point, index) => {
      const height = Math.max(
        3,
        Math.round((point.activeHeadcount / largest) * 74)
      );
      const x = index * (barWidth + 2);
      const y = 92 - height;
      const state = point.grantEnded
        ? "timeline-bar after-grant"
        : "timeline-bar";
      return `<g>
      <rect x="${x}" y="${y}" width="${barWidth}" height="${height}" class="${state}${point.month === selectedMonth ? " selected" : ""}"/>
      <text x="${x + barWidth / 2}" y="108" text-anchor="middle" class="timeline-label">${point.month}</text>
    </g>`;
    })
    .join("");
  return `<svg class="timeline-chart" viewBox="0 0 720 120" role="img" aria-label="${escapeXml(translate("dashboard.monthlyTimeline"))}">
    <line x1="0" y1="92" x2="720" y2="92" class="timeline-axis"/>
    ${bars}
  </svg>`;
}

function escapeXml(value) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;"
      })[character]
  );
}
