$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
$CandidatePythons = @(
  'C:\Users\12279\AppData\Local\Programs\Python\Python314\python.exe',
  'python'
)

$Python = $null
foreach ($candidate in $CandidatePythons) {
  if ($candidate -eq 'python') {
    try {
      $resolved = (Get-Command python -ErrorAction Stop).Source
      if ($resolved) {
        $Python = $resolved
        break
      }
    } catch {
      continue
    }
  } elseif (Test-Path $candidate) {
    $Python = $candidate
    break
  }
}

if (-not $Python) {
  throw 'No usable Python interpreter found. Please install Python or edit scripts/deploy_aliyun.ps1.'
}

& $Python (Join-Path $PSScriptRoot 'deploy_aliyun.py') @args
