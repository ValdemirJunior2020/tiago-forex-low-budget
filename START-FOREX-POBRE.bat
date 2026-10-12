@echo off
setlocal EnableExtensions
cd /d "%~dp0"
if /I "%~1"=="--frontend-watch" goto frontend_watch
title Forex-Pobre - ONE CLICK - OANDA Practice
if not exist "logs" mkdir "logs"
echo [FOREX-POBRE] Setup, build, Chrome e monitoramento em um BAT.
echo Tiago original: 5173/8790. Forex-Pobre: 5174/8791.
where node >nul 2>nul
if errorlevel 1 goto missing_node
where npm >nul 2>nul
if errorlevel 1 goto missing_node
if not exist ".env" (
 copy ".env.example" ".env" >nul
 echo [CONFIG] Edite .env com dados da sua NOVA conta OANDA Practice.
 echo [CONFIG] OANDA_ACCOUNT_ID, LOW_BUDGET_ALLOWED_ACCOUNT_ID e OANDA_API_TOKEN.
 echo [CONFIG] Para permitir ordens, veja as tres chaves de habilitacao no .env.
 echo [SEGURANCA] Nunca compartilhe o token. Execute este BAT novamente.
 pause
 exit /b 0
)
if not exist "node_modules" goto install
if not exist "server\node_modules\tsx" goto install
if not exist "client\node_modules\vite" goto install
echo [OK] Dependencias existentes.
goto verify
:install
echo [SETUP] Instalando dependencias ausentes...
call npm install
if errorlevel 1 goto failed
:verify
echo [BUILD] Conferindo build e testes...
call npm run verify
if errorlevel 1 goto failed
echo [OK] Build e testes passaram.
netstat -ano | findstr /R /C:":8791 .*LISTENING" >nul
if errorlevel 1 goto check_frontend
echo [CHECK] Porta 8791 ja ocupada. Conferindo Forex-Pobre...
powershell -NoProfile -Command "try { $h=Invoke-RestMethod -Uri 'http://127.0.0.1:8791/health' -TimeoutSec 4 -ErrorAction Stop; $r=Invoke-RestMethod -Uri 'http://127.0.0.1:8791/api/low-budget' -TimeoutSec 4 -ErrorAction Stop; if($h.practiceOnly -eq $true -and $h.brokerMode -eq 'DEMO' -and $r.source -eq 'OANDA_API' -and $r.budgetUsd -eq 1000){exit 0}else{exit 1} }catch{exit 1}"
if errorlevel 1 (
 echo [PARADO] Porta 8791 e de instancia antiga ou nao verificada.
 echo [SEGURANCA] Nao encerrarei nenhum processo automaticamente.
 netstat -ano | findstr /R /C:":8791 .*LISTENING"
 pause
 exit /b 1
)
echo [OK] Backend existente validado. Evitando duas instancias.
set "BACKEND_ALREADY_RUNNING=1"
:check_frontend
netstat -ano | findstr /R /C:":5174 .*LISTENING" >nul
if not errorlevel 1 goto open_chrome
echo [START] Frontend com watchdog usando ESTE MESMO BAT.
start "Forex-Pobre Frontend" /min "%ComSpec%" /c ""%~f0" --frontend-watch"
timeout /t 3 /nobreak >nul
:open_chrome
echo [CHROME] Abrindo Google Chrome diretamente...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$paths=@($env:ProgramFiles+'\Google\Chrome\Application\chrome.exe',[Environment]::GetEnvironmentVariable('ProgramFiles(x86)')+'\Google\Chrome\Application\chrome.exe',$env:LOCALAPPDATA+'\Google\Chrome\Application\chrome.exe'); $c=Get-Command chrome.exe -ErrorAction SilentlyContinue; if($c){$paths+=$c.Source}; foreach($k in @('HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe','HKLM:\Software\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe','HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe')){try{$paths+=(Get-Item -LiteralPath $k -ErrorAction Stop).GetValue('')}catch{}}; $chrome=$paths|Where-Object {$_ -and (Test-Path -LiteralPath $_ -PathType Leaf)}|Select-Object -First 1; if(-not $chrome){Write-Host '[AVISO] Chrome nao encontrado. Edge NAO sera aberto.';exit 2}; Start-Process -FilePath $chrome -ArgumentList @('--new-window','http://127.0.0.1:5174'); Write-Host ('[OK] Google Chrome: '+$chrome)"
if defined BACKEND_ALREADY_RUNNING exit /b 0
where ollama >nul 2>nul
if errorlevel 1 goto backend_watch
curl --max-time 2 -s http://127.0.0.1:11434/api/tags >nul 2>nul
if errorlevel 1 start "" /min ollama serve
:backend_watch
echo [RUNNING] Backend ativo. Deixe esta janela aberta.
:backend_loop
echo [%date% %time%] Backend iniciou >> "logs\backend.log"
call npm run dev:server >> "logs\backend.log" 2>&1
echo [%date% %time%] Backend parou, reiniciando em 10 segundos >> "logs\backend.log"
timeout /t 10 /nobreak >nul
goto backend_loop
:frontend_watch
title Forex-Pobre Frontend Watchdog
if not exist "logs" mkdir "logs"
:frontend_loop
echo [%date% %time%] Frontend iniciou >> "logs\frontend.log"
call npm run dev:client >> "logs\frontend.log" 2>&1
echo [%date% %time%] Frontend parou, reiniciando em 10 segundos >> "logs\frontend.log"
timeout /t 10 /nobreak >nul
goto frontend_loop
:missing_node
echo [ERRO] Instale Node.js 22 ou superior com npm.
pause
exit /b 1
:failed
echo [ERRO] Build ou testes falharam; backend nao iniciado.
pause
exit /b 1
