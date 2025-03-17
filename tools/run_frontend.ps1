# Install npm
winget install -e --id OpenJS.NodeJS

# Reload the Powershell window to allow npm to run
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

# Allow Powershell to run npm
Set-ExecutionPolicy Bypass -Scope Process

# Get the directory of the currently running script
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Get the frontend's directory
$ScriptDir = Join-Path -Path $ScriptDir -ChildPath "../frontend"

# Set to the script's directory
Set-Location -Path $ScriptDir

# Print the current location for debugging
Write-Host "Running from: $ScriptDir"

# Install npm dependencies
npm install

# Run the frontend
npm run dev

# In case of failure, don't immediately close the window
pause