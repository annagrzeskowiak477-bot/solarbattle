@echo off
chcp 65001 >nul
title SOLAR DUEL - PROTOTYP FPS
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo [BLAD] Nie wykryto Node.js. Zainstaluj go z https://nodejs.org/
 pause
 exit /b 1
)
if not exist "node_modules\ws" (
 echo Instalowanie bibliotek (wymagany Internet)...
 call npm install
 if errorlevel 1 (
   echo [BLAD] Nie udalo sie zainstalowac bibliotek.
   pause
   exit /b 1
 )
)
echo.
echo SOLAR DUEL: otworz http://localhost:3000
 echo Aby grac ze znajomym z innej sieci, przeczytaj README_PL.md
 echo.
call npm start
pause
