# Read .env.local and deploy to Vercel with all env vars
$envFile = ".env.local"
$envArgs = @()

Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    # Skip comments and empty lines
    if ($line -and -not $line.StartsWith("#")) {
        $parts = $line -split "=", 2
        if ($parts.Length -eq 2) {
            $key = $parts[0].Trim()
            $value = $parts[1].Trim()
            $envArgs += "--env"
            $envArgs += "$key=$value"
        }
    }
}

Write-Host "Deploying with $($envArgs.Count / 2) environment variables..."
Write-Host "Environment variables found:"
Get-Content $envFile | Where-Object { $_ -notmatch "^#" -and $_.Trim() -ne "" } | ForEach-Object {
    $key = ($_ -split "=", 2)[0]
    Write-Host "  - $key"
}

# Run vercel deploy
$cmd = @("vercel", "--yes", "--prod") + $envArgs
& npx @cmd
