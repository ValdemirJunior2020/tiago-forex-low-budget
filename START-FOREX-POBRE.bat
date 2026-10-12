@echo off
setlocal EnableExtensions
title Forex-Pobre - OANDA Practice LOW BUDGET
cd /d "%~dp0"
if not exist logs mkdir logs

where node >nul 2>nul
if errorlevel 1 (
 echo [ERRO] Instale Node.js 22 ou superior.
 pause
 exit /b 1
)
if not exist .env (
 copy .env.example .env >nul
 echo [ACAO NECESSARIA] Edite .env com a nova conta OANDA PRACTICE.
 echo Configure OANDA_ACCOUNT_ID, LOW_BUDGET_ALLOWED_ACCOUNT_ID e OANDA_API_TOKEN.
 echo Nao cole token no GitHub nem no chat. Inicie este arquivo novamente.
 pause
 exit /b 0
)
echo.
echo ===========================================
echo     FOREX-POBRE - OANDA FIRST - USD 1000
echo ===========================================
echo Original Tiago: nao modificado, portas 5173 e 8790.
echo Forex-Pobre: web 5174 / API 8791.
echo.
echo Instalando e conferindo dependencias...
call npm install
if errorlevel 1 goto failed
call npm run verify
if errorlevel 1 goto failed

netstat -ano | findstr ":8791" | findstr "LISTENING" >nul
if not errorlevel 1 (
 echo [PARADO] Porta 8791 ocupada; nao iniciaremos um segundo backend.
 pause
 exit /b 1
)
netstat -ano | findstr ":5174" | findstr "LISTENING" >nul
if not errorlevel 1 (
 echo [PARADO] Porta 5174 ocupada; confira os processos antes de iniciar.
 pause
 exit /b 1
)

where ollama >nul 2>nul
if not errorlevel 1 (
 curl --max-time 2 -s http://127.0.0.1:11434/api/tags >nul 2>nul
 if errorlevel 1 start "" /min ollama serve
)
echo Abrindo painel Forex-Pobre...
start "Forex-Pobre Frontend 24-7" /min cmd /c ""%~dp0RUN-FOREX-POBRE-FRONTEND.bat""
timeout /t 3 /nobreak >nul
set "CHROME="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if defined CHROME (
 echo Abrindo especificamente no Google Chrome...
 start "" "%CHROME%" --new-window "http://127.0.0.1:5174"
) else (
 echo [AVISO] Google Chrome nao encontrado. Abra manualmente http://127.0.0.1:5174
 echo [AVISO] O Edge NAO sera aberto automaticamente.
)

:loop
echo [%date% %time%] Backend iniciado >> logs\backend.log
call npm run dev:server >> logs\backend.log 2>&1
echo [%date% %time%] Backend finalizado; reiniciando em 10s >> logs\backend.log
timeout /t 10 /nobreak >nul
goto loop

:failed
echo [ERRO] Build/teste falhou. Nenhum bot iniciado.
pause
exit /b 1
