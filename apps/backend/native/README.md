# Linux zlib runtime

Nibrun ships glibc but not libz. The yt-dlp PyInstaller launcher requires libz.so.1.
This library is embedded in the app and copied to its private tools directory; subprocesses receive
that directory as LD_LIBRARY_PATH.

Source: https://deb.debian.org/debian/pool/main/z/zlib/zlib1g_1.3.dfsg+really1.3.1-1+b1_amd64.deb

The Debian copyright and zlib license are included in zlib-copyright.txt.
