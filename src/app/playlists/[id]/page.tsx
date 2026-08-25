"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  GripVertical,
  ListMusic,
  Pencil,
  Search,
  Sparkles,
  StickyNote,
  Trash2,
} from "lucide-react";

import { Artwork } from "@/components/media/artwork";
import { MediaGrid } from "@/components/media/cards";
import { useCollections } from "@/components/providers/collections";
import { useToast } from "@/components/providers/toast";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
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
import { accentColor, mediaMeta, pluralise, relativeTime } from "@/lib/format";
import { useDebounced } from "@/lib/hooks";
import type { DiscoveryResponse, PlaylistDto, PlaylistItemDto, ScoredMedia } from "@/lib/types";

export default function PlaylistDetailPage() {
  return <PlaylistDetail />;
}

function PlaylistDetail() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { invalidate } = useCollections();

  const [playlist, setPlaylist] = useState<PlaylistDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search, 250);

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [noteFor, setNoteFor] = useState<PlaylistItemDto | null>(null);
  const [noteText, setNoteText] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);

  const [similar, setSimilar] = useState<ScoredMedia[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);

  const load = useCallback(async () => {
    if (!params?.id) return;
    setLoading(true);
    setError(null);
    try {
      const query = debounced.trim() ? `?q=${encodeURIComponent(debounced.trim())}` : "";
      const data = await api.get<{ playlist: PlaylistDto }>(`/api/playlists/${params.id}${query}`);
      setPlaylist(data.playlist);
      setName(data.playlist.name);
      setDescription(data.playlist.description);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [params?.id, debounced]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = useMemo(() => playlist?.items ?? [], [playlist]);

  /** "More like this playlist" — a genuine use of the similarity endpoint. */
  const loadSimilar = useCallback(async () => {
    const seed = items[0];
    if (!seed?.mediaId) return;
    setSimilarLoading(true);
    try {
      const data = await api.get<{ items: ScoredMedia[] }>(
        `/api/music/${encodeURIComponent(seed.mediaId)}/similar?limit=12`,
      );
      const existing = new Set(items.map((item) => item.mediaId));
      setSimilar(data.items.filter((item) => !existing.has(item.id)));
    } catch (requestError) {
      toast.error("Couldn't find similar tracks", errorMessage(requestError));
    } finally {
      setSimilarLoading(false);
    }
  }, [items, toast]);

  const mutate = async (fn: () => Promise<{ playlist: PlaylistDto }>, message?: string) => {
    setBusy(true);
    try {
      const data = await fn();
      setPlaylist(data.playlist);
      invalidate();
      if (message) toast.success(message);
    } catch (requestError) {
      toast.error("That didn't work", errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  const move = (itemId: string, direction: -1 | 1) => {
    const index = items.findIndex((item) => item.id === itemId);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= items.length) return;
    void mutate(() =>
      api.put<{ playlist: PlaylistDto }>(`/api/playlists/${params.id}/items/${itemId}`, {
        position: target,
      }),
    );
  };

  const dropOn = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const order = items.map((item) => item.id);
    const from = order.indexOf(dragId);
    const to = order.indexOf(targetId);
    if (from === -1 || to === -1) return;
    order.splice(to, 0, ...order.splice(from, 1));
    setDragId(null);
    void mutate(() =>
      api.put<{ playlist: PlaylistDto }>(`/api/playlists/${params.id}/items`, { itemIds: order }),
    );
  };

  if (loading && !playlist) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-28 w-full" />
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (error && !playlist) {
    return (
      <div className="space-y-4">
        <BackLink />
        <ErrorState message={error} onRetry={() => void load()} />
      </div>
    );
  }

  if (!playlist) return null;

  return (
    <div className="space-y-6">
      <BackLink />

      {/* Header --------------------------------------------------------- */}
      <header className="flex flex-wrap items-start gap-4">
        <div
          className="grid h-24 w-24 shrink-0 grid-cols-2 grid-rows-2 overflow-hidden rounded-xl"
          style={{ backgroundColor: accentColor(playlist.accent) }}
        >
          {(playlist.preview ?? []).length > 0 ? (
            (playlist.preview ?? []).slice(0, 4).map((media) => (
              <span key={media.id} className="h-full w-full">
                <Artwork media={media} rounded="rounded-none" showIcon={false} />
              </span>
            ))
          ) : (
            <span className="col-span-2 row-span-2 flex items-center justify-center text-white">
              <ListMusic className="h-8 w-8" aria-hidden />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">{playlist.name}</h1>
            {playlist.source !== "MANUAL" ? <Badge tone="accent">AI generated</Badge> : null}
          </div>
          {playlist.description ? (
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">{playlist.description}</p>
          ) : null}
          <p className="mt-1.5 text-xs text-subtle">
            {pluralise(playlist.itemCount, "track")} · updated {relativeTime(playlist.updatedAt)}
            {playlist.seedQuery ? ` · from “${playlist.seedQuery}”` : ""}
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            Edit
          </Button>
          <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            Delete
          </Button>
        </div>
      </header>

      {/* Search within -------------------------------------------------- */}
      {playlist.itemCount > 4 ? (
        <div className="relative max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search within this playlist"
            aria-label="Search within this playlist"
            className="pl-9"
          />
        </div>
      ) : null}

      {/* Items ---------------------------------------------------------- */}
      {items.length === 0 ? (
        <EmptyState
          icon={ListMusic}
          title={debounced ? "Nothing matches that" : "This playlist is empty"}
          description={
            debounced
              ? "Try a different search."
              : "Find music you like and use Save to add it here."
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
        <ol className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {items.map((item, index) => (
            <li
              key={item.id}
              draggable
              onDragStart={() => setDragId(item.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => dropOn(item.id)}
              onDragEnd={() => setDragId(null)}
              className={`group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-hover ${
                dragId === item.id ? "opacity-50" : ""
              }`}
            >
              <span className="hidden cursor-grab text-subtle sm:block" aria-hidden>
                <GripVertical className="h-4 w-4" />
              </span>
              <span className="w-5 shrink-0 text-right text-xs tabular-nums text-subtle">{index + 1}</span>
              <span className="h-11 w-11 shrink-0 overflow-hidden rounded-md">
                <Artwork media={item.media} rounded="rounded-md" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{item.media.title}</span>
                <span className="block truncate text-xs text-muted">{mediaMeta(item.media)}</span>
                {item.note ? (
                  <span className="mt-1 block truncate text-xs italic text-subtle">“{item.note}”</span>
                ) : null}
              </span>

              <span className="flex shrink-0 items-center gap-1">
                <IconButton
                  label={`Move ${item.media.title} up`}
                  disabled={index === 0 || busy}
                  onClick={() => move(item.id, -1)}
                >
                  <ChevronUp className="h-4 w-4" />
                </IconButton>
                <IconButton
                  label={`Move ${item.media.title} down`}
                  disabled={index === items.length - 1 || busy}
                  onClick={() => move(item.id, 1)}
                >
                  <ChevronDown className="h-4 w-4" />
                </IconButton>
                <IconButton
                  label={`Add a note to ${item.media.title}`}
                  onClick={() => {
                    setNoteFor(item);
                    setNoteText(item.note ?? "");
                  }}
                >
                  <StickyNote className="h-4 w-4" />
                </IconButton>
                <IconButton
                  label={`Remove ${item.media.title}`}
                  danger
                  disabled={busy}
                  onClick={() =>
                    void mutate(
                      () =>
                        api.del<{ playlist: PlaylistDto }>(
                          `/api/playlists/${params.id}/items/${item.id}`,
                        ),
                      "Removed from playlist",
                    )
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </span>
            </li>
          ))}
        </ol>
      )}

      {/* More like this -------------------------------------------------- */}
      {items.length > 0 ? (
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-ink">More like this</h2>
            <Button variant="secondary" size="sm" loading={similarLoading} onClick={() => void loadSimilar()}>
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              {similar.length ? "Refresh" : "Find similar tracks"}
            </Button>
          </div>
          {similar.length > 0 ? <MediaGrid items={similar} /> : null}
        </section>
      ) : null}

      {/* Edit ----------------------------------------------------------- */}
      <Dialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit playlist"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!name.trim()}
              onClick={async () => {
                await mutate(
                  () =>
                    api.put<{ playlist: PlaylistDto }>(`/api/playlists/${params.id}`, {
                      name: name.trim(),
                      description: description.trim(),
                    }),
                  "Playlist updated",
                );
                setEditOpen(false);
              }}
            >
              Save changes
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name" htmlFor="edit-name" required>
            <Input id="edit-name" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="Description" htmlFor="edit-description">
            <Textarea
              id="edit-description"
              rows={3}
              maxLength={500}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
        </div>
      </Dialog>

      {/* Note ------------------------------------------------------------ */}
      <Dialog
        open={Boolean(noteFor)}
        onClose={() => setNoteFor(null)}
        title="Note"
        description={noteFor?.media.title}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setNoteFor(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={busy}
              onClick={async () => {
                if (!noteFor) return;
                await mutate(
                  () =>
                    api.put<{ playlist: PlaylistDto }>(
                      `/api/playlists/${params.id}/items/${noteFor.id}`,
                      { note: noteText.trim() || null },
                    ),
                  "Note saved",
                );
                setNoteFor(null);
              }}
            >
              Save note
            </Button>
          </>
        }
      >
        <Textarea
          rows={3}
          maxLength={500}
          autoFocus
          value={noteText}
          placeholder="Why this one made the cut…"
          onChange={(event) => setNoteText(event.target.value)}
        />
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await api.del(`/api/playlists/${params.id}`);
            toast.success("Playlist deleted", playlist.name);
            invalidate();
            router.push("/playlists");
          } catch (requestError) {
            toast.error("Couldn't delete that", errorMessage(requestError));
            setBusy(false);
          }
        }}
        title="Delete this playlist?"
        message={`“${playlist.name}” and its ${pluralise(playlist.itemCount, "track")} will be removed. This can't be undone.`}
        loading={busy}
      />
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/playlists"
      className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      All playlists
    </Link>
  );
}

function IconButton({
  children,
  label,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`rounded-md p-1.5 transition-colors disabled:opacity-30 ${
        danger ? "text-subtle hover:bg-danger-soft hover:text-danger" : "text-subtle hover:bg-surface hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
