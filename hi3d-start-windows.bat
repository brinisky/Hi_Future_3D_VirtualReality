@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
if errorlevel 1 goto folder_error
where node >nul 2>&1
if errorlevel 1 goto missing_node
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 20 ? 0 : 1)"
if errorlevel 1 goto old_node
if not exist "hi3d-server.mjs" goto missing_files
if not exist "hi3d-index.html" goto missing_files
if not exist "assets\hi3d-assistant-natural-near.glb" goto missing_files
if not exist "assets\hi3d-assistant-natural-far.glb" goto missing_files
set "PORT=8767"
echo.
echo NOVA 游戏正在启动。
echo 服务启动后，请用 Chrome 或 Edge 打开：
echo http://127.0.0.1:8767/hi3d-index.html
echo 请保持此窗口打开。关闭窗口会停止游戏和 AI 服务。
echo API Key 请在游戏设置页中填写，不要输入到此窗口。
echo.
node "hi3d-server.mjs"
echo.
echo 服务已停止。如提示端口占用，请先关闭旧版 NOVA 启动窗口。
pause
exit /b

:missing_node
echo 尚未找到 Node.js。请从 https://nodejs.org 安装 LTS 版本后重新启动。
pause
exit /b 1

:old_node
echo 需要 Node.js 20 或更新版本。请安装当前 LTS 版本后重新启动。
pause
exit /b 1

:missing_files
echo 游戏文件不完整。请完整解压 ZIP 后运行，不要只复制此启动文件。
pause
exit /b 1

:folder_error
echo 无法进入游戏目录。请将整套游戏解压到本机普通文件夹后重试。
pause
exit /b 1
