# Notarize Audio TTS macOS App

> **Team**: `CY8MDF5N35` (Loki Wong)

## Prerequisites

- Apple Developer account with a **Developer ID Application** certificate installed in your keychain
- An App Store Connect API key or app-specific password stored as a notarytool keychain profile
- The profile used is `WONG_LOK_PROFILE`

```bash
# Verify cert exists
security find-identity -v -p codesigning | grep "Developer ID Application"

# Verify notary profile works
xcrun notarytool history --keychain-profile "WONG_LOK_PROFILE"
```

## Step-by-Step

### 1. Build the app

```bash
bun run build
```

The build outputs to `build/dev-macos-arm64/Audio TTS-dev.app` (the Electrobun config has `codesign: false` and `notarize: false`, so the app is ad-hoc signed only — we handle signing manually below).

### 2. Create/verify entitlements file

Create `build/dev-macos-arm64/entitlements.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <key>com.apple.security.cs.disable-library-validation</key>
    <true/>
    <key>com.apple.security.network.client</key>
    <true/>
</dict>
</plist>
```

**Why these entitlements:**

- `allow-jit` + `allow-unsigned-executable-memory` — Bun (JavaScript runtime) requires JIT compilation
- `disable-library-validation` — the app loads custom dylibs (`libasar.dylib`, `libNativeWrapper.dylib`) and ships a Python venv with native `.so` modules (MLX, numpy, PIL, etc.)
- `network.client` — the app makes network requests (TTS model downloads, etc.)

### 3. Clean and sign

```bash
APP="build/dev-macos-arm64/Audio TTS-dev.app"
ENTITLEMENTS="build/dev-macos-arm64/entitlements.plist"
IDENTITY="Developer ID Application: Loki Wong (CY8MDF5N35)"

# Remove extended attributes (prevents signing issues)
xattr -cr "$APP"

# Sign dylibs first (order matters — sign from leaf to root)
codesign --force --options runtime --timestamp --sign "$IDENTITY" \
  "$APP/Contents/MacOS/libasar.dylib"
codesign --force --options runtime --timestamp --sign "$IDENTITY" \
  "$APP/Contents/MacOS/libNativeWrapper.dylib"

# Sign helper executables (bun needs entitlements for JIT)
codesign --force --options runtime --timestamp --sign "$IDENTITY" \
  --entitlements "$ENTITLEMENTS" "$APP/Contents/MacOS/bun"
codesign --force --options runtime --timestamp --sign "$IDENTITY" \
  "$APP/Contents/MacOS/zig-zstd"
codesign --force --options runtime --timestamp --sign "$IDENTITY" \
  "$APP/Contents/MacOS/bspatch"

# Sign main executable with entitlements
codesign --force --options runtime --timestamp --sign "$IDENTITY" \
  --entitlements "$ENTITLEMENTS" "$APP/Contents/MacOS/launcher"

# Sign ALL Mach-O binaries in the Python venv
# The app bundles a full Python 3.11 venv (ltx-2-mlx) with ~60 native .so/.dylib files
find "$APP/Contents/Resources" -type f \( -name "*.dylib" -o -name "*.so" -o -perm +111 \) \
  ! -path "*/MacOS/*" \
  -exec file {} \; 2>/dev/null | grep "Mach-O" | cut -d: -f1 | while read -r BIN; do
    codesign --force --options runtime --timestamp --sign "$IDENTITY" \
      --entitlements "$ENTITLEMENTS" "$BIN"
done

# Re-sign the app bundle (seals all nested signatures)
codesign --force --options runtime --timestamp --sign "$IDENTITY" \
  --entitlements "$ENTITLEMENTS" "$APP"

# Verify
codesign -dvvv "$APP" | grep -E "Authority|TeamIdentifier|Runtime|flags"
```

**Key `codesign` flags:**

- `--options runtime` — enables Hardened Runtime (required for notarization)
- `--timestamp` — includes a secure timestamp (required for notarization)
- `--force` — replaces any existing signature
- `--entitlements` — embeds the entitlements in the signature

### 4. Package and submit for notarization

```bash
APP="build/dev-macos-arm64/Audio TTS-dev.app"
ZIP="build/dev-macos-arm64/Audio TTS-dev.zip"

# Remove old zip if present
rm -f "$ZIP"

# Create zip with ditto (preserves symlinks and resource forks correctly)
ditto -c -k --keepParent "$APP" "$ZIP"

# Submit and wait for result
xcrun notarytool submit "$ZIP" \
  --keychain-profile "WONG_LOK_PROFILE" \
  --wait

# If it fails, get the detailed log:
# xcrun notarytool log <submission-id> --keychain-profile "WONG_LOK_PROFILE"
```

### 5. Staple the notarization ticket

```bash
APP="build/dev-macos-arm64/Audio TTS-dev.app"

xcrun stapler staple "$APP"
xcrun stapler validate "$APP"
spctl --assess --verbose "$APP"
```

Expected output:

```
The staple and validate action worked!
The validate action worked!
Audio TTS-dev.app: accepted
source=Notarized Developer ID
```

## Troubleshooting

| Issue                                                            | Fix                                                                                        |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| "The binary is not signed with a valid Developer ID certificate" | Sign the binary with the Developer ID identity and `--options runtime --timestamp`         |
| "The signature does not include a secure timestamp"              | Add `--timestamp` to the `codesign` command                                                |
| "The executable does not have the hardened runtime enabled"      | Add `--options runtime` to the `codesign` command                                          |
| "TeamIdentifier=not set"                                         | Use the Developer ID certificate (not the Apple Development one)                           |
| Python `.so` files still unsigned                                | Run the `find ... -exec file ... \| grep Mach-O` pipeline to sign every binary in the venv |

## Key identities and profiles

| Purpose                    | Value                                              |
| -------------------------- | -------------------------------------------------- |
| Signing identity           | `Developer ID Application: Loki Wong (CY8MDF5N35)` |
| Apple Development identity | `Apple Development: Loki Wong (GJH63YE9D7)`        |
| Team ID                    | `CY8MDF5N35`                                       |
| Notary keychain profile    | `WONG_LOK_PROFILE`                                 |
| Bundle ID                  | `sh.blackboard.audio-tts`                          |
| App name                   | `Audio TTS-dev` (dev)                              |

## Architecture notes

- The app is built with **Electrobun** (Bun-based Electron alternative)
- The Python venv is bundled at `Contents/Resources/app/python/ltx-2-mlx/.venv/`
- It includes MLX, numpy, PIL/Pillow, sentencepiece, safetensors, and other ML libraries — all ship native `.so`/`.dylib` files that must be signed
- The main binaries in `Contents/MacOS/` are: `launcher`, `bun`, `zig-zstd`, `bspatch`, `libasar.dylib`, `libNativeWrapper.dylib`
