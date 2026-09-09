import { resolve } from 'node:path';
import { createApp } from './app';
import { assets } from './assets.gen';
import { createSqliteDatabase } from './db/client';
import { migrate } from './db/migrate';
import { loadAuthSecret } from './lib/auth/auth-secret';
import { createAuth } from './lib/auth/better-auth';
import { YoutubeAccounts } from './lib/media/accounts';
import { HostedCaptions } from './lib/media/hosted-captions';
import { MediaPipeline } from './lib/media/pipeline';
import { YoutubePlaylists } from './lib/media/playlists';
import { validatePublicUrl } from './lib/media/public-url';
import { SqliteAccountsRepository } from './repositories/accounts/repository';
import { SqliteCaptionQuota } from './repositories/jobs/quota';
import { SqliteJobsRepository } from './repositories/jobs/repository';
import { SqliteOwnerRegistrationRepository } from './repositories/owner-registration/repository';
import { SqlitePlaylistsRepository } from './repositories/playlists/repository';
import { SqliteRecordsRepository } from './repositories/records/repository';
import { AccountsService } from './services/accounts/service';
import { RecordProcessor } from './services/jobs/processor';
import { JobWorker } from './services/jobs/worker';
import { OwnerRegistrationService } from './services/owner-registration/service';
import { PlaylistsService } from './services/playlists/service';
import { RecordsService } from './services/records/service';

const dataFolder = resolve(process.env.NIBRUN_DATA_DIR ?? process.env.DATA_FOLDER ?? './data');
const port = Number(process.env.PORT ?? 3000);
const origin = process.env.NIBRUN_HOSTNAME
  ? `https://${process.env.NIBRUN_HOSTNAME}`
  : (process.env.BASE_URL ?? 'http://localhost:5173');
const database = await createSqliteDatabase({ dataFolder });
await migrate(database);
const secret = await loadAuthSecret({
  dataFolder,
  environmentSecret: process.env.BETTER_AUTH_SECRET,
});
const auth = createAuth({ database, baseUrl: new URL(origin), secret: secret.value });
const repository = new SqliteRecordsRepository(database);
const hostedCaptions = new HostedCaptions(
  process.env.FREETRANSCRIPT_API_KEY,
  fetch,
  new SqliteCaptionQuota(database, Number(process.env.CAPTION_HOURLY_LIMIT ?? 50)),
);
const pipeline = new MediaPipeline(dataFolder, hostedCaptions);
const playlistRepository = new SqlitePlaylistsRepository(database);
const playlistDiscovery = new YoutubePlaylists(pipeline, dataFolder);
const jobs = new JobWorker(
  repository,
  new SqliteJobsRepository(database),
  new RecordProcessor(repository, pipeline),
  playlistRepository,
  playlistDiscovery,
);
const playlists = new PlaylistsService(playlistRepository, jobs, playlistDiscovery);
const accounts = new AccountsService(
  new SqliteAccountsRepository(database),
  playlistRepository,
  new YoutubeAccounts(pipeline, dataFolder),
  jobs,
);
const records = new RecordsService(repository, jobs, validatePublicUrl);
const registration = new OwnerRegistrationService(new SqliteOwnerRegistrationRepository(database));
void pipeline
  .prepare()
  .then(() => console.log('Media tools ready: yt-dlp and FFmpeg verified.'))
  .catch((error) =>
    console.error(
      'Media tools setup will retry on the next record:',
      error instanceof Error ? error.message : 'Unknown error',
    ),
  );
await jobs.start(dataFolder);
const app = createApp({ auth, records, registration, playlists, accounts, origin, assets }).listen({
  hostname: '0.0.0.0',
  port,
});

console.log(`Content Use listening on ${port}`);
let stopping = false;
async function shutdown() {
  if (stopping) {
    return;
  }
  stopping = true;
  await jobs.stop();
  await app.stop();
  await database.close();
  process.exit(0);
}
process.on('SIGTERM', () => {
  void shutdown();
});
process.on('SIGINT', () => {
  void shutdown();
});
