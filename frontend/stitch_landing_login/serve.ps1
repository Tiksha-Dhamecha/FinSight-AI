# Single static server for this folder. Running `python -m http.server 8080` twice breaks the port
# (ERR_EMPTY_RESPONSE). Use -StopExisting to free the port, then one listener on 127.0.0.1.
param(
    [int]$Port = 8080,
    [switch]$StopExisting
)
$ErrorActionPreference = "SilentlyContinue"
Set-Location $PSScriptRoot

if ($StopExisting) {
    Get-NetTCPConnection -LocalPort $Port -State Listen |
        ForEach-Object { $_.OwningProcess } |
        Sort-Object -Unique |
        ForEach-Object { if ($_) { Stop-Process -Id $_ -Force } }
    Start-Sleep -Milliseconds 400
}

Write-Host "Open http://127.0.0.1:$Port/landing_login/code.html  (Ctrl+C to stop)"
python -m http.server $Port --bind 127.0.0.1
