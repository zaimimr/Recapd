import { Component, type ReactNode } from "react";
import {
	hasReloadedForChunk,
	markReloadedForChunk,
	shouldReloadForChunkError,
} from "../chunkReload";

type Props = { children: ReactNode };
type State = { failed: boolean; reloading: boolean };

export default class ChunkReloadBoundary extends Component<Props, State> {
	state: State = { failed: false, reloading: false };

	static getDerivedStateFromError(error: unknown): Partial<State> {
		return shouldReloadForChunkError(error, hasReloadedForChunk())
			? { reloading: true }
			: { failed: true };
	}

	componentDidUpdate() {
		if (this.state.reloading) {
			markReloadedForChunk();
			window.location.reload();
		}
	}

	render() {
		if (this.state.reloading) {
			return <div style={{ minHeight: "100vh", background: "#0b0b12" }} />;
		}
		if (this.state.failed) {
			return (
				<div
					style={{
						minHeight: "100vh",
						background: "#0b0b12",
						color: "#ffffff",
						display: "grid",
						placeItems: "center",
						padding: "24px 16px",
						textAlign: "center",
					}}
				>
					<div>
						<p style={{ marginBottom: 16 }}>Something went wrong loading this page.</p>
						<button
							type="button"
							onClick={() => window.location.reload()}
							style={{
								padding: "12px 24px",
								borderRadius: 999,
								border: 0,
								background: "#ff2d8e",
								color: "#ffffff",
								fontSize: 16,
								fontWeight: 600,
							}}
						>
							Reload
						</button>
					</div>
				</div>
			);
		}
		return this.props.children;
	}
}
