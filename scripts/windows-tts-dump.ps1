# windows-tts-dump.ps1
#
# Render the currency locale x form matrix with Microsoft's Windows speech
# engines, then upload the WAVs to the Linux host.
#
#   powershell -ExecutionPolicy Bypass -File windows-tts-dump.ps1 -HostAddr 192.168.56.1
#   powershell -ExecutionPolicy Bypass -File windows-tts-dump.ps1 -HostAddr 192.168.56.1 -Engine both
#
# Options:
#   -Out       folder for the WAVs            (default C:\tts-out)
#   -HostAddr  host as seen from the VM       (default 192.168.56.1)
#   -Port      host receiver port             (default 4182)
#   -Engine    onecore | sapi | both          (default onecore)
#   -Locales   subset of locales to render    (default all)
#   -NoUpload  only write WAVs locally
#
# OneCore uses the WinRT Windows.Media.SpeechSynthesis API (the voices NVDA and
# Narrator use on Windows 10/11). SAPI uses System.Speech (legacy desktop
# voices). The matrix mirrors scripts/gtts-locale-dump.sh and files are named
# <locale>_<slug>.wav so they join across engines.
[CmdletBinding()]
param(
  [string]$Out = 'C:\tts-out',
  [string]$HostAddr = '192.168.56.1',
  [int]$Port = 4182,
  [ValidateSet('onecore', 'sapi', 'both')][string]$Engine = 'onecore',
  [string[]]$Locales = @('en-US','en-GB','en-IN','id-ID','yue-HK','zh-CN','zh-TW','th-TH','ja-JP','ta-IN','de-DE','fr-FR','es-ES','it-IT','nl-NL'),
  [switch]$NoUpload
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path $Out)) { New-Item -ItemType Directory -Force -Path $Out | Out-Null }

$CommaLocales = @('id-ID','de-DE','fr-FR','es-ES','it-IT','nl-NL')

function LocalCode([string]$loc) {
  switch ($loc) {
    'en-US' { 'USD' } 'en-GB' { 'GBP' } 'en-IN' { 'INR' } 'id-ID' { 'IDR' }
    'yue-HK' { 'HKD' } 'zh-CN' { 'CNY' } 'zh-TW' { 'TWD' } 'th-TH' { 'THB' }
    'ja-JP' { 'JPY' } 'ta-IN' { 'INR' } default { 'EUR' }
  }
}

# Windows tags some voices by UI language rather than the text's CLDR locale:
# Cantonese ships as zh-HK (Danny/Tracy), and there is no yue-HK voice token.
function VoiceLanguage([string]$loc) {
  if ($loc -eq 'yue-HK') { return 'zh-HK' }
  return $loc
}

function Slug([string]$s) {
  $s = $s -replace '\$', 'SYM' -replace '\.', 'p' -replace ',', 'c'
  return ($s -replace '[^A-Za-z0-9]', '_')
}

function Forms([string]$loc) {
  $dec = if ($CommaLocales -contains $loc) { ',' } else { '.' }
  $wrong = if ($CommaLocales -contains $loc) { '.' } else { '' }
  $cur = LocalCode $loc
  $f = @(
    "USD123${dec}45",
    "SGD123${dec}45",
    ('$' + "123${dec}45"),
    "USD0${dec}10",
    "${cur}123${dec}45"
  )
  if (@('ja-JP','en-IN','ta-IN','id-ID') -contains $loc) { $f += "${cur}123" }
  if ($wrong) { $f += "${cur}123${wrong}45" }
  # Manual probe forms (ASCII-safe via [char]) to match the other engines.
  $yen = [string][char]0x00A5      # YEN SIGN
  $en  = [string][char]0x5186      # CJK "yen"
  $rup = [string][char]0x20B9      # INDIAN RUPEE SIGN
  $tamil = -join ([char[]](0x0BB0,0x0BC2,0x0BAA,0x0BBE,0x0BAF,0x0BCD))  # ரூபாய்
  switch ($loc) {
    'ja-JP' { $f += @("${yen}123", "${en}123", 'JPY 123') }
    'ta-IN' { $f += @("${rup}123", "${tamil}123", 'INR 123') }
  }
  return ($f | Select-Object -Unique)
}

# Explicit names for the probe forms (Slug() collapses non-ASCII to "_", which
# would make ¥123 and 円123 collide).
function NameFor([string]$loc, [string]$form) {
  $yen = [string][char]0x00A5
  $en  = [string][char]0x5186
  $rup = [string][char]0x20B9
  $tamil = -join ([char[]](0x0BB0,0x0BC2,0x0BAA,0x0BBE,0x0BAF,0x0BCD))
  if ($form -eq "${yen}123") { return "${loc}_JPYsym123" }
  if ($form -eq "${en}123") { return "${loc}_JPYword123" }
  if ($form -eq 'JPY 123') { return "${loc}_JPYspace123" }
  if ($form -eq "${rup}123") { return "${loc}_INRsym123" }
  if ($form -eq "${tamil}123") { return "${loc}_INRword123" }
  if ($form -eq 'INR 123') { return "${loc}_INRspace123" }
  return "${loc}_$(Slug $form)"
}

