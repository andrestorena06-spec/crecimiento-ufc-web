Add-Type -AssemblyName System.Drawing
$dest = $PSScriptRoot
function C($h) { [System.Drawing.ColorTranslator]::FromHtml($h) }
function Dibujar([int]$n) {
  $bmp = New-Object System.Drawing.Bitmap $n, $n, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp); $g.SmoothingMode = 'AntiAlias'; $g.Clear([System.Drawing.Color]::Transparent)
  $k = $n / 64.0; $r = 14 * $k
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $p.AddArc(0,0,2*$r,2*$r,180,90); $p.AddArc($n-2*$r,0,2*$r,2*$r,270,90); $p.AddArc($n-2*$r,$n-2*$r,2*$r,2*$r,0,90); $p.AddArc(0,$n-2*$r,2*$r,2*$r,90,90); $p.CloseFigure()
  $g.FillPath((New-Object System.Drawing.SolidBrush (C '#3b2a1f')), $p)
  $pen = New-Object System.Drawing.Pen (C '#ffe3c2'), (3.3*$k); $pen.StartCap='Round'; $pen.EndCap='Round'; $pen.LineJoin='Round'
  $g.DrawLines($pen, [System.Drawing.PointF[]]@((New-Object System.Drawing.PointF (14*$k),(14*$k)), (New-Object System.Drawing.PointF (14*$k),(50*$k)), (New-Object System.Drawing.PointF (54*$k),(50*$k))))
  $pc = New-Object System.Drawing.Pen (C '#ffb35c'), (5.2*$k); $pc.StartCap='Round'; $pc.EndCap='Round'
  $P = { param($x,$y) New-Object System.Drawing.PointF ($x*$k), ($y*$k) }
  $g.DrawBezier($pc, (& $P 17 46), (& $P 28 46), (& $P 32 44.5), (& $P 37 34))
  $g.DrawBezier($pc, (& $P 37 34), (& $P 42 23.5), (& $P 47 17), (& $P 56 16))
  $br = New-Object System.Drawing.SolidBrush (C '#ffe3c2')
  foreach ($pt in @(@(25,45.6), @(37,34), @(48,19.5))) { $g.FillEllipse($br, ($pt[0]-2.6)*$k, ($pt[1]-2.6)*$k, 5.2*$k, 5.2*$k) }
  foreach ($pt in @(@(21,17,3.4), @(29,12,2.4), @(29,20,2.8), @(37,15.5,2.0))) { $g.FillEllipse($br, ($pt[0]-$pt[2])*$k, ($pt[1]-$pt[2])*$k, 2*$pt[2]*$k, 2*$pt[2]*$k) }
  $g.Dispose(); return $bmp
}
$datos = @()
foreach ($n in 16,32,48,64,128,256) {
  $b = Dibujar $n; $ms = New-Object IO.MemoryStream; $b.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $datos += ,@($n, $ms.ToArray())
  if ($n -eq 256) { $b.Save("$dest\crecimiento_ufc_256.png", [System.Drawing.Imaging.ImageFormat]::Png) }
  $b.Dispose()
}
$fs = [IO.File]::Create("$dest\crecimiento_ufc.ico"); $bw = New-Object IO.BinaryWriter $fs
$bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]$datos.Count); $off = 6 + 16 * $datos.Count
foreach ($d in $datos) {
  $w = if ($d[0] -ge 256) { 0 } else { $d[0] }
  $bw.Write([byte]$w); $bw.Write([byte]$w); $bw.Write([byte]0); $bw.Write([byte]0); $bw.Write([uint16]1); $bw.Write([uint16]32)
  $bw.Write([uint32]$d[1].Length); $bw.Write([uint32]$off); $off += $d[1].Length
}
foreach ($d in $datos) { $bw.Write($d[1]) }
$bw.Close(); $fs.Close()
$svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#3b2a1f"/><path d="M14 14 V50 H54" fill="none" stroke="#ffe3c2" stroke-width="3.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 46 C28 46 32 44.5 37 34 S47 17 56 16" fill="none" stroke="#ffb35c" stroke-width="5.2" stroke-linecap="round"/><g fill="#ffe3c2"><circle cx="25" cy="45.6" r="2.6"/><circle cx="37" cy="34" r="2.6"/><circle cx="48" cy="19.5" r="2.6"/><circle cx="21" cy="17" r="3.4"/><circle cx="29" cy="12" r="2.4"/><circle cx="29" cy="20" r="2.8"/><circle cx="37" cy="15.5" r="2"/></g></svg>'
[IO.File]::WriteAllText("$dest\crecimiento_ufc.svg", $svg, (New-Object Text.UTF8Encoding($false)))
$uri = 'data:image/svg+xml,' + [uri]::EscapeDataString($svg)
$ih = Join-Path $dest '..\web\index.html'
$h = [IO.File]::ReadAllText($ih)
$h = [regex]::Replace($h, 'href="data:image/svg\+xml,[^"]*"', ('href="' + $uri + '"'))
[IO.File]::WriteAllText($ih, $h, (New-Object Text.UTF8Encoding($false)))
Get-ChildItem $dest | Select-Object Name, Length
