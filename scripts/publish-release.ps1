param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^\d+\.\d+\.\d+([.-][0-9A-Za-z.-]+)?$')]
  [string]$Version
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

if ((git branch --show-current) -ne 'main') { throw 'A publicação deve partir da branch main.' }
if (git status --porcelain) { throw 'Existem alterações locais. Faça commit antes de publicar.' }

git pull --ff-only origin main
if (-not (Select-String -Path 'frontend/src/config/releaseNotes.ts' -SimpleMatch -Quiet -Pattern ('"' + $Version + '"'))) {
  throw "Adicione as novidades da versão $Version em frontend/src/config/releaseNotes.ts."
}

npm run prisma:generate --prefix backend
npm run build --prefix backend
npm run build --prefix frontend
npm run build:desktop --prefix desktop

$tag = "v$Version"
if (git ls-remote --exit-code --tags origin "refs/tags/$tag" 2>$null) { throw "A tag $tag já existe." }
git tag -a $tag -m "TechLead Hub $Version"
git push origin $tag
Write-Host "Publicação $tag disparada. Acompanhe em https://github.com/Taysonrv/techlead-hub/actions" -ForegroundColor Green
