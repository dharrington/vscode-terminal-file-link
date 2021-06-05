# terminal-file-link README

Linkify more relative file paths in the terminal.

## Features

Configure a list of base paths. If a relative file path is output to the terminal, it will be
turned into a link.

For example, if your project's makefile outputs paths relative to /root/path/, add
this to your settings:
  
    terminalFileLink.baseDirectories = [
        "/root/path"
    ]
  
An example terminal session:

    > cd /some/other/path
    > make
    Building foo, entering /build/path
    Error in some/file.h:123
    >

Now 'some/file.h:123' becomes a link to '/root/path/some/file.h:123'

## Extension Settings

* `terminalFileLink.baseDirectories`: List of directories for which paths may be relative.
* `terminalFileLink.fileRegex`: Regex for identifying file paths.

## Release Notes

### 0.1.0

Initial release!

### 0.1.1

* Substitute ${workspaceFolder} if used in baseDirectories.
* Add fileRegex setting to customize file regex.
* Add some debug output.
