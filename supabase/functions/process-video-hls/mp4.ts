export interface VideoKeyframe {
	byteOffset: number;
	byteLength: number;
	timestampSeconds: number;
}

export interface VideoTrackInfo {
	durationSeconds: number;
	totalByteSize: number;
	keyframes: VideoKeyframe[];
}

interface BoxHeader {
	type: string;
	bodyStart: number;
	bodyLength: number;
	totalLength: number;
}

function readBoxHeader(view: DataView, offset: number, sourceOffset: number): BoxHeader | null {
	if (offset + 8 > view.byteLength) return null;
	let size = view.getUint32(offset);
	const type = String.fromCharCode(
		view.getUint8(offset + 4),
		view.getUint8(offset + 5),
		view.getUint8(offset + 6),
		view.getUint8(offset + 7)
	);
	let headerSize = 8;
	if (size === 1) {
		if (offset + 16 > view.byteLength) return null;
		const high = view.getUint32(offset + 8);
		const low = view.getUint32(offset + 12);
		size = high * 0x100000000 + low;
		headerSize = 16;
	}
	return {
		type,
		bodyStart: sourceOffset + offset + headerSize,
		bodyLength: size - headerSize,
		totalLength: size,
	};
}

function findChildBox(
	view: DataView,
	parentBodyStart: number,
	parentBodyLength: number,
	sourceOffset: number,
	targetType: string
): BoxHeader | null {
	const startInBuffer = parentBodyStart - sourceOffset;
	const endInBuffer = startInBuffer + parentBodyLength;
	let cursor = startInBuffer;
	while (cursor < endInBuffer) {
		const header = readBoxHeader(view, cursor, sourceOffset);
		if (!header) return null;
		if (header.type === targetType) return header;
		cursor += header.totalLength;
		if (header.totalLength <= 0) return null;
	}
	return null;
}

function findChildBoxes(
	view: DataView,
	parentBodyStart: number,
	parentBodyLength: number,
	sourceOffset: number,
	targetType: string
): BoxHeader[] {
	const results: BoxHeader[] = [];
	const startInBuffer = parentBodyStart - sourceOffset;
	const endInBuffer = startInBuffer + parentBodyLength;
	let cursor = startInBuffer;
	while (cursor < endInBuffer) {
		const header = readBoxHeader(view, cursor, sourceOffset);
		if (!header) break;
		if (header.type === targetType) results.push(header);
		cursor += header.totalLength;
		if (header.totalLength <= 0) break;
	}
	return results;
}

function parseHandlerType(view: DataView, bodyStart: number, sourceOffset: number): string {
	const offset = bodyStart - sourceOffset + 8;
	return String.fromCharCode(
		view.getUint8(offset),
		view.getUint8(offset + 1),
		view.getUint8(offset + 2),
		view.getUint8(offset + 3)
	);
}

function parseMdhd(
	view: DataView,
	bodyStart: number,
	sourceOffset: number
): { timescale: number; duration: number } {
	const offset = bodyStart - sourceOffset;
	const version = view.getUint8(offset);
	if (version === 1) {
		const timescale = view.getUint32(offset + 20);
		const high = view.getUint32(offset + 24);
		const low = view.getUint32(offset + 28);
		return { timescale, duration: high * 0x100000000 + low };
	}
	const timescale = view.getUint32(offset + 12);
	const duration = view.getUint32(offset + 16);
	return { timescale, duration };
}

function parseStss(view: DataView, bodyStart: number, sourceOffset: number): number[] {
	const offset = bodyStart - sourceOffset;
	const count = view.getUint32(offset + 4);
	const samples = new Array<number>(count);
	for (let i = 0; i < count; i++) {
		samples[i] = view.getUint32(offset + 8 + i * 4);
	}
	return samples;
}

function parseStco(
	view: DataView,
	bodyStart: number,
	sourceOffset: number,
	is64: boolean
): number[] {
	const offset = bodyStart - sourceOffset;
	const count = view.getUint32(offset + 4);
	const offsets = new Array<number>(count);
	const entrySize = is64 ? 8 : 4;
	const base = offset + 8;
	for (let i = 0; i < count; i++) {
		if (is64) {
			const high = view.getUint32(base + i * entrySize);
			const low = view.getUint32(base + i * entrySize + 4);
			offsets[i] = high * 0x100000000 + low;
		} else {
			offsets[i] = view.getUint32(base + i * entrySize);
		}
	}
	return offsets;
}

