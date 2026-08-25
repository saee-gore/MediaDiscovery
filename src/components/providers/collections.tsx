"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Check, ListMusic, Plus, Popcorn } from "lucide-react";

import { useToast } from "@/components/providers/toast";
import { Dialog } from "@/components/ui/dialog";
import { Button, Field, Input, Spinner, Textarea } from "@/components/ui/primitives";
import { api, errorMessage, isApiError } from "@/lib/api";
import { cx, pluralise } from "@/lib/format";
import type { BucketListDto, MediaSummary, PlaylistDto } from "@/lib/types";

interface CollectionsApi {
  /** Open the save sheet for an item. */
  save: (media: MediaSummary) => void;
  /** Bump after a mutation so list pages can refetch. */
  version: number;
  invalidate: () => void;
}

const CollectionsContext = createContext<CollectionsApi | null>(null);

/**
 * One save sheet for the whole app.
 *
 * Saving is the single most repeated action here, so it lives in one place:
 * every card calls `save(media)` and gets the same flow — existing collections
 * first, create-a-new-one inline, correct terminology for the media type, and
 * a duplicate handled as information rather than an error.
 */
export function CollectionsProvider({ children }: { children: React.ReactNode }) {
  const toast = useToast();
  const [media, setMedia] = useState<MediaSummary | null>(null);
  const [version, setVersion] = useState(0);

  const [playlists, setPlaylists] = useState<PlaylistDto[]>([]);
  const [bucketLists, setBucketLists] = useState<BucketListDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const isMusic = media?.domain === "MUSIC";
  const collections = isMusic ? playlists : bucketLists;
  const noun = isMusic ? "playlist" : "collection";

  const invalidate = useCallback(() => setVersion((value) => value + 1), []);

  const close = useCallback(() => {
    setMedia(null);
    setCreating(false);
    setName("");
    setDescription("");
  }, []);

  const save = useCallback((item: MediaSummary) => setMedia(item), []);

  useEffect(() => {
    if (!media) return;
    let cancelled = false;
    setLoading(true);
    const load = media.domain === "MUSIC"
      ? api.get<{ playlists: PlaylistDto[] }>("/api/playlists").then((data) => {
          if (!cancelled) setPlaylists(data.playlists);
        })
      : api.get<{ bucketLists: BucketListDto[] }>("/api/bucket-lists").then((data) => {
          if (!cancelled) setBucketLists(data.bucketLists);
        });

    load
      .catch((error) => {
        if (!cancelled) toast.error("Couldn't load your lists", errorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [media, toast, version]);

  const addTo = useCallback(
    async (collectionId: string, collectionName: string) => {
      if (!media) return;
      setSaving(collectionId);
      try {
        const path = isMusic
          ? `/api/playlists/${collectionId}/items`
          : `/api/bucket-lists/${collectionId}/items`;
        await api.post(path, { mediaIds: [media.id] });
        toast.success(`Added to ${collectionName}`, media.title);
        invalidate();
        close();
      } catch (error) {
        // A duplicate is not a failure — it means the goal is already met.
        if (isApiError(error) && error.code === "DUPLICATE") {
          toast.info("Already saved", `${media.title} is in ${collectionName}.`);
          close();
        } else {
          toast.error("Couldn't save that", errorMessage(error));
        }
      } finally {
        setSaving(null);
      }
    },
    [media, isMusic, toast, invalidate, close],
  );

  const createAndAdd = useCallback(async () => {
    if (!media || !name.trim()) return;
    setSaving("new");
    try {
      const payload = { name: name.trim(), description: description.trim(), mediaIds: [media.id] };
      if (isMusic) await api.post("/api/playlists", payload);
      else await api.post("/api/bucket-lists", payload);
      toast.success(`Created ${name.trim()}`, `${media.title} was added.`);
      invalidate();
      close();
    } catch (error) {
      toast.error(`Couldn't create that ${noun}`, errorMessage(error));
    } finally {
      setSaving(null);
    }
  }, [media, name, description, isMusic, toast, invalidate, close, noun]);

  const value = useMemo<CollectionsApi>(() => ({ save, version, invalidate }), [save, version, invalidate]);

  return (
    <CollectionsContext.Provider value={value}>
      {children}

      <Dialog
        open={Boolean(media)}
        onClose={close}
        title={isMusic ? "Add to a playlist" : "Add to a collection"}
        description={media ? `${media.title}${media.subtitle ? ` · ${media.subtitle}` : ""}` : undefined}
      >
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted">
            <Spinner /> Loading your {noun}s…
          </div>
        ) : creating ? (
          <div className="space-y-4">
            <Field label="Name" htmlFor="collection-name" required>
              <Input
                id="collection-name"
                value={name}
                autoFocus
                maxLength={80}
                placeholder={isMusic ? "Late Night Drive" : "Weekend Watchlist"}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && name.trim()) void createAndAdd();
                }}
              />
            </Field>
            <Field label="Description" htmlFor="collection-description" hint="Optional.">
              <Textarea
                id="collection-description"
                rows={2}
                maxLength={500}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCreating(false)}>
                Back
              </Button>
              <Button
                variant="primary"
                loading={saving === "new"}
                disabled={!name.trim()}
                onClick={() => void createAndAdd()}
              >
                Create and add
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-3 rounded-lg border border-dashed border-line px-3 py-3 text-left transition-colors hover:border-accent hover:bg-accent-soft"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
                <Plus className="h-4 w-4" aria-hidden />
              </span>
              <span className="text-sm font-medium text-ink">New {noun}</span>
            </button>

            {collections.length === 0 ? (
              <p className="px-1 py-3 text-sm text-muted">
                You don&apos;t have any {noun}s yet. Create one above.
              </p>
            ) : (
              collections.map((collection) => (
                <button
                  key={collection.id}
                  type="button"
                  disabled={saving !== null}
                  onClick={() => void addTo(collection.id, collection.name)}
                  className={cx(
                    "flex w-full items-center gap-3 rounded-lg border border-line px-3 py-3 text-left transition-colors",
                    "hover:border-line-strong hover:bg-surface-hover disabled:opacity-60",
                  )}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-sunken text-muted">
                    {isMusic ? (
                      <ListMusic className="h-4 w-4" aria-hidden />
                    ) : (
                      <Popcorn className="h-4 w-4" aria-hidden />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{collection.name}</span>
                    <span className="block text-xs text-subtle">
                      {pluralise(collection.itemCount, isMusic ? "track" : "title")}
                    </span>
                  </span>
                  {saving === collection.id ? (
                    <Spinner />
                  ) : (
                    <Check className="h-4 w-4 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </Dialog>
    </CollectionsContext.Provider>
  );
}

export function useCollections(): CollectionsApi {
  const context = useContext(CollectionsContext);
  if (!context) throw new Error("useCollections must be used inside <CollectionsProvider>.");
  return context;
}
