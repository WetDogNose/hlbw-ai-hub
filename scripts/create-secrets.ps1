# // turbo-all
# scripts/create-secrets.ps1
# Creates (or updates) all sensitive environment variables in Google Secret Manager.
# Reads values from the local .env file and the Apple .p8 key file.
#
# Usage: .\scripts\create-secrets.ps1
# Prerequisites: gcloud CLI authenticated with project access
#
# IMPORTANT: Uses temp file approach instead of PowerShell pipe to avoid
# trailing \r\n being stored as part of secret values.

$PROJECT_ID = "hlbw-ai-hub"
$SERVICE_ACCOUNT = "458969954342-compute@developer.gserviceaccount.com"
$tmpFile = [System.IO.Path]::GetTempFileName()

Write-Host ""
Write-Host "Secret Manager Migration for wot-box" -ForegroundColor Cyan
Write-Host "========================================="
Write-Host ""

# --- Step 1: Grant Secret Manager access to Cloud Run service account ---
Write-Host "Step 1: Granting secretmanager.secretAccessor to Cloud Run SA..." -ForegroundColor Yellow

gcloud projects add-iam-policy-binding $PROJECT_ID `
  --member="serviceAccount:$SERVICE_ACCOUNT" `
  --role="roles/secretmanager.secretAccessor" `
  --condition=None `
  --quiet 2>$null

Write-Host "   Done: IAM binding set" -ForegroundColor Green
Write-Host ""

# --- Step 2: Read secrets from .env ---
Write-Host "Step 2: Reading secrets from .env..." -ForegroundColor Yellow

$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$envFile = Join-Path (Join-Path $scriptDir "..") ".env"
if (-not (Test-Path $envFile)) {
    Write-Host "   ERROR: .env file not found at $envFile" -ForegroundColor Red
    exit 1
}

$envContent = Get-Content $envFile -Raw
function Get-EnvValue($name) {
    $match = [regex]::Match($envContent, "(?m)^${name}=(.+)$")
    if ($match.Success) {
        return $match.Groups[1].Value.Trim().Trim('"').Trim("'")
    }
    return $null
}

# Read the Apple private key from the .p8 file
$appleKeyPath = Join-Path (Join-Path $env:USERPROFILE "Downloads") "AuthKey_AQ5WAKV29R.p8"
if (Test-Path $appleKeyPath) {
    $applePrivateKey = (Get-Content $appleKeyPath -Raw).TrimEnd()
    Write-Host "   Read Apple private key from $appleKeyPath" -ForegroundColor Green
} else {
    Write-Host "   WARNING: Apple .p8 key not found at $appleKeyPath, trying .env..." -ForegroundColor Yellow
    $applePrivateKey = Get-EnvValue "APPLE_PRIVATE_KEY"
}

# Define all secrets to migrate
$secrets = @(
    @{ name = "database-url";               envVar = "DATABASE_URL" },
    @{ name = "nextauth-secret";            envVar = "NEXTAUTH_SECRET" },
    @{ name = "gemini-api-key";             envVar = "GEMINI_API_KEY" },
    @{ name = "smtp-password";              envVar = "SMTP_PASSWORD" },
    @{ name = "smtp-user";                  envVar = "SMTP_USER" },
    @{ name = "google-oauth-client-id";     envVar = "GOOGLE_CLIENT_ID" },
    @{ name = "google-oauth-client-secret"; envVar = "GOOGLE_CLIENT_SECRET" },
    @{ name = "github-oauth-client-id";     envVar = "GITHUB_CLIENT_ID" },
    @{ name = "github-oauth-client-secret"; envVar = "GITHUB_CLIENT_SECRET" },
    @{ name = "azure-ad-oauth-client-id";   envVar = "AZURE_AD_CLIENT_ID" },
    @{ name = "azure-ad-oauth-client-secret"; envVar = "AZURE_AD_CLIENT_SECRET" }
)

Write-Host "   Done: Parsed .env file" -ForegroundColor Green
Write-Host ""

# --- Step 3: Create/update secrets ---
Write-Host "Step 3: Creating/updating secrets in Secret Manager..." -ForegroundColor Yellow

function Set-Secret($secretName, $secretValue) {
    if ([string]::IsNullOrEmpty($secretValue)) {
        Write-Host "   SKIP: $secretName (no value found)" -ForegroundColor Yellow
        return
    }

    # Write value to temp file WITHOUT trailing newline (PowerShell pipe adds \r\n)
    [System.IO.File]::WriteAllText($tmpFile, $secretValue)

    # Check if secret exists
    gcloud secrets describe $secretName --project=$PROJECT_ID 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        # Create new secret
        gcloud secrets create $secretName `
            --project=$PROJECT_ID `
            --replication-policy=automatic `
            --data-file=$tmpFile `
            --quiet
        Write-Host "   CREATED: $secretName" -ForegroundColor Green
    } else {
        # Add new version
        gcloud secrets versions add $secretName `
            --project=$PROJECT_ID `
            --data-file=$tmpFile `
            --quiet
        Write-Host "   UPDATED: $secretName" -ForegroundColor Cyan
    }
}

# Process standard secrets from .env
foreach ($secret in $secrets) {
    $value = Get-EnvValue $secret.envVar
    Set-Secret $secret.name $value
}

# Process Apple private key separately (from .p8 file, not .env)
Set-Secret "apple-private-key" $applePrivateKey

# Clean up
Remove-Item $tmpFile -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Step 4: Verification..." -ForegroundColor Yellow
$allSecrets = gcloud secrets list --project=$PROJECT_ID --format="value(name)" 2>$null
$expectedCount = 12
$actualCount = ($allSecrets | Measure-Object).Count
Write-Host "   Found $actualCount secrets in Secret Manager" -ForegroundColor $(if ($actualCount -ge $expectedCount) { "Green" } else { "Yellow" })

Write-Host ""
Write-Host "Done! Secret Manager setup complete!" -ForegroundColor Green
Write-Host "   Next: Update cloudbuild.yaml to use --set-secrets and deploy."
Write-Host ""
