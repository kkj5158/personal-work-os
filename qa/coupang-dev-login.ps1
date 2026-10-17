#requires -Version 7.0
# Compatibility entry point. Sessions are scoped to one validated workflow.
[CmdletBinding()]
param([ValidateSet('Validate','CleanupDryRun','Closeout')][string] $Workflow = 'Validate')
& (Join-Path $PSScriptRoot 'Invoke-CoupangDevSession.ps1') -Workflow $Workflow
