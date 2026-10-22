# Validation

## 2.1.0 wallpaper filters

- All 20 Node tests pass, including anonymous UCI sections, legacy encoded IDs, filter-only edits, clearing filters, provider switching and input validation.
- Chromium against actual OpenWrt 25.12.6, LuCI and the Argon 2.4.8 package: collection save/reload, Reset, required Unsplash key, optional Wallhaven key, tag validation, exact/minimum resolution, clearing filters and remembered filters pass.
- The existing browser regression also passes: upload, preview, duplicate/format rejection, delete/cancel, refresh, unsaved values, Reset, Save and Save & Apply.
- The actual Argon 2.4.8 wallpaper RPC generates the expected Unsplash collection and Wallhaven tag/key/resolution queries using real UCI and simulated HTTP responses. No live provider credentials were used; live image availability is not verified.
- Simplified Chinese covers all 59 current messages; all six translation catalogs compile.

The optional browser/provider checks are documented in [ONLINE_WALLPAPER.md](ONLINE_WALLPAPER.md). The standalone view remains hidden when the theme provides integrated settings.

## 2.0.0

Tested with the actual stable SDKs and root filesystems for OpenWrt 25.12.6 and 24.10.8.

| Check | Result |
| --- | --- |
| Node view behavior and ACL assertions | 9 tests passed |
| Real BusyBox, jshn and UCI | 18 RPC scenarios and configuration migrations passed on both versions |
| OpenWrt 25.12.6 SDK | Main APK and six translation APKs built |
| OpenWrt 24.10.8 SDK | Main IPK and six translation IPKs built |
| APK installation with Argon 2.4.8 | Passed |
| IPK installation with Argon 2.4.8 | Passed |
| APK installation alongside official Argon 3.0.0-r2 | Passed without file conflicts; custom primary color preserved |
| Upgrade from the original 1.0 APK | Both unchanged and modified configurations preserved; old app files removed |
| Browser against actual LuCI, including Argon 2.4.8 | Upload, PNG preview, duplicate rejection, invalid format, delete/cancel, refresh, unsaved values, Reset, Save and Save & Apply passed |
| Browser against Argon 3.0 | Integrated settings opened; standalone entry hidden; exactly one settings menu entry |
| Actual rpcd read-only session | Space query allowed; install/remove denied |
| Simplified Chinese catalog | All current strings translated |

The browser tests used Chromium and real HTTP uploads, RPC calls and UCI commits. The initial form tests also ran under the Bootstrap theme. Integration containers use the host kernel; physical router hardware, browser video codecs and online wallpaper providers were not covered.

The original repository's master branch at the start of this change was `3e099a37c3f71d0de677f1b6b0f4bffd57d91dac`. No separate DeepSeek changes were present in its published branches.
