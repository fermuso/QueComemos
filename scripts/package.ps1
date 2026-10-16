$ErrorActionPreference = 'Stop'
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$artifactRoot = Join-Path $repoRoot 'artifacts'
New-Item -ItemType Directory -Path $artifactRoot -Force | Out-Null
$stagePath = Join-Path $artifactRoot ('stage-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stagePath | Out-Null
$include = @('index.html','styles.css','manifest.webmanifest','sw.js','README.md','VALIDACION.md','LICENSE','package.json','package-lock.json','playwright.config.mjs','js','data','assets','vendor','schemas','docs','tests','scripts')
foreach ($item in $include) {
  $sourcePath = Join-Path $repoRoot $item
  if (Test-Path -LiteralPath $sourcePath) { Copy-Item -LiteralPath $sourcePath -Destination $stagePath -Recurse }
}
foreach ($required in @('index.html','sw.js','data\catalog.json','data\QueComemos-DatosDemo-1.0.0.json','vendor\webllm.mjs','vendor\model.wasm','README.md','VALIDACION.md')) {
  if (-not (Test-Path -LiteralPath (Join-Path $stagePath $required))) { throw "Falta un entregable necesario: $required" }
}
$zipPath = Join-Path $artifactRoot 'QueComemos-0.1.0.zip'
Compress-Archive -Path (Join-Path $stagePath '*') -DestinationPath $zipPath -Force
Copy-Item -LiteralPath (Join-Path $stagePath 'data\QueComemos-DatosDemo-1.0.0.json') -Destination (Join-Path $artifactRoot 'QueComemos-DatosDemo-1.0.0.json') -Force
$verifyPath = Join-Path $artifactRoot ('verified-' + [guid]::NewGuid().ToString('N'))
Expand-Archive -LiteralPath $zipPath -DestinationPath $verifyPath
$sourceHash = (Get-FileHash -LiteralPath (Join-Path $stagePath 'data\QueComemos-DatosDemo-1.0.0.json')).Hash
$extractedHash = (Get-FileHash -LiteralPath (Join-Path $verifyPath 'data\QueComemos-DatosDemo-1.0.0.json')).Hash
if ($sourceHash -ne $extractedHash) { throw 'La copia descomprimida no coincide' }
[pscustomobject]@{zip=$zipPath; demo=(Join-Path $artifactRoot 'QueComemos-DatosDemo-1.0.0.json'); extracted=$verifyPath; sha256=(Get-FileHash -LiteralPath $zipPath).Hash} | ConvertTo-Json
