export function formatDuration(milliseconds: number): string {
	if (!Number.isFinite(milliseconds) || milliseconds < 0) {
		return "00:00:00";
	}

	const totalSeconds = Math.round(milliseconds / 1000);

	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds
		.toString()
		.padStart(2, "0")}`;
}

type DateInput = Date | string | number;

function toDate(value: DateInput): Date {
	return value instanceof Date ? value : new Date(value);
}

export function formatLocalizedDate(value: DateInput, options: Intl.DateTimeFormatOptions): string {
	return new Intl.DateTimeFormat(undefined, options).format(toDate(value));
}

export function formatLocalizedTime(
	value: DateInput,
	options: Intl.DateTimeFormatOptions = {}
): string {
	return formatLocalizedDate(value, {
		hour: "numeric",
		minute: "2-digit",
		...options,
	});
}

export function formatLocalizedDateTime(
	value: DateInput,
	dateOptions: Intl.DateTimeFormatOptions,
	timeOptions: Intl.DateTimeFormatOptions = {},
	separator = " · "
): string {
	return `${formatLocalizedDate(value, dateOptions)}${separator}${formatLocalizedTime(
		value,
		timeOptions
	)}`;
}

export function formatLocalizedTimeRange(
	start: DateInput,
	end: DateInput,
	separator = " - "
): string {
	return `${formatLocalizedTime(start)}${separator}${formatLocalizedTime(end)}`;
}
