$ErrorActionPreference = "Stop"
$Repo = "nghyane/mcz"
$InstallDir = "$env:LOCALAPPDATA\mcz"

$Release = Invoke-RestMethod "https://api.github.com/repos/$Repo/releases/latest"
$Version = $Release.tag_name
$Url = "https://github.com/$Repo/releases/download/$Version/mcz-windows-x86_64.zip"

Write-Host "Installing mcz $Version..."

$Tmp = New-TemporaryFile | ForEach-Object { Remove-Item $_; New-Item -ItemType Directory -Path $_ }
$Zip = Join-Path $Tmp "mcz.zip"

Invoke-WebRequest -Uri $Url -OutFile $Zip
Expand-Archive -Path $Zip -DestinationPath $Tmp -Force

New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
Move-Item -Path (Join-Path $Tmp "mcz.exe") -Destination (Join-Path $InstallDir "mcz.exe") -Force

Remove-Item -Recurse -Force $Tmp

$Path = [Environment]::GetEnvironmentVariable("Path", "User")
if ($Path -notlike "*$InstallDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$Path;$InstallDir", "User")
    Write-Host "Added $InstallDir to PATH (restart terminal to use)"
}

Write-Host "Installed mcz to $InstallDir\mcz.exe"
& (Join-Path $InstallDir "mcz.exe") --help
