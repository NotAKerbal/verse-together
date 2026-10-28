# Verse Together desktop

The desktop target uses Tauri 2: Rust owns the window, local server lifecycle and bundled chapter index.
It renders the **same Next.js application**, including the same CSS, components, fonts, routing and server
endpoints. There is no separate desktop design to drift from the website. OS window decorations and system
webview text rendering can differ; pixel parity needs verification on each supported OS.

This is a first desktop implementation, not a release-ready authenticated client. Startup time, memory,
chapter latency and visual parity have not yet been measured in a native window. Rust does not automatically
make React rendering or remote services faster.

## Develop

Install Node 24+, the stable Rust toolchain, and the [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/).
On Ubuntu these include a C/C++ toolchain, pkg-config, GTK and WebKitGTK 4.1 development packages. Then:

```sh
npm ci
npm run desktop:dev
```

The CLI starts the existing Next webpack development server at `http://127.0.0.1:47831`, then opens the Rust
window. This fixed origin is also used in packaged builds, so web storage and cookies survive restarts.
Another process occupying that port must be closed before launching the packaged app; it fails rather than
opening an unrelated local service. Only one packaged instance can run at a time.

## Package on the target OS

```sh
npm run test:desktop
npm run test:browse
npm run desktop:build
```

`desktop:build` first builds Next with standalone output, assembles `.desktop/server` with static assets,
public scripture files and CFM content, and copies the build machine's Node executable into `.desktop/runtime`.
Tauri then produces native bundles under `src-tauri/target/release/bundle`. End users do not need Node installed.
Build on each target OS/architecture; the copied runtime is for the build host, so cross-compiling this
package is not supported. Platform signing/notarization, macOS nested Node signing, Windows installer icons
and automatic updates still need release configuration before distribution. Linux bundles require a Node
binary compatible with the target distribution; the system webview and a bundled Node server still consume
memory and must be profiled.

`npm run desktop:prepare` prepares the local server without building Rust. Regular `npm run build` keeps its
normal web output. Do not run web and desktop builds concurrently: they share `.next`.

## Native data and security

`src-tauri/src/scriptures.rs` embeds the five existing scripture JSON bundles and uses the generated web
catalog for chapter reference labels. Each volume is indexed on first access, off the UI thread. Subsequent
reads use the Rust index. The client chapter loader tries this read-only native command before the existing
browser and HTTP fallbacks. Translation overlays retain the existing web behavior. The Rust tests compare
all bundled verses/counts against the source dataset and test missing/invalid requests:

```sh
npm run desktop:prepare # supplies the resources referenced by the Tauri build script
cargo test --manifest-path src-tauri/Cargo.toml
```

The IPC permission is restricted to the main window at the exact loopback origin; it grants no arbitrary
file, process or shell access. External HTTP(S) links open in the system browser, and external navigation
cannot replace the privileged main page. The bundled server binds only to loopback, reports readiness
before the window opens, logs to the Tauri application log directory, and is killed and reaped on normal exit
or startup failure. Abrupt OS termination is not yet covered by a process watchdog.

The packaging script filters traced `.env*`, `.pem` and `.key` files. The server starts with a limited
environment, without inheriting deployment credentials. Never put private values in `NEXT_PUBLIC_*`; those
are compiled into the client. Secret-dependent routes (for example fresh AI generation) require a hosted,
authenticated service design before production desktop use. Do not distribute server API keys in this app.

## Authentication and remaining verification

The existing Google/Better Auth flow was designed for the website. Desktop authentication needs a system
browser handoff and a validated return flow to establish the desktop session; it is **not implemented** by
opening the provider externally. The Convex trusted-origin configuration currently also needs to explicitly
accept the desktop loopback origin. Do not change production trusted origins without a reviewed desktop
sign-in design. Without a session, account features such as note sync are unavailable.

Public Convex URL/site settings can be supplied at build time just as for web builds. Scripture reading is
local, while social features, remote translations, dictionary resources and sync still need internet access.
Verify the installed bundle, restart/storage retention, occupied port behavior, clean process shutdown,
light/dark themes, reader/search/notes/CFM flows, external links, authentication, and matching screenshots
at equal viewport sizes on every release platform. Do not claim an exact visual match or speedup until those
checks and comparative measurements pass.

## Verification in the implementation environment

Checked on Ubuntu 24.04 x86_64, Node 24.21.0, against the working-tree changes based on `d973319`:

- **Passed:** `npm run test:desktop` (5 tests), `npm run test:browse` (35 tests), `npx tsc --noEmit`,
  changed-file ESLint and `git diff --check`.
- **Passed:** `npm run desktop:prepare` built all Next routes and assembled a 243 MiB payload including Node.
  A process launched from that payload with the restricted production environment returned HTTP 200 for
  `/desktop-ready.txt`, `/browse`, `/browse/bookofmormon/1nephi/1` and the LDS chapter API. The API returned
  `1 Nephi 1` with 20 verses. No `.env*` files were present in the payload. The test process was stopped.
- **Blocked:** `npm run desktop:build -- --no-bundle` failed at `cargo metadata` because Cargo is absent.
  `npx tauri info` also reports missing rustc, WebKitGTK 4.1 and librsvg. Rust tests cannot run on this host.
- **Not run:** native window/IPC, visual comparison, desktop sign-in, OS installers, performance comparison.
  The web build also reports missing Convex configuration, so authenticated services were not exercised.
