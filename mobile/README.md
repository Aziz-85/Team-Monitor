# Dhahran Team Mobile

Mobile WebView app for the Dhahran Team web app. Configure your server URL (default: https://dhtasks.com) on first launch or via Settings.

## Requirements

- Node.js 18+
- npm
- **iOS:** Mac with Xcode and iOS Simulator, or a physical iPhone

## Install

```bash
cd mobile
npm install
```

## Run on iOS Simulator

1. Open a terminal in the `mobile` folder.

2. Run:
   ```bash
   npm run start
   ```
   This starts the Expo dev server.

3. In another terminal (same folder), run:
   ```bash
   npm run ios
   ```
   This runs `expo run:ios`, builds the app, and launches it in the default iOS Simulator. The first build can take several minutes.

4. In the app: the Server Setup screen is prefilled with **https://dhtasks.com**. Tap **Save & Open** to load the web app, or change the URL first (must start with `http://` or `https://`).

## Run on a Physical iPhone via Xcode

1. **Generate the native iOS project:**
   ```bash
   cd mobile
   npx expo prebuild --platform ios
   ```

2. **Connect your iPhone** with a USB cable and unlock it. If prompted on the device, tap “Trust this computer”.

3. **Open the project in Xcode:**
   ```bash
   open ios/mobile.xcworkspace
   ```
   Use the **.xcworkspace** file (not the .xcodeproj).

4. **Select your iPhone:**
   - In Xcode’s top toolbar, click the device dropdown (it may say “iPhone 16” or a simulator name).
   - Choose your connected **iPhone** from the list.

5. **Signing (required for device):**
   - In the left sidebar, click the **mobile** project (blue icon).
   - Select the **mobile** target under TARGETS.
   - Open the **Signing & Capabilities** tab.
   - Check **Automatically manage signing**.
   - Choose your **Team** (your Apple ID). If none appears, add your Apple ID in Xcode → Settings → Accounts.

6. **Build and run:**
   - Click the **Run** (Play) button or press **Cmd + R**.
   - Xcode will build and install the app on your iPhone.

7. **Trust the developer (first time only):**
   - On the iPhone, go to **Settings → General → VPN & Device Management**.
   - Under “Developer App”, tap your Apple ID and tap **Trust**.

8. Open the **Dhahran Team Mobile** app on the device. Use Server Setup to set the URL (default https://dhtasks.com), then tap **Save & Open**.

## Scripts

| Script   | Command         | Description                    |
|----------|-----------------|--------------------------------|
| `start`  | `expo start`    | Start Expo dev server          |
| `ios`    | `expo run:ios`  | Build and run on iOS simulator |

## Bundle identifier (iOS)

The app uses a fixed bundle ID so it doesn’t revert after prebuild:

- **Expo (A):** Set in `app.json`: `slug: "dhahran-team-mobile"` and `ios.bundleIdentifier: "com.abdulazizalnasser.dhahranteam.mobile"`.
- **Xcode (B):** After running `npx expo prebuild --platform ios`, the generated project uses this bundle ID. To confirm or change it: open the project in Xcode → select the **mobile** target → **Signing & Capabilities** → **Bundle Identifier**.

## App behavior

- **Server Setup:** First screen; URL input is prefilled with **https://dhtasks.com**. URL must start with `http://` or `https://`. Saved in AsyncStorage.
- **WebView:** Loads the saved URL with JavaScript and DOM storage enabled; `sharedCookiesEnabled` is true for login. Loading indicator is shown while the page loads.
- **Settings:** Tap **Settings** (top right) to change the server URL.
- **iOS HTTP:** ATS is configured (via expo-build-properties) to allow HTTP for local testing (e.g. `http://192.168.1.50:3000`). Use HTTPS in production.
