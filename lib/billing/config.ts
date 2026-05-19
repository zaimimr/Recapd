import Constants from "expo-constants";

export const ENTITLEMENT_PRO = "pro";
export const ENTITLEMENT_PER_EVENT = "per_event_pro";

export const PRODUCT_PER_EVENT_PRO = "recapd_event_pro";
export const PRODUCT_MONTHLY = "recapd_pro_monthly";
export const PRODUCT_ANNUAL = "recapd_pro_annual";

export const PER_EVENT_PRICE_LABEL = "$14.99";
export const MONTHLY_PRICE_LABEL = "$4.99";
export const ANNUAL_PRICE_LABEL = "$29.99";

export const FREE_GUEST_CAP = 20;
export const FREE_EVENT_WINDOW_HOURS = 48;
export const FREE_VIDEO_SECONDS = 30;
export const FREE_MEDIA_TTL_DAYS = 60;
export const FREE_ACTIVE_EVENT_LIMIT = 1;
export const FREE_PREVIEW_RESOLUTION = "1080p";

export const PRO_VIDEO_SECONDS = 240;
export const PRO_EVENT_WINDOW_DAYS = 30;

export const EXPIRY_WARNING_DAYS = 7;

function readKey(name: string): string | undefined {
	const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
	const value = extra?.[name];
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

export const REVENUECAT_IOS_KEY = readKey("revenuecatIosKey");
export const REVENUECAT_ANDROID_KEY = readKey("revenuecatAndroidKey");

export const SUBSCRIPTIONS_ENABLED = Boolean(REVENUECAT_IOS_KEY || REVENUECAT_ANDROID_KEY);
