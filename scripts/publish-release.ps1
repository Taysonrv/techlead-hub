param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^\d+\.\d+\.\d+([.-][0-9A-Za-z.-]+)?$')]
  [string]$Version
)

$ErrorActionPreference = 'Stop'
function Invoke-Checked {
  param([string]$Command, [string[]]$CommandArguments)
  & $Command @CommandArguments
  if ($LASTEXITCODE -ne 0) { throw "Falha em $Command (codigo $LASTEXITCODE). Publicacao interrompida." }
}
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

if ((git branch --show-current) -ne 'main') { throw 'A publicação deve partir da branch main.' }
if (git status --porcelain) { throw 'Existem alterações locais. Faça commit antes de publicar.' }
Invoke-Checked -Command git -CommandArguments @('pull', '--ff-only', 'origin', 'main')
if (-not (Select-String -Path 'frontend/src/config/releaseNotes.ts' -SimpleMatch -Quiet -Pattern ('"' + $Version + '"'))) {
  throw "Adicione as novidades da versão $Version em frontend/src/config/releaseNotes.ts."
}
$desktopVersion = (Get-Content 'desktop/package.json' -Raw | ConvertFrom-Json).version
if ($desktopVersion -ne $Version) { throw "desktop/package.json=$desktopVersion difere da versao solicitada $Version." }

Invoke-Checked -Command node -CommandArguments @('scripts/security-check.mjs')
Invoke-Checked -Command npm -CommandArguments @('run', 'build', '--prefix', 'backend')
Invoke-Checked -Command npm -CommandArguments @('test', '--prefix', 'backend')
Invoke-Checked -Command npm -CommandArguments @('run', 'lint', '--prefix', 'frontend')
Invoke-Checked -Command npm -CommandArguments @('test', '--prefix', 'frontend')
Invoke-Checked -Command npm -CommandArguments @('run', 'build', '--prefix', 'frontend')
Invoke-Checked -Command npm -CommandArguments @('test', '--prefix', 'desktop')
Invoke-Checked -Command npm -CommandArguments @('run', 'build:desktop', '--prefix', 'desktop')

$tag = "v$Version"
$remoteTag = & git ls-remote --tags origin "refs/tags/$tag"
if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel verificar as tags remotas.' }
if ($remoteTag) { throw "A tag $tag já existe." }
Invoke-Checked -Command git -CommandArguments @('tag', '-a', $tag, '-m', "TechLead Hub $Version")
Invoke-Checked -Command git -CommandArguments @('push', 'origin', $tag)
Write-Host "Publicação $tag disparada. Acompanhe em https://github.com/Taysonrv/techlead-hub/actions" -ForegroundColor Green
