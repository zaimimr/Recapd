import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { clearChunkReloadFlag } from "./chunkReload";
import ChunkReloadBoundary from "./components/ChunkReloadBoundary";
import { occasions } from "./occasions";
import Home from "./pages/Home";
import Occasion from "./pages/Occasion";
import Privacy from "./pages/Privacy";
import Support from "./pages/Support";
import Terms from "./pages/Terms";

const GuestApp = lazy(() =>
	import("./guest/GuestApp").then((module) => {
		clearChunkReloadFlag();
		return module;
	})
);

export default function App() {
	return (
		<Routes>
			<Route path="/" element={<Home />} />
			<Route path="/privacy" element={<Privacy />} />
			<Route path="/support" element={<Support />} />
			<Route path="/terms" element={<Terms />} />
			{occasions.map((occasion) => (
				<Route
					key={occasion.slug}
					path={`/${occasion.slug}`}
					element={<Occasion occasion={occasion} />}
				/>
			))}
			<Route
				path="/join/:code"
				element={
					<ChunkReloadBoundary>
						<Suspense fallback={<div style={{ minHeight: "100vh", background: "#0b0b12" }} />}>
							<GuestApp />
						</Suspense>
					</ChunkReloadBoundary>
				}
			/>
		</Routes>
	);
}
