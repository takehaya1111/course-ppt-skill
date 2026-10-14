param(
 [Parameter(Mandatory=$true)][string]$InputPptx,
 [Parameter(Mandatory=$true)][string]$OutputDir,
 [string]$Pages=''
)
$ErrorActionPreference='Stop'
$absoluteInput=(Resolve-Path -LiteralPath $InputPptx).Path
$absoluteOutput=[System.IO.Path]::GetFullPath($OutputDir)
if(-not(Test-Path -LiteralPath $absoluteOutput)){New-Item -ItemType Directory -Path $absoluteOutput | Out-Null}
if(@(Get-ChildItem -LiteralPath $absoluteOutput -Force).Count -gt 0){throw 'Render output must be a fresh empty directory.'}
$existingProcess=@(Get-Process -Name POWERPNT,wpp -ErrorAction SilentlyContinue)
$app=$null
$presentation=$null
$createdApplication=$false
$before=@()
$classId=(Get-ItemProperty -LiteralPath 'Registry::HKEY_CLASSES_ROOT\PowerPoint.Application\CLSID').'(default)'
$serverPaths=@("Registry::HKEY_CLASSES_ROOT\CLSID\$classId\LocalServer32","Registry::HKEY_CLASSES_ROOT\WOW6432Node\CLSID\$classId\LocalServer32")
$server=($serverPaths | ForEach-Object {if(Test-Path -LiteralPath $_){(Get-ItemProperty -LiteralPath $_).'(default)'}} | Select-Object -First 1)
$identity=if($server -match 'wpp\.exe'){'WPS Presentation'}elseif($server -match 'POWERPNT\.EXE'){'Microsoft PowerPoint'}else{'PowerPoint-compatible COM server'}
$report=[ordered]@{input=$absoluteInput;output=$absoluteOutput;status='started';hidden=$true;readOnly=$true;application=$identity;method='PowerPoint-compatible COM Slide.Export PNG; not slideshow playback';attachedToExisting=($existingProcess.Count -gt 0);slides=@()}
try {
 if($existingProcess.Count -gt 0){
  # Never reconfigure or quit a user's application. An inaccessible existing app is a failure.
  $app=[Runtime.InteropServices.Marshal]::GetActiveObject('PowerPoint.Application')
 }else{
  $app=New-Object -ComObject PowerPoint.Application
  $createdApplication=$true
  $app.AutomationSecurity=3
 }
 for($i=1;$i -le $app.Presentations.Count;$i++){
  $item=$app.Presentations.Item($i)
  $before+=@{name=$item.FullName;saved=$item.Saved}
  if($item.FullName -eq $absoluteInput){throw 'This render input is already open; refusing to take ownership.'}
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($item)
 }
 $report.existingBeforeCount=$before.Count
 $report.version=$app.Version
 $presentation=$app.Presentations.Open($absoluteInput,-1,0,0)
 if($presentation.FullName -ne $absoluteInput){throw 'Opened presentation differs from the isolated requested input.'}
 $report.slideCount=$presentation.Slides.Count
 $selected=if($Pages.Trim()){@($Pages.Split(',') | ForEach-Object {[int]$_})}else{@(1..$presentation.Slides.Count)}
 if(@($selected | Select-Object -Unique).Count -ne $selected.Count){throw 'Duplicate render page numbers.'}
 $width=1600
 $height=[int][Math]::Round($width*$presentation.PageSetup.SlideHeight/$presentation.PageSetup.SlideWidth)
 foreach($index in $selected){
  if($index -lt 1 -or $index -gt $presentation.Slides.Count){throw 'Render page number is out of range.'}
  $filename=Join-Path $absoluteOutput ('slide-{0:D2}.png' -f $index)
  $slide=$presentation.Slides.Item($index)
  try{
   $slide.Export($filename,'PNG',$width,$height)
   $report.slides+=@{index=$index;image=$filename;shapes=$slide.Shapes.Count}
  }finally{[void][Runtime.InteropServices.Marshal]::ReleaseComObject($slide)}
 }
 $report.status='success'
}catch{
 $report.status='failed'
 $report.error=$_.Exception.Message
 throw
}finally{
 if($presentation){
  if($presentation.FullName -eq $absoluteInput){$presentation.Close()}
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($presentation)
 }
 if($app){
  $after=@()
  for($i=1;$i -le $app.Presentations.Count;$i++){
   $item=$app.Presentations.Item($i)
   $after+=@{name=$item.FullName;saved=$item.Saved}
   [void][Runtime.InteropServices.Marshal]::ReleaseComObject($item)
  }
  $report.existingAfterCount=$after.Count
  $report.existingDocumentsUnchanged=($before.Count -eq $after.Count -and @($before | Where-Object {$entry=$_; -not @($after | Where-Object {$_.name -eq $entry.name -and $_.saved -eq $entry.saved}).Count}).Count -eq 0)
  if(-not $report.existingDocumentsUnchanged){$report.status='failed';$report.error='Existing presentation state changed during rendering; manual review required.'}
  # If a user opened a presentation during our run, leave the app running for them.
  if($createdApplication -and $app.Presentations.Count -eq 0){$app.Quit()}
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($app)
 }
 [GC]::Collect()
 [GC]::WaitForPendingFinalizers()
 $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $absoluteOutput 'render-report.json') -Encoding utf8
}
