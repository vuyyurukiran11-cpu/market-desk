Option Explicit

Dim shell, files, projectDir
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
projectDir = files.GetParentFolderName(WScript.ScriptFullName)

shell.CurrentDirectory = projectDir
shell.Run "cmd.exe /c node open.js", 0, False
