# Dhahran Team — Mobile Native

Expo React Native app for the Dhahran Team backend. Uses Expo Router, TypeScript, and JWT auth against the mobile API.

## Tech stack

- **Expo SDK** (latest) with **Expo Router**
- **TypeScript**
- **axios** — API client with token refresh
- **expo-secure-store** — access/refresh tokens
- **@react-native-async-storage/async-storage** — server base URL
- **@tanstack/react-query** — API state and cache (e.g. `/me`)
- **expo-sqlite** — local DB (tasks, schedule, targets, outbox) for future offline/sync

## Beginner: run on iOS device

1. **Install dependencies**
   ```bash
   cd mobile-native
   npm install
   ```

2. **Generate native iOS project**
   ```bash
   npx expo prebuild --platform ios
   ```

3. **Run on device or simulator**
   ```bash
   npx expo run:ios
   ```
   - For a **simulator**: pick an iPhone from the list (or use the default).
   - For a **physical iPhone**: connect via USB, select the device in Xcode or when prompted, and ensure signing is set (e.g. Automatically manage signing + your Team).

4. **First launch**
   - Default server URL is **https://dhtasks.com**. Change it in **Settings** if needed.
   - Sign in with your **Employee ID** and **password**.

## Scripts

| Command            | Description              |
|--------------------|--------------------------|
| `npm start`        | Start Expo dev server    |
| `npm run ios`      | Run on iOS               |
| `npm run android`  | Run on Android           |
| `npm run web`      | Run in web browser       |

## Features

- **Server URL**: Stored in AsyncStorage (`serverBaseUrl`). Default `https://dhtasks.com`. Editable in **Settings**.
- **Auth**: Login with empId + password → JWT access + refresh tokens in SecureStore. After login, `/api/mobile/me` is cached (react-query).
- **Token refresh**: Axios interceptor on 401 calls `/api/mobile/auth/refresh`, saves new tokens, retries the request once.
- **Role-based tabs**: EMPLOYEE (Home, Tasks, Schedule, Targets), ASSISTANT_MANAGER (+ Team), MANAGER (Home, Team, Targets, Reports), ADMIN (Home, Boutiques, Users, Reports, Control). Settings and Log out available to all.
- **Offline scaffolding**: SQLite DB with tables `tasks`, `schedule`, `targets`, `outbox`. Helpers in `lib/sqlite.ts`. Full sync not implemented yet.

## Project structure

- `app/` — Expo Router: `index` (auth gate), `login`, `(tabs)` (role-based).
- `app/(tabs)/` — Tab screens: Home, Team, Tasks, Schedule, Targets, Reports, Boutiques, Users, Control, Settings.
- `lib/` — `api.ts` (axios + refresh), `authStore.ts`, `serverUrl.ts`, `sqlite.ts`, `roleTabs.ts`, `jwt` (not used client-side).
- `contexts/` — `AuthContext` (hasToken / setHasToken).
- `hooks/` — `useMe` (react-query for `/me`).
- `components/` — Card, StatCard, PrimaryButton; theme in `constants/theme.ts`.
