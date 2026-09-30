export const KIT_FORMATS = ["social", "story", "table", "poster"] as const;
export type KitFormat = (typeof KIT_FORMATS)[number];

export const PRINT_FORMATS = ["table", "poster"] as const;
export type PrintFormat = (typeof PRINT_FORMATS)[number];

export const FORMAT_SIZE: Record<KitFormat, { width: number; height: number }> = {
	social: { width: 1920, height: 1005 },
	story: { width: 1080, height: 1920 },
	table: { width: 397, height: 559 },
	poster: { width: 794, height: 1123 },
};

export function isKitFormat(value: unknown): value is KitFormat {
	return typeof value === "string" && (KIT_FORMATS as readonly string[]).includes(value);
}

export function isPrintFormat(value: unknown): value is PrintFormat {
	return typeof value === "string" && (PRINT_FORMATS as readonly string[]).includes(value);
}
