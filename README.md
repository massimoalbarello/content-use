# Content Use

[![Deploy on nibrun](https://nibrun.com/button.svg)](https://app.nibrun.com/deploy?name=content-use&binary=https%3A%2F%2Fgithub.com%2Fmassimoalbarello%2Fcontent-use%2Freleases%2Fdownload%2Fnibrun-latest%2Fcontent-use&port=3000&minimal)

A private library of videos and searchable captions. Add audio/video URLs, follow YouTube
channels and playlists, and sign in with a passkey.

Click **Summarize** to use your ChatGPT subscription through [Utilint](https://utilint.com).
No developer setup needed. Hosts can override the default URL with `UTILINT_URL`.

## Run locally

Install Bun (see `.bun-version`), yt-dlp, and FFmpeg, then:

```sh
bun install --frozen-lockfile
cp apps/backend/.env.example apps/backend/.env
bun run dev
```

Open [localhost:5173](http://localhost:5173). The first passkey user owns the instance.

## Deploy

Use the nibrun button above, or install the [nibrun CLI](https://github.com/ilbertt/nibrun) and run:

```sh
nib login
bun run deploy:nibrun
```

App data and passkeys persist across nibrun deployments.