interface StscEntry {
	firstChunk: number;
	samplesPerChunk: number;
}

function parseStsc(view: DataView, bodyStart: number, sourceOffset: number): StscEntry[] {
	const offset = bodyStart - sourceOffset;
	const count = view.getUint32(offset + 4);
	const entries = new Array<StscEntry>(count);
	for (let i = 0; i < count; i++) {
		const base = offset + 8 + i * 12;
		entries[i] = {
			firstChunk: view.getUint32(base),
			samplesPerChunk: view.getUint32(base + 4),
		};
	}
	return entries;
}

function parseStsz(view: DataView, bodyStart: number, sourceOffset: number): number[] {
	const offset = bodyStart - sourceOffset;
	const constantSize = view.getUint32(offset + 4);
	const count = view.getUint32(offset + 8);
	if (constantSize !== 0) {
		return new Array<number>(count).fill(constantSize);
	}
	const sizes = new Array<number>(count);
	for (let i = 0; i < count; i++) {
		sizes[i] = view.getUint32(offset + 12 + i * 4);
	}
	return sizes;
}

interface SttsEntry {
	sampleCount: number;
	sampleDelta: number;
}

function parseStts(view: DataView, bodyStart: number, sourceOffset: number): SttsEntry[] {
	const offset = bodyStart - sourceOffset;
	const count = view.getUint32(offset + 4);
	const entries = new Array<SttsEntry>(count);
	for (let i = 0; i < count; i++) {
		const base = offset + 8 + i * 8;
		entries[i] = {
			sampleCount: view.getUint32(base),
			sampleDelta: view.getUint32(base + 4),
		};
	}
	return entries;
}

function sampleNumberToTime(sampleNumber: number, stts: SttsEntry[]): number {
	let remaining = sampleNumber - 1;
	let elapsed = 0;
	for (const entry of stts) {
		if (remaining < entry.sampleCount) {
			return elapsed + remaining * entry.sampleDelta;
		}
		remaining -= entry.sampleCount;
		elapsed += entry.sampleCount * entry.sampleDelta;
	}
	return elapsed;
}

function sampleNumberToChunk(
	sampleNumber: number,
	stsc: StscEntry[],
	totalChunks: number
): { chunkIndex: number; samplesBefore: number } {
	let chunkIndex = 1;
	let samplesSeen = 0;
	for (let i = 0; i < stsc.length; i++) {
		const entry = stsc[i];
		const next = i + 1 < stsc.length ? stsc[i + 1].firstChunk : totalChunks + 1;
		const chunkRange = next - entry.firstChunk;
		const samplesInRange = chunkRange * entry.samplesPerChunk;
		if (sampleNumber <= samplesSeen + samplesInRange) {
			const offsetIntoRange = sampleNumber - samplesSeen - 1;
			chunkIndex = entry.firstChunk + Math.floor(offsetIntoRange / entry.samplesPerChunk);
			const samplesBefore = samplesSeen + (chunkIndex - entry.firstChunk) * entry.samplesPerChunk;
			return { chunkIndex, samplesBefore };
		}
		samplesSeen += samplesInRange;
		chunkIndex = next;
	}
	return { chunkIndex: 1, samplesBefore: 0 };
}

