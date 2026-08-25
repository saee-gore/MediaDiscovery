"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRightLeft,
  Check,
  LayoutGrid,
  List,
  Pencil,
  Popcorn,
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
  Chip,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Select,
  Skeleton,
  Textarea,
} from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api";
import { accentColor, cx, formatRuntime, formatSeries, pluralise, relativeTime } from "@/lib/format";
import { useDebounced } from "@/lib/hooks";
import type { BucketListDto, BucketListItemDto, ScoredMedia } from "@/lib/types";

type Filter = "all" | "unwatched" | "watched";

export default function BucketListDetailPage() {
  return <BucketListDetail />;
}

function BucketListDetail() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { invalidate } = useCollections();

  const [list, setList] = useState<BucketListDto | null>(null);
  const [allLists, setAllLists] = useState<BucketListDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<"list" | "grid">("list");
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search, 250);

  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [noteFor, setNoteFor] = useState<BucketListItemDto | null>(null);
  const [noteText, setNoteText] = useState("");
  const [moveFor, setMoveFor] = useState<BucketListItemDto | null>(null);
  const [moveTarget, setMoveTarget] = useState("");

  const [similar, setSimilar] = useState<ScoredMedia[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);

  const load = useCallback(async () => {
    if (!params?.id) return;
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      if (debounced.trim()) query.set("q", debounced.trim());
      if (filter !== "all") query.set("filter", filter);
      const suffix = query.toString() ? `?${query}` : "";
      const data = await api.get<{ bucketList: BucketListDto }>(`/api/bucket-lists/${params.id}${suffix}`);
      setList(data.bucketList);
      setName(data.bucketList.name);
      setDescription(data.bucketList.description);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [params?.id, debounced, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    api
      .get<{ bucketLists: BucketListDto[] }>("/api/bucket-lists")
      .then((data) => setAllLists(data.bucketLists))
      .catch(() => setAllLists([]));
  }, [params?.id]);

  const items = useMemo(() => list?.items ?? [], [list]);

  const mutate = async (fn: () => Promise<{ bucketList: BucketListDto }>, message?: string) => {
    setBusy(true);
    try {
      const data = await fn();
      setList(data.bucketList);
      invalidate();
      if (message) toast.success(message);
    } catch (requestError) {
      toast.error("That didn't work", errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  const loadSimilar = useCallback(async () => {
    const seed = items.find((item) => item.mediaId);
    if (!seed?.mediaId) return;
    setSimilarLoading(true);
    try {
      const data = await api.get<{ items: ScoredMedia[] }>(
        `/api/movies/${encodeURIComponent(seed.mediaId)}/similar?limit=12`,
      );
      const existing = new Set(items.map((item) => item.mediaId));
      setSimilar(data.items.filter((item) => !existing.has(item.id)));
    } catch (requestError) {
      toast.error("Couldn't find similar titles", errorMessage(requestError));
    } finally {
      setSimilarLoading(false);
    }
  }, [items, toast]);

  if (loading && !list) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-28 w-full" />
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (error && !list) {
    return (
      <div className="space-y-4">
        <BackLink />
        <ErrorState message={error} onRetry={() => void load()} />
      </div>
    );
  }

  if (!list) return null;

  const progress = list.itemCount ? Math.round((list.watchedCount / list.itemCount) * 100) : 0;

  return (
    <div className="space-y-6">
      <BackLink />

      <header className="flex flex-wrap items-start gap-4">
        <div
          className="flex h-24 w-24 shrink-0 gap-px overflow-hidden rounded-xl"
          style={{ backgroundColor: accentColor(list.accent) }}
        >
          {(list.preview ?? []).length > 0 ? (
            (list.preview ?? []).slice(0, 2).map((media) => (
              <span key={media.id} className="h-full flex-1">
                <Artwork media={media} rounded="rounded-none" showIcon={false} />
              </span>
            ))
          ) : (
            <span className="flex h-full w-full items-center justify-center text-white">
              <Popcorn className="h-8 w-8" aria-hidden />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">{list.name}</h1>
            {list.source !== "MANUAL" ? <Badge tone="accent">AI generated</Badge> : null}
          </div>
          {list.description ? (
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">{list.description}</p>
          ) : null}
          <p className="mt-1.5 text-xs text-subtle">
            {pluralise(list.itemCount, "title")} · {list.watchedCount} watched · updated{" "}
            {relativeTime(list.updatedAt)}
          </p>
          {list.itemCount > 0 ? (
            <div
              className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-surface-sunken"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Watched progress"
            >
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${progress}%`, backgroundColor: accentColor(list.accent) }}
              />
            </div>
          ) : null}
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

      {/* Controls -------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search within this collection"
            aria-label="Search within this collection"
            className="pl-9"
          />
        </div>

        <div className="flex gap-1.5">
          {(["all", "unwatched", "watched"] as const).map((option) => (
            <Chip key={option} active={filter === option} onClick={() => setFilter(option)}>
              {option === "all" ? "All" : option === "unwatched" ? "To watch" : "Watched"}
            </Chip>
          ))}
        </div>

        <div className="ml-auto flex gap-0.5 rounded-lg border border-line p-0.5">
          <button
            type="button"
            onClick={() => setView("list")}
            aria-label="List view"
            aria-pressed={view === "list"}
            className={cx("rounded-md p-1.5", view === "list" ? "bg-surface-hover text-ink" : "text-subtle")}
          >
            <List className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setView("grid")}
            aria-label="Grid view"
            aria-pressed={view === "grid"}
            className={cx("rounded-md p-1.5", view === "grid" ? "bg-surface-hover text-ink" : "text-subtle")}
          >
            <LayoutGrid className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      {/* Items ----------------------------------------------------------- */}
      {items.length === 0 ? (
        <EmptyState
          icon={Popcorn}
          title={debounced || filter !== "all" ? "Nothing here" : "This collection is empty"}
          description={
            debounced || filter !== "all"
              ? "Try a different search or filter."
              : "Find something to watch and use Watch later to add it here."
          }
          action={
            debounced || filter !== "all" ? null : (
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text transition-colors hover:bg-accent-hover"
              >
                <Sparkles className="h-4 w-4" aria-hidden />
                Find something to watch
              </Link>
            )
          }
        />
      ) : view === "grid" ? (
        <MediaGrid items={items.map((item) => item.media)} />
      ) : (
        <ol className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {items.map((item) => (
            <li
              key={item.id}
              className="group flex items-center gap-3 px-3 py-3 transition-colors hover:bg-surface-hover"
            >
              <span className="h-16 w-11 shrink-0 overflow-hidden rounded-md">
                <Artwork media={item.media} rounded="rounded-md" />
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span
                    className={cx(
                      "min-w-0 truncate text-sm font-medium",
                      item.watched ? "text-subtle line-through" : "text-ink",
                    )}
                  >
                    {item.media.title}
                  </span>
                  {item.watched ? <Badge tone="success">Watched</Badge> : null}
                </span>
                <span className="block truncate text-xs text-muted">
                  {[
                    item.media.mediaType === "SERIES" ? "Series" : "Film",
                    item.media.releaseYear,
                    item.media.mediaType === "SERIES"
                      ? formatSeries(item.media)
                      : formatRuntime(item.media.runtimeMin),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {item.note ? (
                  <span className="mt-1 block truncate text-xs italic text-subtle">“{item.note}”</span>
                ) : null}
              </span>

              <span className="flex shrink-0 items-center gap-1">
                <IconButton
                  label={item.watched ? `Mark ${item.media.title} unwatched` : `Mark ${item.media.title} watched`}
                  active={item.watched}
                  disabled={busy}
                  onClick={() =>
                    void mutate(
                      () =>
                        api.put<{ bucketList: BucketListDto }>(
                          `/api/bucket-lists/${params.id}/items/${item.id}`,
                          { watched: !item.watched },
                        ),
                      item.watched ? "Marked as not watched" : "Marked as watched",
                    )
                  }
                >
                  <Check className="h-4 w-4" />
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
                  label={`Move ${item.media.title} to another collection`}
                  disabled={allLists.length < 2}
                  onClick={() => {
                    setMoveFor(item);
                    setMoveTarget(allLists.find((other) => other.id !== list.id)?.id ?? "");
                  }}
                >
                  <ArrowRightLeft className="h-4 w-4" />
                </IconButton>
                <IconButton
                  label={`Remove ${item.media.title}`}
                  danger
                  disabled={busy}
                  onClick={() =>
                    void mutate(
                      () =>
                        api.del<{ bucketList: BucketListDto }>(
                          `/api/bucket-lists/${params.id}/items/${item.id}`,
                        ),
                      "Removed from collection",
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

      {items.length > 0 ? (
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-ink">More like this</h2>
            <Button variant="secondary" size="sm" loading={similarLoading} onClick={() => void loadSimilar()}>
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              {similar.length ? "Refresh" : "Find similar titles"}
            </Button>
          </div>
          {similar.length > 0 ? <MediaGrid items={similar} /> : null}
        </section>
      ) : null}

      {/* Edit ------------------------------------------------------------ */}
      <Dialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit collection"
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
                    api.put<{ bucketList: BucketListDto }>(`/api/bucket-lists/${params.id}`, {
                      name: name.trim(),
                      description: description.trim(),
                    }),
                  "Collection updated",
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
          <Field label="Name" htmlFor="edit-list-name" required>
            <Input
              id="edit-list-name"
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label="Description" htmlFor="edit-list-description">
            <Textarea
              id="edit-list-description"
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
                    api.put<{ bucketList: BucketListDto }>(
                      `/api/bucket-lists/${params.id}/items/${noteFor.id}`,
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
          placeholder="Who recommended it, where you got to…"
          onChange={(event) => setNoteText(event.target.value)}
        />
      </Dialog>

      {/* Move ------------------------------------------------------------ */}
      <Dialog
        open={Boolean(moveFor)}
        onClose={() => setMoveFor(null)}
        title="Move to another collection"
        description={moveFor?.media.title}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setMoveFor(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!moveTarget}
              onClick={async () => {
                if (!moveFor) return;
                await mutate(
                  () =>
                    api.put<{ bucketList: BucketListDto }>(
                      `/api/bucket-lists/${params.id}/items/${moveFor.id}`,
                      { moveToListId: moveTarget },
                    ),
                  "Moved",
                );
                setMoveFor(null);
              }}
            >
              Move
            </Button>
          </>
        }
      >
        <Field label="Destination" htmlFor="move-target">
          <Select id="move-target" value={moveTarget} onChange={(event) => setMoveTarget(event.target.value)}>
            {allLists
              .filter((other) => other.id !== list.id)
              .map((other) => (
                <option key={other.id} value={other.id}>
                  {other.name}
                </option>
              ))}
          </Select>
        </Field>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await api.del(`/api/bucket-lists/${params.id}`);
            toast.success("Collection deleted", list.name);
            invalidate();
            router.push("/bucket-lists");
          } catch (requestError) {
            toast.error("Couldn't delete that", errorMessage(requestError));
            setBusy(false);
          }
        }}
        title="Delete this collection?"
        message={`“${list.name}” and its ${pluralise(list.itemCount, "title")} will be removed. This can't be undone.`}
        loading={busy}
      />
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/bucket-lists"
      className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      All collections
    </Link>
  );
}

function IconButton({
  children,
  label,
  onClick,
  disabled,
  danger,
  active,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cx(
        "rounded-md p-1.5 transition-colors disabled:opacity-30",
        active
          ? "bg-success-soft text-success"
          : danger
            ? "text-subtle hover:bg-danger-soft hover:text-danger"
            : "text-subtle hover:bg-surface hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
