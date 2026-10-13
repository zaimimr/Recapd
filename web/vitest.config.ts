import { defineConfig } from "vitest/config";

export default defineConfig({
	esbuild: { jsx: "automatic" },
	test: { include: ["kit/**/*.spec.{ts,tsx}", "src/**/*.spec.{ts,tsx}"], environment: "node" },
});
