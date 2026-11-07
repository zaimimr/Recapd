import { Analytics } from "@vercel/analytics/react";
import posthog from "posthog-js";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

posthog.init("phc_D8c5745dsWj3iDsNj8M56fho7B2RiYERTRLBEGv4UyL9", {
	api_host: "https://eu.i.posthog.com",
	capture_pageview: "history_change",
	person_profiles: "identified_only",
});

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<BrowserRouter>
			<App />
			<Analytics />
		</BrowserRouter>
	</StrictMode>
);
