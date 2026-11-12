@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\desktop.ps1" -Task run
if errorlevel 1 pause
