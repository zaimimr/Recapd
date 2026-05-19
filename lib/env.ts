import Constants from "expo-constants";

type Extra = {
	supabaseUrl?: string;
	supabaseAnonKey?: string;
	appScheme?: string;
	webJoinBase?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

const supabaseUrl = extra.supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = extra.supabaseAnonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const appScheme = extra.appScheme ?? process.env.EXPO_PUBLIC_APP_SCHEME ?? "recapd";
const webJoinBase = extra.webJoinBase ?? process.env.EXPO_PUBLIC_WEB_JOIN_URL ?? "https://recapd.app/j";

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error("Missing Supabase URL or anon key. Copy .env.example to .env.");
}

export const env = {
	supabaseUrl,
	supabaseAnonKey,
	appScheme,
	webJoinBase,
} as const;
