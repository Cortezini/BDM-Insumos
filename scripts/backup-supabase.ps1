param(
  [string]$OutputRoot = "backups/supabase",
  [string]$DatabaseUrl = $env:SUPABASE_DB_URL,
  [switch]$IncludeAuthStorage
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$targetDir = Join-Path $OutputRoot $timestamp
$archivePath = "$targetDir.zip"

New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

function Invoke-SupabaseDump {
  param([string[]]$DumpArgs)

  $connectionArgs = @("--linked")
  if (-not [string]::IsNullOrWhiteSpace($DatabaseUrl)) {
    $connectionArgs = @("--db-url", $DatabaseUrl)
  }

  & bunx supabase db dump @connectionArgs @DumpArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao executar supabase db dump: $($DumpArgs -join ' ')"
  }
}

Write-Host "Iniciando backup Supabase em $targetDir"

Invoke-SupabaseDump @("--file", (Join-Path $targetDir "roles.sql"), "--role-only")
Invoke-SupabaseDump @("--file", (Join-Path $targetDir "schema.sql"))
Invoke-SupabaseDump @(
  "--file",
  (Join-Path $targetDir "data.sql"),
  "--use-copy",
  "--data-only",
  "--exclude",
  "storage.buckets_vectors",
  "--exclude",
  "storage.vector_indexes"
)

if ($IncludeAuthStorage) {
  Invoke-SupabaseDump @("--file", (Join-Path $targetDir "auth-storage-schema.sql"), "--schema", "auth,storage")
  Invoke-SupabaseDump @(
    "--file",
    (Join-Path $targetDir "auth-storage-data.sql"),
    "--schema",
    "auth,storage",
    "--use-copy",
    "--data-only"
  )
}

Compress-Archive -Path (Join-Path $targetDir "*") -DestinationPath $archivePath -Force

Write-Host "Backup finalizado: $archivePath"
Write-Host "Guarde este arquivo em local externo e seguro. Nao envie backups para o Git."
