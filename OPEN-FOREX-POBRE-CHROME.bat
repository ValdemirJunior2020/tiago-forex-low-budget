@echo off
setlocal EnableExtensions
set "CHROME="
for /f "usebackq delims=" %%I in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$paths=@($env:ProgramFiles+'\Google\Chrome\Application\chrome.exe',${env:ProgramFiles(x86)}+'\Google\Chrome\Application\chrome.exe',$env:LOCALAPPDATA+'\Google\Chrome\Application\chrome.exe'); $cmd=Get-Command chrome.exe -ErrorAction SilentlyContinue; if($cmd){$paths+= $cmd.Source}; foreach($root in @('HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe','HKLM:\Software\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe','HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe')){try{$paths+=(Get-Item -LiteralPath $root -ErrorAction Stop).GetValue('')}catch{}}; foreach($p in $paths){if($p -and (Test-Path -LiteralPath $p -PathType Leaf)){Write-Output $p;break}}" `) do if not defined CHROME set "CHROME=%%I"
if not defined CHROME (
 echo [ERRO] Google Chrome nao localizado. Edge nao sera aberto.
 echo Instale o Google Chrome ou informe onde esta chrome.exe.
 exit /b 2
)
echo [CHROME] "%CHROME%"
start "" "%CHROME%" --new-window "http://127.0.0.1:5174"
exit /b %errorlevel%
