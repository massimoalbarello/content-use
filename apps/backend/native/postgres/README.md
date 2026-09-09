# PostgreSQL initialization on nibrun

nibrun provides glibc and an unprivileged user but no `/bin/sh`. PostgreSQL's `initdb`
uses `popen()` for its version probe and bootstrap process. `popen.c` substitutes a
bundled shell for these calls. It is preloaded **only into initdb**, never the app
or running database. The child inherits it during bootstrap. Only one popen stream
is supported, matching initdb's sequential bootstrap operations.

Rebuild the x86_64 Linux adapter with a Linux compiler:

```sh
cc -shared -fPIC -O2 popen.c -o initdb-shell.so
```

`busybox` is the upstream static x86_64 binary from
https://busybox.net/downloads/binaries/1.35.0-x86_64-linux-musl/busybox
(SHA-256 `6e123e7f3202a8c1e9b1f94d8941580a25135382b99e8d3e34fb858bba311348`).
BusyBox is licensed under GPL-2.0. Its corresponding source release is
https://busybox.net/downloads/busybox-1.35.0.tar.bz2 . Preserve the license and source availability
when distributing this binary.

The PostgreSQL runtime is fetched from the pinned `@embedded-postgres/linux-x64`
18.4.0-beta.17 package and verified against a SHA-256 checksum in `db/postgres.ts`.
That package retains its native files and license metadata on the app volume.
PostgreSQL uses its own license; the package wrapper is MIT-licensed.
