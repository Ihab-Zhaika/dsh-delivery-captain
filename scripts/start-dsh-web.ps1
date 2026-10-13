[CmdletBinding()]
param(
    [ValidateRange(1024, 65535)] [int] $Port = 3080
)

$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7 -or -not $IsWindows) {
    throw 'This background launcher requires PowerShell 7 on Windows.'
}
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$dshEntry = Join-Path $repositoryRoot 'node_modules/@deepseek-ai/dsh/lib/bin.js'
if (-not (Test-Path -LiteralPath $dshEntry -PathType Leaf)) {
    throw 'The repository DSH installation is missing. Restore its pinned dependencies first.'
}
$nodeExecutable = (Get-Command node.exe -CommandType Application | Select-Object -First 1).Source
$dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
$listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
if ($listeners.Count) {
    $listenerIds = @($listeners.OwningProcess | Sort-Object -Unique)
    if ($listenerIds.Count -ne 1) { throw "Port $Port has multiple owners; no process was changed." }
    $existingProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($listenerIds[0])"
    $expectedEntry = [regex]::Escape($dshEntry)
    if ($existingProcess.Name -ne 'node.exe' -or $existingProcess.CommandLine -notmatch $expectedEntry -or
        $existingProcess.CommandLine -notmatch '(?:"?--profile"?)\s+"?web(?:"|\s|$)') {
        throw "Port $Port is occupied by another process; it was not stopped or replaced."
    }
    [pscustomobject]@{ Status = 'Already running'; ProcessId = $existingProcess.ProcessId; Url = "http://127.0.0.1:$Port/" }
    return
}

$logDirectory = Join-Path $dshHome 'logs'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$launchStamp = Get-Date -Format 'yyyyMMdd-HHmmss-ffff'
$outputLog = Join-Path $logDirectory "darkingdoom-web-$launchStamp.stdout.log"
$errorLog = Join-Path $logDirectory "darkingdoom-web-$launchStamp.stderr.log"
$sdkRoot = Join-Path $dshHome 'toolchains/dotnet-10.0.112'
$previousDotnetRoot = $env:DOTNET_ROOT
$previousPath = $env:PATH
try {
    if (Test-Path -LiteralPath (Join-Path $sdkRoot 'dotnet.exe') -PathType Leaf) {
        $env:DOTNET_ROOT = $sdkRoot
        $env:PATH = "$sdkRoot;$previousPath"
    }
    # Start a separate hidden process, rather than an attached terminal job.
    # No secrets are passed on the command line; DSH loads its existing .env.
    $arguments = @('"' + $dshEntry + '"', '--profile', 'web', '--host', '127.0.0.1', '--port', "$Port", '--no-open')
    $hostProcess = Start-Process -FilePath $nodeExecutable -ArgumentList $arguments -WorkingDirectory $repositoryRoot `
        -WindowStyle Hidden -RedirectStandardOutput $outputLog -RedirectStandardError $errorLog -PassThru
} finally {
    $env:DOTNET_ROOT = $previousDotnetRoot
    $env:PATH = $previousPath
}

$deadline = [DateTime]::UtcNow.AddSeconds(25)
do {
    $hostProcess.Refresh()
    if ($hostProcess.HasExited) {
        throw "DSH exited with code $($hostProcess.ExitCode). Inspect the private logs: $outputLog and $errorLog"
    }
    $readyListeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
    if ($readyListeners.OwningProcess -contains $hostProcess.Id) {
        [pscustomobject]@{ Status = 'Started'; ProcessId = $hostProcess.Id; Url = "http://127.0.0.1:$Port/"; OutputLog = $outputLog; ErrorLog = $errorLog }
        return
    }
    Start-Sleep -Milliseconds 250
} while ([DateTime]::UtcNow -lt $deadline)
throw "DSH has not opened port $Port yet. Process $($hostProcess.Id) was preserved; inspect $errorLog."
