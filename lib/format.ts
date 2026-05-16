export function formatCurrency(value: number) {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatSignedCurrency(value: number) {
  if (value === 0) {
    return formatCurrency(0);
  }

  return `${value > 0 ? "+" : "-"}${formatCurrency(Math.abs(value))}`;
}

export function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

export function formatMonthCount(value: number | null) {
  if (!value) {
    return "Needs data";
  }

  if (value === 1) {
    return "1 month";
  }

  return `${value} months`;
}

export function formatDateLabel(value: string) {
  if (value === "Completed") {
    return value;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "No date yet";
  }

  return new Intl.DateTimeFormat("nl-NL", {
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatRelativeDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Recently";
  }

  return new Intl.DateTimeFormat("nl-NL", {
    month: "short",
    day: "numeric",
  }).format(date);
}
