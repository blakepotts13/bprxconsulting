const localDate = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

export function releaseSchedule(now = new Date()) {
  const parts = Object.fromEntries(
    localDate
      .formatToParts(now)
      .map(({ type, value }) => [type, Number(value)]),
  );
  const current = Math.floor((parts.month - 1) / 3);
  const opens = parts.month === (current + 1) * 3 && parts.day >= 15;
  const year = parts.year + (current === 3 ? 1 : 0);
  const quarter = ((current + 1) % 4) + 1;
  return {
    opens,
    quarter: `${year}-Q${quarter}`,
    effective: `${year}-${String(quarter * 3 - 2).padStart(2, "0")}-01`,
    previewDate: `${parts.year}-${String((current + 1) * 3).padStart(2, "0")}-15`,
    currentQuarter: `${parts.year}-Q${current + 1}`,
  };
}

export function selectReportRows(report, category, text, page, perPage = 50) {
  const terms = text.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const rows = (report?.changes?.[category] || []).filter((row) => {
    const searchable = [row.id, row.name, row.before, row.after]
      .join(" ")
      .toLowerCase();
    return terms.every((term) => searchable.includes(term));
  });
  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  const current = Math.max(1, Math.min(pages, Number(page) || 1));
  return {
    rows: rows.slice((current - 1) * perPage, current * perPage),
    total: rows.length,
    pages,
    current,
  };
}
