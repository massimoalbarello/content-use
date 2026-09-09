# Content Use

[![Deploy on nibrun](https://nibrun.com/button.svg)](https://app.nibrun.com/deploy?name=content-use&binary=https%3A%2F%2Fgithub.com%2Fmassimoalbarello%2Fcontent-use%2Freleases%2Fdownload%2Fnibrun-latest%2Fcontent-use&port=3000&minimal)

A private library of videos and captions. Paste a public audio/video URL or YouTube playlist to
create searchable Markdown records with embedded playback and source captions. Playlists sync
hourly; bunqueue handles durable jobs and retries. Add a YouTube handle or channel URL in Accounts
to discover public playlists and select which ones to follow. Saved accounts can be renamed or
removed; removing an account preserves its playlists, hourly updates, and records. Sign in with a
passkey to manage your library.

Built using [Context Use](https://github.com/massimoalbarello/context-use) as the reference for
passkeys, repository structure, and engineering guidelines.

## Run locally

Install Bun (see `.bun-version`), yt-dlp, and FFmpeg, then:

```sh
bun install --frozen-lockfile
cp apps/backend/.env.example apps/backend/.env
bun run dev
```

Open [localhost:5173](http://localhost:5173). The first person to register a passkey owns the instance.

## Deploy on nibrun

Use the button above. It selects the `content-use` binary from the rolling `nibrun-latest`
pre-release, published after successful checks on `main`. No separate database or secrets are
required; app data and passkeys persist on nibrun's volume.

To build and deploy from source, install the [nibrun CLI](https://github.com/ilbertt/nibrun), then:

```sh
nib login
bun run deploy:nibrun
```

The deploy script remembers the app slug in `.nibrun.json` and reuses it on subsequent deployments.
YouTube uses embeds and [FreeTranscriptAPI](https://freetranscriptapi.com/docs) captions. Other
supported sources use yt-dlp. Sources without captions remain available to watch.
