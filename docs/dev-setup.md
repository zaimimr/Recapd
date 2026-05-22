# Dev setup

## StoreKit simulator config

The Free to Pro purchase flow can be tested on the iOS simulator without hitting App Store Connect by using the local StoreKit configuration file.

The repo ships `Recapd.storekit` at the root. A config plugin (`plugins/withStoreKitConfiguration.js`) copies the file into the generated iOS project on prebuild and wires it into the shared Xcode scheme via `StoreKitConfigurationFileReference`.

### Automatic (recommended)

```bash
npx expo prebuild --clean
npm run ios
```

The plugin handles three things during prebuild:

- Copies `Recapd.storekit` into `ios/Recapd/Recapd.storekit`
- Injects `StoreKitConfigurationFileReference` into `ios/Recapd.xcodeproj/xcshareddata/xcschemes/Recapd.xcscheme`
- Skips silently if the file or scheme is missing (warns to console)

### Manual fallback (Xcode)

If you have the native `ios/` directory already and do not want to re-prebuild:

1. Open `ios/Recapd.xcworkspace` in Xcode.
2. Drag `Recapd.storekit` from the repo root into the `Recapd` group. Choose "Create folder references" and add to target `Recapd`.
3. Edit the `Recapd` scheme. Run -> Options tab -> set "StoreKit Configuration" to `Recapd.storekit`.
4. Build and run on the simulator. The paywall now shows local prices and purchases are simulated.

### Verifying

- Tap any "Upgrade to Pro" entry point (paywall opens via RevenueCat UI).
- The two subscriptions `recapd_pro_monthly` ($4.99) and `recapd_pro_yearly` ($39.99) should appear with the displayPrice values from `Recapd.storekit`.
- A purchase in the simulator should switch `useIsPro()` to `true` and unlock 5 minute video uploads.

### Notes

- The per-event consumable SKU `recapd_event_pro` is configured in RevenueCat dashboard but is not yet in App Store Connect. Add it there when the per-event purchase flow ships.
- Production builds ignore the local file. App Store Connect is always the source of truth in TestFlight and App Store releases.
