"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Popcorn, Search, Sparkles } from "lucide-react";

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
import type { BucketListDto } from "@/lib/types";

const TEMPLATES = [
  "Weekend Watchlist",
  "Best Sci-Fi",
  "Watch with Friends",
  "Comfort Shows",
  "Award Winners",
  "Date Night",
];

export default function BucketListsPage() {
  return <BucketListsView />;
}

function BucketListsView() {
  const toast = useToast();
  const { version, invalidate } = useCollections();
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search, 250);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const query = debounced.trim() ? `?q=${encodeURIComponent(debounced.trim())}` : "";
  const { data, loading, error, reload } = useResource<{ bucketLists: BucketListDto[] }>(
    `/api/bucket-lists${query}`,
    [version],
  );

  const create = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const result = await api.post<{ bucketList: BucketListDto }>("/api/bucket-lists", {
        name: name.trim(),
        description: description.trim(),
      });
      toast.success("Collection created", result.bucketList.name);
      setCreateOpen(false);
      setName("");
      setDescription("");
      invalidate();
      reload();
    } catch (requestError) {
      toast.error("Couldn't create that collection", errorMessage(requestError));
    } finally {
      setCreating(false);
    }
  };

  const lists = data?.bucketLists ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-ink">
            <Popcorn className="h-6 w-6 text-amber" aria-hidden />
            My bucket lists
          </h1>
          <p className="mt-1 text-sm text-muted">
            {lists.length ? pluralise(lists.length, "collection") : "Nothing saved yet"}
          </p>
        </div>
        <Button variant="primary" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          New collection
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
          placeholder="Search your collections"
          aria-label="Search your collections"
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
      ) : lists.length === 0 ? (
        <EmptyState
          icon={Popcorn}
          title={debounced ? "No collections match that" : "No collections yet"}
          description={
            debounced
              ? "Try a different name."
              : "Start one from a template below, or save search results straight into a new collection."
          }
          action={
            debounced ? null : (
              <div className="flex flex-wrap justify-center gap-2">
                {TEMPLATES.map((template) => (
                  <button
                    key={template}
                    type="button"
                    onClick={() => {
                      setName(template);
                      setCreateOpen(true);
                    }}
                    className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent"
                  >
                    {template}
                  </button>
                ))}
              </div>
            )
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lists.map((list) => (
            <BucketListCard key={list.id} list={list} />
          ))}
        </div>
      )}

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New collection"
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
          <Field label="Name" htmlFor="new-list-name" required>
            <Input
              id="new-list-name"
              autoFocus
              value={name}
              maxLength={80}
              placeholder="Weekend Watchlist"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && name.trim()) void create();
              }}
            />
          </Field>
          <Field label="Description" htmlFor="new-list-description" hint="Optional.">
            <Textarea
              id="new-list-description"
              rows={2}
              maxLength={500}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
          <div className="flex flex-wrap gap-1.5">
            {TEMPLATES.map((template) => (
              <button
                key={template}
                type="button"
                onClick={() => setName(template)}
                className="rounded-full border border-line px-2.5 py-1 text-xs text-muted transition-colors hover:border-accent hover:text-accent"
              >
                {template}
              </button>
            ))}
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function BucketListCard({ list }: { list: BucketListDto }) {
  const preview = list.preview ?? [];
  const progress = list.itemCount ? Math.round((list.watchedCount / list.itemCount) * 100) : 0;

  return (
    <Link
      href={`/bucket-lists/${list.id}`}
      className="group flex flex-col gap-3 rounded-xl border border-line bg-surface p-3 transition-colors hover:border-line-strong hover:bg-surface-hover"
    >
      <div className="flex items-center gap-3">
        <div
          className="flex h-16 w-16 shrink-0 gap-px overflow-hidden rounded-lg"
          style={{ backgroundColor: accentColor(list.accent) }}
        >
          {preview.length > 0 ? (
            preview.slice(0, 2).map((media) => (
              <span key={media.id} className="h-full flex-1">
                <Artwork media={media} rounded="rounded-none" showIcon={false} />
              </span>
            ))
          ) : (
            <span className="flex h-full w-full items-center justify-center text-white">
              <Popcorn className="h-6 w-6" aria-hidden />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="min-w-0 truncate text-sm font-semibold text-ink">{list.name}</h2>
            {list.source !== "MANUAL" ? <Badge tone="accent">AI</Badge> : null}
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {pluralise(list.itemCount, "title")} · {list.watchedCount} watched
          </p>
          <p className="mt-0.5 text-[11px] text-subtle">Updated {relativeTime(list.updatedAt)}</p>
        </div>
      </div>

      {list.itemCount > 0 ? (
        <div
          className="h-1 w-full overflow-hidden rounded-full bg-surface-sunken"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${list.name} watched progress`}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${progress}%`, backgroundColor: accentColor(list.accent) }}
          />
        </div>
      ) : null}

      {list.description ? (
        <p className="line-clamp-2 text-xs leading-relaxed text-muted">{list.description}</p>
      ) : null}
    </Link>
  );
}
