Hold My Brief ${VERSION}. A reader that holds.

> **Renamed:** Hold My Brief is the new name of the app previously called **Float Reader**. This build installs alongside any Float Reader install (it does not upgrade it in place) and uses a new application-data folder (`xyz.rpayton.holdmybrief`); reading positions and the library saved by Float Reader under `io.github.rvynp.floatreader` are not migrated — re-open your documents to start fresh.

## Download

| Your computer | File |
| --- | --- |
| Windows 10 or 11 (installer) | `Hold-My-Brief-${VERSION}-windows-x64-setup.exe` |
| Windows 10 or 11 (no install) | `Hold-My-Brief-${VERSION}-windows-x64-portable.zip` |
| Mac with Apple silicon (M1 or later) | `Hold-My-Brief-${VERSION}-macos-arm64.dmg` |

There is no build for Intel Macs yet.

## Opening it the first time

These builds are not code-signed yet, so your computer will ask you to confirm once.

**Windows.** Windows may show a blue "Windows protected your PC" screen because the app isn't signed yet. Choose **More info**, then **Run anyway**. The installer sets Hold My Brief up for your account only and doesn't need admin rights. It uses Microsoft Edge WebView2, which Windows 10 and 11 already include; if it's missing, the installer downloads it. The portable zip needs WebView2 already installed.

**Mac.** Open the `.dmg` and drag Hold My Brief to Applications. The first time you open it, macOS says it can't verify the developer.

- On macOS 15 (Sequoia) or later: click **Done**, open **System Settings > Privacy & Security**, scroll down and click **Open Anyway**.
- On macOS 14 or earlier: Control-click (right-click) the app, choose **Open**, then **Open** again.

After that it opens normally.

## Checking your download

`SHA256SUMS.txt` lists a SHA-256 checksum for each file. To check one:

- Windows (PowerShell): `Get-FileHash .\Hold-My-Brief-${VERSION}-windows-x64-setup.exe`
- Mac (Terminal): `shasum -a 256 Hold-My-Brief-${VERSION}-macos-arm64.dmg`

The result should match the line for that file.

---

Built from `${COMMIT}` by the [release workflow](${RUN_URL}).
