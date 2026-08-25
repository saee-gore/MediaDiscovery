"use client";

import { useState } from "react";
import { Clapperboard, Music4, Tv } from "lucide-react";

import { artworkGradient, cx, initials } from "@/lib/format";
import type { MediaSummary } from "@/lib/types";

/**
 * Cover art, or a deterministic stand-in.
 *
 * The offline catalogue has no artwork, and a grid of identical grey squares
 * reads as broken. A stable gradient derived from the item's id plus its
 * initials gives each item a recognisable identity, and real artwork replaces
 * it silently once a provider key is configured. A failed image load falls back
 * to the same tile rather than leaving a broken-image icon.
 */
export function Artwork({
  media,
  className,
  rounded = "rounded-lg",
  showIcon = true,
}: {
  media: Pick<MediaSummary, "id" | "title" | "imageUrl" | "mediaType">;
  className?: string;
  rounded?: string;
  showIcon?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const gradient = artworkGradient(media.id);
  const Icon = media.mediaType === "TRACK" ? Music4 : media.mediaType === "SERIES" ? Tv : Clapperboard;

  if (media.imageUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- provider CDNs, sized by CSS
      <img
        src={media.imageUrl}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className={cx("h-full w-full bg-surface-sunken object-cover", rounded, className)}
      />
    );
  }

  return (
    <div
      aria-hidden
      className={cx(
        "relative flex h-full w-full items-center justify-center overflow-hidden",
        rounded,
        className,
      )}
      style={{
        backgroundImage: `linear-gradient(${gradient.angle}deg, ${gradient.from}, ${gradient.to})`,
      }}
    >
      <span className="text-white/85">
        {showIcon ? (
          <Icon className="h-1/4 max-h-8 min-h-4 w-auto" />
        ) : (
          <span className="text-sm font-semibold tracking-wide">{initials(media.title)}</span>
        )}
      </span>
      <span className="absolute inset-0 bg-gradient-to-t from-black/25 to-transparent" />
    </div>
  );
}
