param([Parameter(Mandatory=$true)][string]$InputPptx,[Parameter(Mandatory=$true)][string]$OutputDir)
$ErrorActionPreference='Stop'
# PowerPoint-compatible COM can be provided by WPS. Refuse to attach to either existing app.
if (Get-Process -Name POWERPNT,wpp -ErrorAction SilentlyContinue) { throw 'A presentation application is already running; no user application was touched.' }
$classId=(Get-ItemProperty -LiteralPath 'Registry::HKEY_CLASSES_ROOT\PowerPoint.Application\CLSID').'(default)'
$serverPaths=@("Registry::HKEY_CLASSES_ROOT\CLSID\$classId\LocalServer32","Registry::HKEY_CLASSES_ROOT\WOW6432Node\CLSID\$classId\LocalServer32")
$server=($serverPaths | ForEach-Object { if(Test-Path -LiteralPath $_) { (Get-ItemProperty -LiteralPath $_).'(default)' } } | Select-Object -First 1)
$applicationIdentity=if($server -match 'wpp\.exe'){'WPS Presentation'}elseif($server -match 'POWERPNT\.EXE'){'Microsoft PowerPoint'}else{'Unknown PowerPoint-compatible COM server'}
$absoluteInput=(Resolve-Path -LiteralPath $InputPptx).Path
$absoluteOutput=[System.IO.Path]::GetFullPath($OutputDir)
New-Item -ItemType Directory -Force -Path $absoluteOutput | Out-Null
$app=$null
$presentation=$null
$report=[ordered]@{ input=$absoluteInput; output=$absoluteOutput; status='started'; hidden=$true; readOnly=$true; application=$applicationIdentity; registeredServer=$server; method='PowerPoint-compatible COM Slide.Export PNG; not slideshow playback'; slides=@() }
try {
    $app=New-Object -ComObject PowerPoint.Application
    $app.AutomationSecurity=3
    $report.version=$app.Version
    $presentation=$app.Presentations.Open($absoluteInput,-1,0,0)
    $report.slideCount=$presentation.Slides.Count
    for($index=1;$index -le $presentation.Slides.Count;$index++) {
        $filename=Join-Path $absoluteOutput ('slide-{0:D2}.png' -f $index)
        $slide=$presentation.Slides.Item($index)
        $slide.Export($filename,'PNG',1600,900)
        $report.slides+=@{index=$index; image=$filename; shapes=$slide.Shapes.Count}
        [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($slide)
    }
    $report.status='success'
} catch {
    $report.status='failed'
    $report.error=$_.Exception.Message
    throw
} finally {
    if($presentation) { $presentation.Close(); [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation) }
    if($app) { $app.Quit(); [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($app) }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
    for($attempt=0;$attempt -lt 10;$attempt++) {
        if(-not (Get-Process -Name POWERPNT,wpp -ErrorAction SilentlyContinue)) { break }
        Start-Sleep -Milliseconds 300
    }
    $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $absoluteOutput 'render-report.json') -Encoding utf8
}
