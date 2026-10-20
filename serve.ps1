# Minimaler statischer Webserver für lokale Entwicklung (ES-Module brauchen http://, nicht file://).
# Aufruf: powershell -ExecutionPolicy Bypass -File .\serve.ps1 [-Port 8080]
param([int]$Port = 8080)

$root = $PSScriptRoot
$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.svg'  = 'image/svg+xml'
  '.glb'  = 'model/gltf-binary'
  '.mp3'  = 'audio/mpeg'
  '.ogg'  = 'audio/ogg'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Druckercenter läuft auf http://localhost:$Port/  (Strg+C beendet)"

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
    if ($rel -eq '') { $rel = 'index.html' }
    $path = [IO.Path]::GetFullPath((Join-Path $root $rel))

    if ($path.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path $path -PathType Leaf)) {
      $bytes = [IO.File]::ReadAllBytes($path)
      $ext = [IO.Path]::GetExtension($path).ToLower()
      $ctx.Response.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
      $ctx.Response.Headers.Add('Cache-Control', 'no-store')
      # Bricht der Browser die Anfrage ab (Tab zu, Neuladen), nicht den ganzen Server beenden
      try { $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length) } catch { }
    } else {
      $ctx.Response.StatusCode = 404
    }
    try { $ctx.Response.Close() } catch { }
  }
} finally {
  $listener.Stop()
}
