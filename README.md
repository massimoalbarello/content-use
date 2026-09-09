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

## Summaries with utilint

In **Settings → utilint**, register Content Use in your Utilint developer dashboard using the
callback and connection start URLs shown in Settings. The consent URL in Utilint’s dashboard runs
the real connection, including returning after passkey login. Paste the client ID and one-time
client secret, then save.
Developer setup is hidden once connected; disconnect to change the app configuration.
The default Utilint instance is `https://utilint-crrxrd.nibrun.app`; it can be changed for another
self-hosted instance or localhost development.

Click **Summarize** beside a dashboard record or on its record page. If needed, a Utilint popup
walks through passkey signup, connecting ChatGPT, and authorizing Content Use. The summary starts
when the popup finishes. If popups are blocked, the flow opens in the current tab; return to the
record and click Summarize. Returning users skip completed steps and see an already-authorized
message. The transcript and generated summary are private to the Content Use owner.

The backend exchanges the authorization code using oauth4webapi, validates state and issuer,
and stores the client secret and user tokens with authenticated encryption derived from the
instance's existing auth secret. No Utilint token is returned to the browser. Pending flows are
session-bound, single-use, and expire after 10 minutes (or a server restart). Refreshes serialize
and rotate the stored token. Provider revocation clears the local connection and requires
reconnecting; **Manage app access** opens Utilint's revocation dashboard.

Summaries are stored separately from captions, are invalidated when captions change, and are
removed with their record. Saved summaries show a green **Summarized** check. Repeated requests
return the saved summary without another model call, even after a restart or disconnect. One
generation per record can run at a time. Requests are not retried
automatically. This version supports transcripts up to 120 KB and uses the first available model
from the user's Utilint model catalog, with a 1,500-token output target. A subscription request is
subject to the user's ChatGPT allowance and availability; there is no paid API fallback.

Content Use's auth cookie now has its own prefix so local apps on different ports cannot replace
one another's sessions. Existing installations may require one sign-in after this update; their
passkeys and library are preserved.
