export function safeDate(value: string | number | Date | undefined | null): Date {
	if (!value) return new Date();
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime()) || date.getTime() < 0 || date.getTime() > 8640000000000000) {
		return new Date();
	}
	return date;
}
