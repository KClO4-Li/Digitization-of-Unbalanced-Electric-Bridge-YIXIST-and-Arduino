Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd.exe /c python d:\Workshop\AAA学科与课程\物创II\ctrl\app.py", 0
WshShell.Run "cmd.exe /c ssh -N -R 5005:127.0.0.1:5000 LRX@liclo4.southeastasia.cloudapp.azure.com", 0