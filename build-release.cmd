@echo off
setlocal
pushd "%~dp0" || exit /b 1

call npm run check
if errorlevel 1 goto :failed

call npm run build -- --mode release
if errorlevel 1 goto :failed

tar.exe -a -cf "dist-release\baron-boomhausen.zip" -C "dist-release" index.html assets zzfx-license.txt
if errorlevel 1 goto :failed

move /y "dist-release\baron-boomhausen.zip" "baron-boomhausen.zip" >nul
if errorlevel 1 goto :failed

echo Release ready: baron-boomhausen.zip
popd
exit /b 0

:failed
popd
exit /b 1
