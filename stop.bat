@echo off
echo 正在关闭实验室系统...
:: 强制结束所有 Python 进程 (Flask)
taskkill /f /im python.exe
:: 强制结束所有 SSH 进程 (隧道)
taskkill /f /im ssh.exe
echo 所有程序已退出。
pause