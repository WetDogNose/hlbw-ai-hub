# // turbo-all
param(
    [Parameter(ValueFromRemainingArguments=$true)]
    [string[]]$ArgsList
)

$npxPath = (Get-Command npx -ErrorAction SilentlyContinue).Source
if (-not $npxPath) {
    Write-Error "npx command not found. Please ensure Node.js and npm are installed and in your PATH."
    exit 1
}

# Construct the npx command with --yes and all passed arguments
$command = "npx --yes"
if ($ArgsList) {
    $command += " $($ArgsList -join ' ')"
}

# Execute the command
Invoke-Expression $command