function Upload([string]$path, [string]$name) {
  if ($NoUpload) { return }
  $curl = Join-Path $env:SystemRoot 'System32\curl.exe'
  if (-not (Test-Path $curl)) { $curl = 'curl.exe' }
  try { & $curl -s -T "$path" "http://${HostAddr}:${Port}/$name" | Out-Null }
  catch { Write-Warning "upload failed for $name : $_" }
}

$rows = New-Object System.Collections.Generic.List[string]
$rows.Add("engine`tlocale`tform`tfile`tbytes")

# ---------------------------------------------------------------- OneCore ---
if ($Engine -in @('onecore', 'both')) {
  try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime | Out-Null
    $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
        $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
      })[0]
    function Await-Op([object]$op, [Type]$t) {
      $task = $asTaskGeneric.MakeGenericMethod($t).Invoke($null, @($op))
      return $task.GetAwaiter().GetResult()
    }

    [void][Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
    [void][Windows.Media.SpeechSynthesis.SpeechSynthesisStream, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
    [void][Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]

    # Write a SpeechSynthesisStream to disk. Preferred path is the .NET
    # extension AsStreamForRead(); DataReader is a fallback if that type is
    # unavailable.
    function Save-StreamToFile([object]$stream, [string]$path) {
      try {
        $rs = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($stream)
        $fs = [System.IO.File]::Create($path)
        $rs.CopyTo($fs); $fs.Close(); $rs.Dispose()
        return
      } catch {
        $size = [uint32]$stream.Size
        $reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
        $null = Await-Op ($reader.LoadAsync($size)) ([uint32])
        $bytes = New-Object byte[] $size
        $reader.ReadBytes($bytes)
        [System.IO.File]::WriteAllBytes($path, $bytes)
        $reader.Dispose()
      }
    }

    $synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
    $allVoices = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices
    Write-Host 'OneCore voices available:'
    $allVoices | ForEach-Object { Write-Host ("  {0}  {1}  ({2})" -f $_.Language, $_.DisplayName, $_.Gender) }

    foreach ($loc in $Locales) {
      $voice = $allVoices | Where-Object { $_.Language -eq (VoiceLanguage $loc) } | Select-Object -First 1
      if (-not $voice) { Write-Warning "onecore: no voice for $loc (skipped)"; continue }
      $synth.Voice = $voice
      foreach ($form in (Forms $loc)) {
        $name = NameFor $loc $form
        $wav = Join-Path $Out "$name.wav"
        try {
          $op = $synth.SynthesizeTextToStreamAsync($form)
          $stream = Await-Op $op ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
          Save-StreamToFile $stream $wav
          $stream.Dispose()
          $bytes = (Get-Item $wav).Length
          $rows.Add("onecore`t$loc`t$form`t$name.wav`t$bytes")
          Upload $wav "$name.wav"
          Write-Host ("  {0,-8} {1,-14} -> {2} ({3} bytes)" -f $loc, $form, $name, $bytes)
        } catch { Write-Warning "onecore $loc $form : $_" }
      }
    }
  } catch { Write-Warning "OneCore engine unavailable: $_" }
}

# ------------------------------------------------------------------- SAPI ---
if ($Engine -in @('sapi', 'both')) {
  try {
    Add-Type -AssemblyName System.Speech
    $sapi = New-Object System.Speech.Synthesis.SpeechSynthesizer
    $installed = $sapi.GetInstalledVoices()
    Write-Host 'SAPI voices available:'
    $installed | ForEach-Object { Write-Host ("  {0}  {1}" -f $_.VoiceInfo.Culture.Name, $_.VoiceInfo.Name) }

    foreach ($loc in $Locales) {
      $v = $installed | Where-Object { $_.VoiceInfo.Culture.Name -eq (VoiceLanguage $loc) } | Select-Object -First 1
      if (-not $v) { Write-Warning "sapi: no voice for $loc (skipped)"; continue }
      $sapi.SelectVoice($v.VoiceInfo.Name)
      foreach ($form in (Forms $loc)) {
        $name = NameFor $loc $form
        $wav = Join-Path $Out "$name.wav"
        try {
          $sapi.SetOutputToWaveFile($wav)
          $sapi.Speak($form)
          $sapi.SetOutputToNull()
          $bytes = (Get-Item $wav).Length
          $rows.Add("sapi`t$loc`t$form`t$name.wav`t$bytes")
          Upload $wav "$name.wav"
          Write-Host ("  {0,-8} {1,-14} -> {2} ({3} bytes)" -f $loc, $form, $name, $bytes)
        } catch { Write-Warning "sapi $loc $form : $_" }
      }
    }
  } catch { Write-Warning "SAPI engine unavailable: $_" }
}

$manifest = Join-Path $Out 'manifest.tsv'
[System.IO.File]::WriteAllLines($manifest, $rows, (New-Object System.Text.UTF8Encoding($false)))
Write-Host ""
Write-Host "Wrote $($rows.Count - 1) rows and $manifest"
Write-Host "WAVs in $Out"
if (-not $NoUpload) { Write-Host "Uploaded to http://${HostAddr}:${Port}/" }
