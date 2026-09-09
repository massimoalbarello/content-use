import type { PlaylistLink } from '@repo/backend/record';
import { Link } from '@tanstack/react-router';
import { ListVideo } from 'lucide-react';

export function PlaylistTags({ playlists }: { playlists: PlaylistLink[] }) {
  if (!playlists.length) {
    return null;
  }
  return (
    <nav className="mt-2 flex min-w-0 flex-wrap gap-1.5" aria-label="Playlists">
      {playlists.map((playlist) => (
        <Link
          key={playlist.id}
          to="/playlists/$id"
          params={{ id: playlist.id }}
          search={{ q: '', offset: 0 }}
          title={playlist.title}
          className="inline-flex max-w-full items-center gap-1 rounded-md bg-muted/70 px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ListVideo size={12} className="shrink-0" />
          <span className="truncate">{playlist.title}</span>
        </Link>
      ))}
    </nav>
  );
}
