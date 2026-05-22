type LogContext = Record<string, unknown> | undefined;

declare const __DEV__: boolean | undefined;

function format(level: string, message: string, context: LogContext): string {
	const ts = new Date().toISOString();
	const ctx = context ? ` ${JSON.stringify(context)}` : "";
	return `[${ts}] ${level} ${message}${ctx}`;
}

export const logger = {
	info(message: string, context?: LogContext) {
		console.log(format("INFO", message, context));
	},
	warn(message: string, context?: LogContext) {
		console.warn(format("WARN", message, context));
	},
	error(message: string, context?: LogContext) {
		console.error(format("ERROR", message, context));
	},
	debug(message: string, context?: LogContext) {
		if (typeof __DEV__ === "undefined" || __DEV__) {
			console.log(format("DEBUG", message, context));
		}
	},
};
