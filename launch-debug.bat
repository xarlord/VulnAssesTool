@echo off
"c:\Users\sefa.ocakli\VulnAssesTool\release\win-unpacked\VulnAssessTool.exe" > "c:\Users\sefa.ocakli\VulnAssesTool\.errors\launch-stdout.txt" 2> "c:\Users\sefa.ocakli\VulnAssesTool\.errors\launch-stderr.txt"
echo Exit code: %ERRORLEVEL% >> "c:\Users\sefa.ocakli\VulnAssesTool\.errors\launch-stderr.txt"
