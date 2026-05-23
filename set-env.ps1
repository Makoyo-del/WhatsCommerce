# Add all env vars to Vercel production environment
$envFile = "C:\Users\USER\Desktop\opportunities\.env.local"

# Read the file and filter valid lines
$envVars = Get-Content $envFile | Where-Object {
    $line = $_.Trim()
    $line -and -not $line.StartsWith("#")
} | ForEach-Object {
    $parts = $_ -split "=", 2
    if ($parts.Length -eq 2) {
        [PSCustomObject]@{
            Key   = $parts[0].Trim()
            Value = $parts[1].Trim()
        }
    }
}

foreach ($var in $envVars) {
    Write-Host "Adding $($var.Key)..."
    $var.Value | npx vercel env add $var.Key production --force 2>&1
    Write-Host "  Done."
}

Write-Host "`nAll env vars added. Redeploying..."
npx vercel --prod --yes
