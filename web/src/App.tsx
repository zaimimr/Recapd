import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import Home from "./pages/Home";
import Privacy from "./pages/Privacy";
import Support from "./pages/Support";
import Terms from "./pages/Terms";

const GuestApp = lazy(() => import("./guest/GuestApp"));

export default function App() {
	return (
		<Routes>
			<Route path="/" element={<Home />} />
			<Route path="/privacy" element={<Privacy />} />
			<Route path="/support" element={<Support />} />
			<Route path="/terms" element={<Terms />} />
			<Route
				path="/join/:code"
				element={
					<Suspense fallback={<div style={{ minHeight: "100vh", background: "#0b0b12" }} />}>
						<GuestApp />
					</Suspense>
				}
			/>
		</Routes>
	);
}
