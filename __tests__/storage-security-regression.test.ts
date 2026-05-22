import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const storageSql = fs.readFileSync(path.join(repoRoot, "supabase/storage.sql"), "utf8");
const storageSource = fs.readFileSync(path.join(repoRoot, "lib/storage.ts"), "utf8");

describe("storage security regression", () => {
	it("keeps event and thumbnail buckets private", () => {
		expect(storageSql).toMatch(/'event-photos',\s*'event-photos',\s*false/);
		expect(storageSql).toMatch(/'thumbnails',\s*'thumbnails',\s*false/);
		expect(storageSql).not.toMatch(/'event-photos',\s*'event-photos',\s*true/);
		expect(storageSql).not.toMatch(/'thumbnails',\s*'thumbnails',\s*true/);
	});

	it("restricts storage reads to event participants", () => {
		expect(storageSql).toMatch(
			/CREATE POLICY "Participants can read event photos"[\s\S]*ON storage\.objects FOR SELECT[\s\S]*bucket_id = 'event-photos'[\s\S]*ep\.user_id = public\.current_user_profile_id\(\)/m
		);
		expect(storageSql).toMatch(
			/CREATE POLICY "Participants can read thumbnails"[\s\S]*ON storage\.objects FOR SELECT[\s\S]*bucket_id = 'thumbnails'[\s\S]*ep\.user_id = public\.current_user_profile_id\(\)/m
		);
		expect(storageSql).not.toContain('CREATE POLICY "Anyone can view event photos"');
		expect(storageSql).not.toContain('CREATE POLICY "Anyone can view thumbnails"');
	});

	it("uses signed URLs in the client instead of public URLs", () => {
		expect(storageSource).toContain(
			".createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS, options)"
		);
		expect(storageSource).not.toContain(".getPublicUrl(");
	});
});
