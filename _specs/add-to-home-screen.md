# Feature Spec: Add to Home Screen Install Prompt

## Overview

The Warren dashboard is a Nuxt web app that today opens in a regular browser tab. Users on phones and tablets have no convenient way to launch it like a native app — they have to keep the tab open, or fish it out of bookmarks. This feature makes Warren installable on mobile devices so that visitors see an "Add to Home Screen" affordance and, once installed, get a standalone icon that opens the dashboard full-screen without browser chrome.

The scope is narrow: make the app installable and surface the install option clearly on phones. No offline behavior, no caching strategies, no service-worker-driven updates beyond what is needed for the device to recognize the site as installable.

## Goals

- A user visiting Warren on a phone or tablet can install it as a home-screen icon.
- An installed Warren launches in standalone (full-screen) mode with its own icon and name.
- On Android/Chrome and other browsers that support the install prompt, the user sees an in-app affordance to trigger install (not just the browser's hidden menu item).
- On iOS Safari (which has no programmatic install API), the user sees a short hint explaining how to use Safari's Share → Add to Home Screen flow.
- The desktop experience is unaffected for users who don't want to install — no nag, no modal that blocks the dashboard.

## Non-Goals

- Offline support or caching of API responses, MQTT data, sensor history, or camera streams. The installed app still requires a live network connection to the Warren server.
- Background sync, push notifications, or any other PWA capability beyond installability.
- Update banners, "new version available" toasts, or service-worker-driven update flows.
- A dedicated `/offline` page or fallback UI.
- Changing how authentication, sessions, or routing work.
- Adding install prompts on desktop browsers (the goal is phones; desktop installability is acceptable as a side effect but not a target).

## User Stories

- As a homeowner using Warren on my phone, I want to add the dashboard to my home screen so that I can open it with one tap like a native app, without hunting through browser tabs.
- As a homeowner using an iPhone, I want clear instructions for adding Warren to my home screen so that I'm not stuck wondering why there's no install button (since iOS Safari doesn't expose one).
- As a homeowner using an Android phone, I want a visible "Install" button inside Warren so that I don't have to know about the browser's three-dot menu.
- As a user who has already installed Warren, I don't want to keep seeing install prompts every time I open it.
- As a user opening the standalone Warren app, I want it to look like a real app — own icon, own name, no browser address bar.

## Functional Requirements

### Installability

- The app must satisfy the criteria browsers require to consider a site installable: a web app manifest with required fields (name, short name, start URL, display mode, theme color, background color, icon set), a registered service worker, and HTTPS (or localhost during development).
- The service worker must exist solely to make the app installable. It must not aggressively cache HTML, API responses, or assets in a way that would serve stale content or block live data updates.
- The app icons must include all sizes commonly required by mobile platforms (e.g. 192x192, 512x512, plus a maskable icon for Android adaptive icons and an Apple touch icon for iOS).
- The manifest's display mode must be standalone so the installed app launches without browser chrome.
- The manifest name and short name must reflect "Warren". The theme color must match the dashboard's surface color so the title bar/status bar feel consistent with the rest of the UI.

### In-App Install Affordance

- On browsers that fire the standard `beforeinstallprompt` event (Chrome on Android, Edge, etc.), the app must capture that event and present an in-app "Install" entry point that, when tapped, triggers the browser's native install prompt.
- The install affordance must be visible from the main dashboard layout — somewhere a user can find without scrolling — but unobtrusive (not a full-screen modal, not a blocking banner).
- After a successful install (the `appinstalled` event fires, or the prompt's outcome resolves to accepted), the in-app install affordance must disappear and not reappear on subsequent visits.
- If the user dismisses the native install prompt without installing, the affordance must remain available so they can try again later. There must be no aggressive re-prompting on the same visit.
- When the app is already running in standalone mode (i.e. it was launched from the home-screen icon), the install affordance must not be shown.

### iOS Hint

- On iOS Safari, where `beforeinstallprompt` does not exist, the app must instead show a small one-time hint explaining how to install via Safari's Share → Add to Home Screen menu.
- The hint must be dismissible and must not reappear once the user has dismissed it (persisted in local storage or similar client-side state).
- The hint must not be shown when the app is already running in standalone mode.

### Detection of Already-Installed State

- The app must detect whether it is running in standalone mode (via `display-mode: standalone` media query or the iOS-specific `navigator.standalone` flag) and use that to suppress install affordances.
- The app does not need to track installation state across browsers or devices — detection at runtime is sufficient.

### No Side Effects on Existing Behavior

- Authentication, session handling, MQTT live updates, sensor polling, and camera streaming must continue to work unchanged in both browser-tab and installed (standalone) modes.
- Hot module reloading and the dev server must remain usable. The service worker must not interfere with development.

## UI / UX

The install affordance lives inside the main app layout — most naturally in the user menu (next to logout) or as a small persistent button in the header. It should look like a normal menu item / button, not a banner, and should use the existing Tailwind theme (Catalyst patterns already in use). The label is something like "Install Warren" with a small download / mobile-icon glyph.

The iOS hint can be a small dismissible pill or card shown at the bottom of the screen on first visit (only if the user agent looks like iOS Safari and the app is not yet standalone). Copy: short, one or two lines, e.g. "Install on iPhone: tap the Share icon then Add to Home Screen." A close button dismisses it permanently.

When the app is launched standalone, neither the install button nor the hint appears, and the dashboard simply renders as it does today.

App icon and splash should match Warren's existing visual identity: the rabbit silhouette logo already in use for the favicon, sized appropriately and provided as a maskable variant for Android adaptive icons.

## Data Model

No database changes. No SQLite migrations. No InfluxDB schema changes. No new server tables.

A small amount of client-side state is persisted in `localStorage` (or equivalent) to remember whether the user has dismissed the iOS hint. Key naming should follow the existing `warren:` prefix convention (e.g. `warren:ios-hint-dismissed`).

## API

No new API endpoints. No changes to existing endpoints. No changes to the auth middleware allowlist.

The web app manifest and service worker are static assets served by the Nuxt app — they do not require backend logic.

## Acceptance Criteria

- [ ] On Android Chrome, visiting Warren shows an in-app install button. Tapping it opens the native install prompt. Accepting the prompt installs the app, after which the button disappears.
- [ ] After installation on Android, the home-screen icon launches Warren in standalone mode (no browser chrome) with the Warren icon and name.
- [ ] On iOS Safari, visiting Warren shows a small dismissible hint explaining the Share → Add to Home Screen flow.
- [ ] The iOS hint, once dismissed, does not reappear on subsequent visits in the same browser.
- [ ] Once Warren is launched from the iOS home screen (standalone), neither the install button nor the iOS hint appears.
- [ ] The web app manifest validates against browser devtools (Application → Manifest in Chrome shows no errors and lists all required icons).
- [ ] Lighthouse's PWA installability audit passes for the production build.
- [ ] All existing functionality — login, dashboard, room cards, sensor tiles, camera streams, light controls, MQTT live updates — continues to work in both browser-tab and standalone modes with no regressions.
- [ ] The dev server (`npm run dev`) is unaffected: HMR works, no stale-content issues, no service-worker interference during development.
- [ ] Production build (`npm run build`) succeeds and the resulting bundle serves the manifest, icons, and service worker correctly.

## Open Questions

- Where exactly should the install button live in the UI — inside the existing user menu next to logout, or as a separate header button? (Default assumption: inside the user menu, to keep the header uncluttered.)
- Should the iOS hint be shown only on the dashboard route, or on every page including login? (Default assumption: only after login, on the dashboard, to avoid distracting from the login flow.)
- Should the install affordance also appear on desktop browsers that fire `beforeinstallprompt` (Chrome/Edge desktop), or be limited to small viewports? (Default assumption: show wherever the browser fires the event — there is no harm in letting desktop users install too, even though the goal is mobile.)
- Which library or approach should be used to register the service worker and manage the manifest — a Nuxt-integrated PWA module, or a hand-rolled minimal service worker? (Implementation detail; deferred to the plan.)
