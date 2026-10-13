module.exports = {
	preset: "jest-expo",
	transformIgnorePatterns: [
		"node_modules/(?!(jest-)?react-native|@react-native(-community)?|expo(nent)?|expo-modules-core|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|react-native-purchases|react-native-purchases-ui|react-native-reanimated|react-native-qrcode-svg|zustand|@supabase/.*|date-fns|@react-native-async-storage/async-storage)",
	],
	moduleNameMapper: {
		"^@/(.*)$": "<rootDir>/$1",
		"^recapd-uploader$": "<rootDir>/jest/recapd-uploader-mock.ts",
	},
	moduleFileExtensions: ["ts", "tsx", "js", "jsx"],
	testMatch: ["**/__tests__/**/*.test.{ts,tsx}", "**/*.test.{ts,tsx}"],
	testPathIgnorePatterns: ["/node_modules/", "/.claude/", "/web/"],
};
