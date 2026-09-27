@echo off
title LeStitcheur Control
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop.ps1"
if errorlevel 1 pause
