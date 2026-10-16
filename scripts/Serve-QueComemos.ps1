param([ValidateRange(1024,65535)][int]$Port = 8080)
$ErrorActionPreference = 'Stop'
$siteRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)
$types = @{ '.html'='text/html; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.mjs'='text/javascript; charset=utf-8'; '.json'='application/json; charset=utf-8'; '.webmanifest'='application/manifest+json'; '.svg'='image/svg+xml'; '.png'='image/png'; '.wasm'='application/wasm'; '.md'='text/plain; charset=utf-8' }
$listener.Start()
Write-Host "Abre http://127.0.0.1:$Port en Edge o Chrome. Ctrl+C para detener."
try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $client.ReceiveTimeout = 5000
      $stream = $client.GetStream()
      $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
      $requestLine = $reader.ReadLine()
      if (-not $requestLine) { continue }
      $parts = $requestLine.Split(' ')
      $headerLine = $reader.ReadLine()
      while ($headerLine) { $headerLine = $reader.ReadLine() }
      $method = $parts[0]
      $resource = [System.Uri]::UnescapeDataString(($parts[1] -split '\?')[0]).Replace('/', [System.IO.Path]::DirectorySeparatorChar)
      if ($resource.EndsWith('\')) { $resource += 'index.html' }
      $target = [System.IO.Path]::GetFullPath((Join-Path $siteRoot $resource.TrimStart('\')))
      $inside = $target.StartsWith($siteRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)
      $blocked = ($resource -split '[\\/]') | Where-Object { $_.StartsWith('.') -or $_ -eq 'node_modules' }
      $status = '200 OK'
      $contentType = $types[[System.IO.Path]::GetExtension($target)]
      if (-not $contentType) { $contentType = 'application/octet-stream' }
      if ($method -ne 'GET' -and $method -ne 'HEAD') { $status = '405 Method Not Allowed'; $body = [byte[]]@() }
      elseif (-not $inside -or $blocked) { $status = '403 Forbidden'; $body = [byte[]]@() }
      elseif (-not [System.IO.File]::Exists($target)) { $status = '404 Not Found'; $body = [byte[]]@() }
      else { $body = [System.IO.File]::ReadAllBytes($target) }
      $headers = "HTTP/1.1 $status`r`nContent-Type: $contentType`r`nContent-Length: $($body.Length)`r`nCache-Control: no-cache`r`nX-Content-Type-Options: nosniff`r`nConnection: close`r`n`r`n"
      $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headers)
      $stream.Write($headerBytes,0,$headerBytes.Length)
      if ($method -ne 'HEAD') { $stream.Write($body,0,$body.Length) }
    } catch { Write-Verbose $_.Exception.Message }
    finally { $client.Dispose() }
  }
} finally { $listener.Stop() }
