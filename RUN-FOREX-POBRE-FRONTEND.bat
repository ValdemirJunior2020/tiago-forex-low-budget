@echo off
setlocal EnableExtensions
title Forex-Pobre Frontend Watchdog 24-7
cd /d "%~dp0"
if not exist logs mkdir logs
:loop
echo [%date% %time%] Iniciando frontend 5174 >> logs\frontend.log
call npm run dev:client >> logs\frontend.log 2>&1
echo [%date% %time%] Frontend parou; reiniciando em 10 segundos >> logs\frontend.log
timeout /t 10 /nobreak >nul
goto loop
