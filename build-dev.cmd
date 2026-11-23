@echo off
setlocal
pushd "%~dp0" || exit /b 1

call npm run check
if errorlevel 1 goto :done

call npm run build -- --mode debug

:done
set "build_status=%errorlevel%"
if "%build_status%"=="0" echo Debug build ready: dist
popd
exit /b %build_status%
