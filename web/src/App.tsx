import { Route, Routes } from "react-router-dom";
import Home from "./pages/Home";
import Privacy from "./pages/Privacy";
import Support from "./pages/Support";
import Terms from "./pages/Terms";

export default function App() {
	return (
		<Routes>
			<Route path="/" element={<Home />} />
			<Route path="/privacy" element={<Privacy />} />
			<Route path="/support" element={<Support />} />
			<Route path="/terms" element={<Terms />} />
		</Routes>
	);
}
