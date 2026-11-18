@echo off
setlocal
set "CODEX_HOME=F:\pro\extends-ai\apps\chatgpt-web-provider\dev\dist\codex-home"
set "WORKSPACE=F:\pro\extends-ai\apps\openai-v1-responses"
if exist "%LOCALAPPDATA%\Programs\Microsoft VS Code\Code.exe" (
    start "" "%LOCALAPPDATA%\Programs\Microsoft VS Code\Code.exe" --new-window "%WORKSPACE%"
    exit /b 0
)
if exist "C:\Program Files\Microsoft VS Code\Code.exe" (
    start "" "C:\Program Files\Microsoft VS Code\Code.exe" --new-window "%WORKSPACE%"
    exit /b 0
)
echo 找不到 Visual Studio Code，请先安装 VS Code。
exit /b 1