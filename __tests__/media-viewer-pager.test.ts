import { getMediaPageState } from "@/components/MediaViewerPager";

describe("getMediaPageState", () => {
	it("marks exactly one page active", () => {
		const total = 6;
		const activeIndex = 3;
		const activePages = Array.from({ length: total }, (_, index) =>
			getMediaPageState(index, activeIndex).isActive
		).filter(Boolean);
		expect(activePages).toHaveLength(1);
	});

	it("treats only the active page and its immediate neighbors as heavy", () => {
		const total = 8;
		const activeIndex = 4;
		const heavyIndexes = Array.from({ length: total }, (_, index) => index).filter(
			(index) => getMediaPageState(index, activeIndex).isNeighbor
		);
		expect(heavyIndexes).toEqual([3, 4, 5]);
	});

	it("keeps far pages out of the heavy window", () => {
		const state = getMediaPageState(0, 10);
		expect(state.isActive).toBe(false);
		expect(state.isNeighbor).toBe(false);
	});

	it("handles edges without expanding the window", () => {
		const heavyAtStart = [0, 1, 2, 3].filter((index) => getMediaPageState(index, 0).isNeighbor);
		expect(heavyAtStart).toEqual([0, 1]);
	});
});
