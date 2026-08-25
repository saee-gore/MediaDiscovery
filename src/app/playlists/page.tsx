"use client";

import { useState } from "react";
import Link from "next/link";
import { ListMusic, Plus, Search, Sparkles } from "lucide-react";

import { Artwork } from "@/components/media/artwork";
import { useCollections } from "@/components/providers/collections";
import { useToast } from "@/components/providers/toast";
import { Dialog } from "@/components/ui/dialog";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Skeleton,
  Textarea,
} from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api";
import { accentColor, pluralise, relativeTime } from "@/lib/format";
import { useDebounced, useResource } from "@/lib/hooks";
import type { PlaylistDto } from "@/lib/types";

export default function PlaylistsPage() {
  return <PlaylistsView />;
}

function PlaylistsView() {
  const toast = useToast();
  const { version, invalidate } = useCollections();
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search, 250);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const query = debounced.trim() ? `?q=${encodeURIComponent(debounced.trim())}` : "";
  const { data, loading, error, reload } = useResource<{ playlists: PlaylistDto[] }>(
    `/api/playlists${query}`,
    [version],
  );

  const create = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const result = await api.post<{ playlist: PlaylistDto }>("/api/playlists", {
        name: name.trim(),
        description: description.trim(),
      });
      toast.success("Playlist created", result.playlist.name);
      setCreateOpen(false);
      setName("");
      setDescription("");
      invalidate();
      reload();
    } catch (requestError) {
      toast.error("Couldn't create that playlist", errorMessage(requestError));
    } finally {
      setCreating(false);
    }
  };

  const playlists = data?.playlists ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-ink">
            <ListMusic className="h-6 w-6 text-accent" aria-hidden />
            My playlists
          </h1>
          <p className="mt-1 text-sm text-muted">
            {playlists.length ? pluralise(playlists.length, "playlist") : "Nothing saved yet"}
          </p>
        </div>
        <Button variant="primary" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          New playlist
        </Button>
      </header>

      <div className="relative max-w-sm">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
          aria-hidden
        />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search your playlists"
          aria-label="Search your playlists"
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-36 w-full" />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : playlists.length === 0 ? (
        <EmptyState
          icon={ListMusic}
          title={debounced ? "No playlists match that" : "No playlists yet"}
          description={
            debounced
              ? "Try a different name."
              : "Search for music you like, then save the results as a playlist."
          }
          action={
            debounced ? null : (
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text transition-colors hover:bg-accent-hover"
              >
                <Sparkles className="h-4 w-4" aria-hidden />
                Discover music
              </Link>
            )
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {playlists.map((playlist) => (
            <PlaylistCard key={playlist.id} playlist={playlist} />
          ))}
        </div>
      )}

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New playlist"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={creating} disabled={!name.trim()} onClick={() => void create()}>
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name" htmlFor="new-playlist-name" required>
            <Input
              id="new-playlist-name"
              autoFocus
              value={name}
              maxLength={80}
              placeholder="Late Night Drive"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && name.trim()) void create();
              }}
            />
          </Field>
          <Field label="Description" htmlFor="new-playlist-description" hint="Optional.">
            <Textarea
              id="new-playlist-description"
              rows={2}
              maxLength={500}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
        </div>
      </Dialog>
    </div>
  );
}

function PlaylistCard({ playlist }: { playlist: PlaylistDto }) {
  const preview = playlist.preview ?? [];
  return (
    <Link
      href={`/playlists/${playlist.id}`}
      className="group flex flex-col gap-3 rounded-xl border border-line bg-surface p-3 transition-colors hover:border-line-strong hover:bg-surface-hover"
    >
      <div className="flex items-center gap-2">
        <div
          className="grid h-16 w-16 shrink-0 grid-cols-2 grid-rows-2 overflow-hidden rounded-lg"
          style={{ backgroundColor: accentColor(playlist.accent) }}
        >
          {preview.length > 0 ? (
            preview.slice(0, 4).map((media) => (
              <span key={media.id} className="h-full w-full">
                <Artwork media={media} rounded="rounded-none" showIcon={false} />
              </span>
            ))
          ) : (
            <span className="col-span-2 row-span-2 flex items-center justify-center text-white">
              <ListMusic className="h-6 w-6" aria-hidden />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="min-w-0 truncate text-sm font-semibold text-ink">{playlist.name}</h2>
            {playlist.source !== "MANUAL" ? <Badge tone="accent">AI</Badge> : null}
          </div>
          <p className="mt-0.5 text-xs text-muted">{pluralise(playlist.itemCount, "track")}</p>
          <p className="mt-0.5 text-[11px] text-subtle">Updated {relativeTime(playlist.updatedAt)}</p>
        </div>
      </div>

      {playlist.description ? (
        <p className="line-clamp-2 text-xs leading-relaxed text-muted">{playlist.description}</p>
      ) : null}
    </Link>
  );
}
