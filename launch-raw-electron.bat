@echo off
"c:\Users\sefa.ocakli\VulnAssesTool\node_modules\electron\dist\electron.exe" --disable-gpu --disable-software-rasterizer > "c:\Users\sefa.ocakli\VulnAssesTool\.errors\launch-stdout.txt" 2> "c:\Users\sefa.ocakli\VulnAssesTool\.errors\launch-stderr.txt"
echo Exit code: %ERRORLEVEL% >> "c:\Users\sefa.ocakli\VulnAssesTool\.errors\launch-stderr.txt"
