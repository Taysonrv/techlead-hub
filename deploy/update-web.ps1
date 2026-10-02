param(
  [Parameter(Mandatory=$true)]
  [string]$Version,
  [string]$ComposeFile = "docker-compose.yml",
  [int]$ReadyTimeoutSeconds = 120
)

$ErrorActionPreference = "Stop"
$image = "ghcr.io/taysonrv/techlead-hub:$Version"
$env:TECHLEAD_IMAGE = $image

Write-Host "[web-update] Atualizando TechLead Hub Web para $Version ($image)"
docker compose -f $ComposeFile pull app migrate
if ($LASTEXITCODE -ne 0) { throw "Falha ao baixar a imagem $image." }

docker compose -f $ComposeFile up -d postgres
if ($LASTEXITCODE -ne 0) { throw "Falha ao garantir PostgreSQL." }

docker compose -f $ComposeFile rm -sf migrate | Out-Null
docker compose -f $ComposeFile run --rm migrate
if ($LASTEXITCODE -ne 0) { throw "Migration falhou. A aplicação atual não será substituída." }

docker compose -f $ComposeFile up -d --no-deps app
if ($LASTEXITCODE -ne 0) { throw "Falha ao recriar o serviço app." }

$port = if ($env:TECHLEAD_PORT) { $env:TECHLEAD_PORT } else { "3333" }
$readyUrl = "http://127.0.0.1:$port/health/ready"
$deadline = (Get-Date).AddSeconds($ReadyTimeoutSeconds)
do {
  try {
    $health = Invoke-RestMethod -Uri $readyUrl -TimeoutSec 5
    if ($health.status -eq "ready") {
      Write-Host "[web-update] Versão $Version pronta e saudável."
      docker compose -f $ComposeFile ps
      exit 0
    }
  } catch {}
  Start-Sleep -Seconds 3
} while ((Get-Date) -lt $deadline)

docker compose -f $ComposeFile logs --tail 100 app
throw "A versão $Version não ficou pronta em $ReadyTimeoutSeconds segundos."
