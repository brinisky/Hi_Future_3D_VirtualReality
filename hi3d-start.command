#!/bin/zsh
cd -- "${0:A:h}" || exit 1
if ! command -v node >/dev/null 2>&1; then
  print '需要 Node.js 20 或更新版本。安装后请重新运行此启动文件。'
  read '?按回车关闭。'
  exit 1
fi
PORT=8767 node hi3d-server.mjs
read '?服务已停止。按回车关闭。'
