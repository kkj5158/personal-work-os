param([double]$FromX,[double]$FromY,[double]$ToX,[double]$ToY,[int]$ViewportWidth,[int]$ViewportHeight,[ValidateSet('LOCAL','DEV')][string]$QaEnvironment='LOCAL',[ValidateSet('drag','hold','release','inspect')][string]$Action='drag')
$ErrorActionPreference='Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @'
using System; using System.Runtime.InteropServices;
public static class WebV2Pointer {
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern void mouse_event(uint flags,uint dx,uint dy,uint data,UIntPtr extra);
}
'@
$team=Get-CimInstance Win32_Process -Filter 'ProcessId=45568'
if($team.ExecutablePath -ne 'C:\Program Files\Google\Chrome\Application\chrome.exe' -or $team.CommandLine -notlike '*--user-data-dir="C:\Users\JIUU\AppData\Local\Chrome-TEAM-KAFKA"*' -or $team.CommandLine -notlike '*--profile-directory="Default"*'){throw 'TEAM_PROCESS_IDENTITY_MISMATCH'}
$condition=New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::ProcessIdProperty,45568)
$windows=[Windows.Automation.AutomationElement]::RootElement.FindAll([Windows.Automation.TreeScope]::Children,$condition)
$qaWindows=@()
$qaUrlPattern=if($QaEnvironment -eq 'LOCAL'){'^(http://)?127\.0\.0\.1:13222/workflow/attention/?$'}else{'^(https://)?workflow-web-development-development\.up\.railway\.app/workflow/attention/?$'}
foreach($window in $windows){
 if($window.Current.Name -notlike '*Personal OS*'){continue}
 $edits=$window.FindAll([Windows.Automation.TreeScope]::Descendants,(New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::ControlTypeProperty,[Windows.Automation.ControlType]::Edit)))
 $verified=$false
 foreach($edit in $edits){if($edit.Current.Name -notmatch '주소창|Address and search bar'){continue};$value=$edit.GetCurrentPattern([Windows.Automation.ValuePattern]::Pattern).Current.Value;if($value -match $qaUrlPattern){$verified=$true}}
 if($verified){$qaWindows+=,$window}
}
if($qaWindows.Count -ne 1){throw ('OWNED_QA_WINDOW_NOT_UNIQUE:'+ $qaWindows.Count)}
$target=$qaWindows[0];$documents=$target.FindAll([Windows.Automation.TreeScope]::Descendants,(New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::ControlTypeProperty,[Windows.Automation.ControlType]::Document)))
$viewport=@($documents | Where-Object {$_.Current.BoundingRectangle.Width -gt 500 -and $_.Current.BoundingRectangle.Height -gt 200}) | Select-Object -First 1
if(-not $viewport){throw 'QA_VIEWPORT_NOT_VISIBLE'}
$rect=$viewport.Current.BoundingRectangle
if($Action -eq 'inspect'){[pscustomobject]@{windowHandle=$target.Current.NativeWindowHandle;name=$target.Current.Name;left=$rect.Left;top=$rect.Top;width=$rect.Width;height=$rect.Height};exit}
if([Math]::Abs($rect.Width-$ViewportWidth) -gt 4 -or [Math]::Abs($rect.Height-$ViewportHeight) -gt 4){throw 'QA_VIEWPORT_DIMENSIONS_CHANGED'}
if($Action -eq 'release'){[WebV2Pointer]::mouse_event(4,0,0,0,[UIntPtr]::Zero);exit}
foreach($point in @(@($FromX,$FromY),@($ToX,$ToY))){if($point[0] -lt 0 -or $point[0] -gt $ViewportWidth -or $point[1] -lt 0 -or $point[1] -gt $ViewportHeight){throw 'POINTER_OUTSIDE_VERIFIED_QA_VIEWPORT'}}
[void][WebV2Pointer]::SetForegroundWindow([IntPtr]$target.Current.NativeWindowHandle)
if([WebV2Pointer]::GetForegroundWindow() -ne [IntPtr]$target.Current.NativeWindowHandle){throw 'VERIFIED_QA_WINDOW_NOT_FOREGROUND'}
try {
 if($Action -eq 'release'){[WebV2Pointer]::mouse_event(4,0,0,0,[UIntPtr]::Zero);exit}
 [void][WebV2Pointer]::SetCursorPos([int]($rect.Left+$FromX),[int]($rect.Top+$FromY))
 [WebV2Pointer]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
 for($step=1;$step -le 20;$step++){[void][WebV2Pointer]::SetCursorPos([int]($rect.Left+$FromX+($ToX-$FromX)*$step/20),[int]($rect.Top+$FromY+($ToY-$FromY)*$step/20));Start-Sleep -Milliseconds 25}
}finally{if($Action -ne 'hold'){[WebV2Pointer]::mouse_event(4,0,0,0,[UIntPtr]::Zero)}}
Write-Output ('TRUSTED_POINTER_'+$Action.ToUpper()+'_IN_VERIFIED_TEAM_QA_WINDOW')
