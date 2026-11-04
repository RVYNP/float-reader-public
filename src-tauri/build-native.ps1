$ErrorActionPreference = 'Stop'
# A space-free build cache also avoids the GNU windres path-quoting bug when the
# checkout path contains spaces. The application never stores reading data in this cache.
$env:CARGO_TARGET_DIR = Join-Path ([IO.Path]::GetTempPath()) 'hold-my-brief-target'
$cargo = Get-Command cargo -ErrorAction SilentlyContinue
if (-not $cargo) {
    $cargoPath = Join-Path $env:USERPROFILE '.cargo/bin/cargo.exe'
    if (-not (Test-Path -LiteralPath $cargoPath)) { throw 'Install Rust 1.90 or later and Windows compiler prerequisites first.' }
} else { $cargoPath = $cargo.Source }
Push-Location $PSScriptRoot
try {
    Push-Location '..'
    try {
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
    } finally { Pop-Location }
    & $cargoPath build --release --locked --features custom-protocol
    if ($LASTEXITCODE -ne 0) { throw 'Native build failed.' }
    $output = Join-Path $PSScriptRoot '../dist/Hold My Brief.exe'
    Copy-Item -LiteralPath (Join-Path $env:CARGO_TARGET_DIR 'release/hold-my-brief.exe') -Destination $output -Force
    # The GNU Windows build links the WebView2 loader dynamically.
    $loader = Join-Path $env:CARGO_TARGET_DIR 'release/WebView2Loader.dll'
    if (Test-Path -LiteralPath $loader) {
        Copy-Item -LiteralPath $loader -Destination (Join-Path $PSScriptRoot '../dist/WebView2Loader.dll') -Force
    }
    Write-Output (Resolve-Path -LiteralPath $output).Path
} finally { Pop-Location }
