@echo off
setlocal
pushd "%~dp0" || exit /b 1

call npm run dev -- --open "/?debug=1"
set "dev_status=%errorlevel%"
popd
exit /b %dev_status%
