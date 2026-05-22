const { withXcodeProject, withDangerousMod } = require("@expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

const STOREKIT_FILE_NAME = "Recapd.storekit";

function copyStoreKitFile(config) {
	return withDangerousMod(config, [
		"ios",
		(modConfig) => {
			const projectRoot = modConfig.modRequest.projectRoot;
			const platformProjectRoot = modConfig.modRequest.platformProjectRoot;
			const projectName = modConfig.modRequest.projectName;

			if (!projectName) {
				return modConfig;
			}

			const sourcePath = path.join(projectRoot, STOREKIT_FILE_NAME);
			if (!fs.existsSync(sourcePath)) {
				console.warn(`[withStoreKitConfiguration] Missing ${STOREKIT_FILE_NAME} at repo root`);
				return modConfig;
			}

			const targetDir = path.join(platformProjectRoot, projectName);
			fs.mkdirSync(targetDir, { recursive: true });

			const targetPath = path.join(targetDir, STOREKIT_FILE_NAME);
			fs.copyFileSync(sourcePath, targetPath);

			return modConfig;
		},
	]);
}

function patchScheme(config) {
	return withXcodeProject(config, async (modConfig) => {
		const projectName = modConfig.modRequest.projectName;
		const platformProjectRoot = modConfig.modRequest.platformProjectRoot;

		if (!projectName) {
			return modConfig;
		}

		const schemePath = path.join(
			platformProjectRoot,
			`${projectName}.xcodeproj`,
			"xcshareddata",
			"xcschemes",
			`${projectName}.xcscheme`
		);

		if (!fs.existsSync(schemePath)) {
			console.warn(`[withStoreKitConfiguration] Scheme not found at ${schemePath}`);
			return modConfig;
		}

		let schemeXml = fs.readFileSync(schemePath, "utf8");
		const referencePath = `../../${STOREKIT_FILE_NAME}`;
		const storeKitReference = `<StoreKitConfigurationFileReference\n         identifier = "${referencePath}">\n      </StoreKitConfigurationFileReference>`;

		if (schemeXml.includes("StoreKitConfigurationFileReference")) {
			schemeXml = schemeXml.replace(
				/<StoreKitConfigurationFileReference[^>]*>[\s\S]*?<\/StoreKitConfigurationFileReference>/,
				storeKitReference
			);
		} else {
			schemeXml = schemeXml.replace(
				/(<\/LaunchAction>)/,
				`   ${storeKitReference}\n   $1`
			);
		}

		fs.writeFileSync(schemePath, schemeXml, "utf8");

		return modConfig;
	});
}

module.exports = function withStoreKitConfiguration(config) {
	config = copyStoreKitFile(config);
	config = patchScheme(config);
	return config;
};