export function parseVideoTrack(buffer: ArrayBuffer, sourceOffset = 0): VideoTrackInfo | null {
	const view = new DataView(buffer);

	let cursor = 0;
	let moov: BoxHeader | null = null;
	while (cursor < view.byteLength) {
		const header = readBoxHeader(view, cursor, sourceOffset);
		if (!header) break;
		if (header.type === "moov") {
			moov = header;
			break;
		}
		cursor += header.totalLength;
		if (header.totalLength <= 0) break;
	}
	if (!moov) return null;

	const traks = findChildBoxes(view, moov.bodyStart, moov.bodyLength, sourceOffset, "trak");
	if (traks.length === 0) return null;

	for (const trak of traks) {
		const mdia = findChildBox(view, trak.bodyStart, trak.bodyLength, sourceOffset, "mdia");
		if (!mdia) continue;
		const hdlr = findChildBox(view, mdia.bodyStart, mdia.bodyLength, sourceOffset, "hdlr");
		if (!hdlr) continue;
		const handlerType = parseHandlerType(view, hdlr.bodyStart, sourceOffset);
		if (handlerType !== "vide") continue;

		const mdhd = findChildBox(view, mdia.bodyStart, mdia.bodyLength, sourceOffset, "mdhd");
		if (!mdhd) return null;
		const { timescale, duration } = parseMdhd(view, mdhd.bodyStart, sourceOffset);

		const minf = findChildBox(view, mdia.bodyStart, mdia.bodyLength, sourceOffset, "minf");
		if (!minf) return null;
		const stbl = findChildBox(view, minf.bodyStart, minf.bodyLength, sourceOffset, "stbl");
		if (!stbl) return null;

		const stss = findChildBox(view, stbl.bodyStart, stbl.bodyLength, sourceOffset, "stss");
		const stco = findChildBox(view, stbl.bodyStart, stbl.bodyLength, sourceOffset, "stco");
		const co64 = findChildBox(view, stbl.bodyStart, stbl.bodyLength, sourceOffset, "co64");
		const stsc = findChildBox(view, stbl.bodyStart, stbl.bodyLength, sourceOffset, "stsc");
		const stsz = findChildBox(view, stbl.bodyStart, stbl.bodyLength, sourceOffset, "stsz");
		const stts = findChildBox(view, stbl.bodyStart, stbl.bodyLength, sourceOffset, "stts");
		if (!(stco || co64) || !stsc || !stsz || !stts) return null;

		const chunkOffsets = stco
			? parseStco(view, stco.bodyStart, sourceOffset, false)
			: parseStco(view, co64!.bodyStart, sourceOffset, true);
		const stscEntries = parseStsc(view, stsc.bodyStart, sourceOffset);
		const sampleSizes = parseStsz(view, stsz.bodyStart, sourceOffset);
		const sttsEntries = parseStts(view, stts.bodyStart, sourceOffset);
		const syncSamples = stss
			? parseStss(view, stss.bodyStart, sourceOffset)
			: sampleSizes.map((_, i) => i + 1);

		const totalChunks = chunkOffsets.length;
		const totalSamples = sampleSizes.length;
		const totalByteSize = sampleSizes.reduce((sum, n) => sum + n, 0);
		const durationSeconds = duration / timescale;

		const keyframes: VideoKeyframe[] = [];
		for (let k = 0; k < syncSamples.length; k++) {
			const sampleNumber = syncSamples[k];
			if (sampleNumber < 1 || sampleNumber > totalSamples) continue;
			const { chunkIndex, samplesBefore } = sampleNumberToChunk(
				sampleNumber,
				stscEntries,
				totalChunks
			);
			let offset = chunkOffsets[chunkIndex - 1];
			for (let s = samplesBefore + 1; s < sampleNumber; s++) {
				offset += sampleSizes[s - 1];
			}
			const sampleSize = sampleSizes[sampleNumber - 1];
			const nextSampleNumber =
				k + 1 < syncSamples.length ? syncSamples[k + 1] : totalSamples + 1;

			let segmentSize = sampleSize;
			let currentOffset = offset + sampleSize;
			let currentChunk = chunkIndex;
			let inChunkPos = sampleNumber - samplesBefore;

			let inChunkLimit = 0;
			for (let i = 0; i < stscEntries.length; i++) {
				const entry = stscEntries[i];
				const next = i + 1 < stscEntries.length ? stscEntries[i + 1].firstChunk : totalChunks + 1;
				if (chunkIndex >= entry.firstChunk && chunkIndex < next) {
					inChunkLimit = entry.samplesPerChunk;
					break;
				}
			}

			for (let s = sampleNumber + 1; s < nextSampleNumber; s++) {
				if (inChunkPos >= inChunkLimit) {
					currentChunk += 1;
					if (currentChunk > totalChunks) break;
					currentOffset = chunkOffsets[currentChunk - 1];
					inChunkPos = 0;
					for (let i = 0; i < stscEntries.length; i++) {
						const entry = stscEntries[i];
						const next =
							i + 1 < stscEntries.length ? stscEntries[i + 1].firstChunk : totalChunks + 1;
						if (currentChunk >= entry.firstChunk && currentChunk < next) {
							inChunkLimit = entry.samplesPerChunk;
							break;
						}
					}
				}
				segmentSize += sampleSizes[s - 1];
				currentOffset += sampleSizes[s - 1];
				inChunkPos += 1;
			}

			keyframes.push({
				byteOffset: offset,
				byteLength: segmentSize,
				timestampSeconds: sampleNumberToTime(sampleNumber, sttsEntries) / timescale,
			});
		}

		return {
			durationSeconds,
			totalByteSize,
			keyframes,
		};
	}
	return null;
}
