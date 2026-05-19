import type { ExpoConfig } from "expo/config";
import baseConfig from "./app.json";

const base = baseConfig.expo as Partial<ExpoConfig> & { extra?: Record<string, unknown> };

const config: ExpoConfig = {
	...(base as ExpoConfig),
	extra: {
		...(base.extra ?? {}),
		supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
		supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
		appScheme: process.env.EXPO_PUBLIC_APP_SCHEME ?? "recapd",
		webJoinBase: process.env.EXPO_PUBLIC_WEB_JOIN_URL ?? "https://recapd.app/j",
		revenuecatIosKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
	},
};

export default config;
