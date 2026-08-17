import {
  BookMarked,
  Bookmark,
  CircleAlert,
  Highlighter,
  MessageSquareText,
  Star,
  StickyNote,
} from "lucide-react";
import type { ReactNode } from "react";
import type { Clipping, ClippingKind } from "./types";

export function pluralize(
  value: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${value.toLocaleString()} ${value === 1 ? singular : plural}`;
}

function visibleText(clipping: Clipping): string {
  return clipping.editedText ?? clipping.sourceText;
}

function formatCompactDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  }).format(date);
}

function clippingPosition(clipping: Clipping): string | null {
  if (clipping.locationStart !== null) {
    return clipping.locationEnd && clipping.locationEnd !== clipping.locationStart
      ? `Loc. ${clipping.locationStart}–${clipping.locationEnd}`
      : `Loc. ${clipping.locationStart}`;
  }

  if (clipping.pageStart !== null) {
    return clipping.pageEnd && clipping.pageEnd !== clipping.pageStart
      ? `pp. ${clipping.pageStart}–${clipping.pageEnd}`
      : `p. ${clipping.pageStart}`;
  }

  return null;
}

function KindIcon({ kind }: { kind: ClippingKind }) {
  if (kind === "note") return <StickyNote className="h-4 w-4" />;
  if (kind === "bookmark") return <Bookmark className="h-4 w-4" />;
  if (kind === "highlight") return <Highlighter className="h-4 w-4" />;
  return <BookMarked className="h-4 w-4" />;
}

interface NavigationButtonProps {
  active: boolean;
  icon: ReactNode;
  label: string;
  count?: number;
  onClick: () => void;
}

export function NavigationButton({
  active,
  icon,
  label,
  count,
  onClick,
}: NavigationButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
        active
          ? "bg-ink text-white shadow-sm"
          : "text-ink/65 hover:bg-white/70 hover:text-ink"
      }`}
    >
      <span className={active ? "text-white/85" : "text-ink/40"}>{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && (
        <span
          className={`text-xs tabular-nums ${
            active ? "text-white/55" : "text-ink/35"
          }`}
        >
          {count.toLocaleString()}
        </span>
      )}
    </button>
  );
}

export function LoadingCards() {
  return (
    <div className="space-y-3" aria-label="Loading clippings">
      {[0, 1, 2, 3].map((item) => (
        <div
          key={item}
          className="animate-pulse rounded-[1.4rem] border border-ink/5 bg-white px-5 py-5"
        >
          <div className="h-3 w-2/5 rounded bg-ink/10" />
          <div className="mt-5 h-4 w-full rounded bg-ink/10" />
          <div className="mt-2 h-4 w-11/12 rounded bg-ink/10" />
          <div className="mt-2 h-4 w-3/5 rounded bg-ink/10" />
          <div className="mt-5 h-3 w-1/3 rounded bg-ink/10" />
        </div>
      ))}
    </div>
  );
}

interface ClippingCardProps {
  clipping: Clipping;
  selected: boolean;
  onSelect: () => void;
}

export function ClippingCard({
  clipping,
  selected,
  onSelect,
}: ClippingCardProps) {
  const position = clippingPosition(clipping);
  const date = formatCompactDate(clipping.sourceAddedAt ?? clipping.createdAt);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group w-full rounded-[1.4rem] border px-5 py-5 text-left transition duration-200 sm:px-6 ${
        selected
          ? "border-moss/35 bg-white shadow-[0_12px_35px_rgba(42,63,48,0.1)] ring-1 ring-moss/15"
          : "border-ink/[0.07] bg-white/80 hover:-translate-y-0.5 hover:border-ink/15 hover:bg-white hover:shadow-[0_12px_30px_rgba(42,42,35,0.07)]"
      }`}
    >
      <div className="flex items-start gap-4">
        <span
          className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
            clipping.kind === "note"
              ? "bg-sky/10 text-sky"
              : clipping.kind === "bookmark"
                ? "bg-clay/10 text-clay"
                : "bg-moss/10 text-moss"
          }`}
        >
          <KindIcon kind={clipping.kind} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">
                {clipping.title}
              </p>
              <p className="mt-0.5 truncate text-xs text-ink/45">
                {clipping.author || "Unknown author"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {clipping.needsReview && (
                <span
                  title="Needs review"
                  className="grid h-7 w-7 place-items-center rounded-full bg-amber-100 text-amber-800"
                >
                  <CircleAlert className="h-3.5 w-3.5" />
                </span>
              )}
              {clipping.isFavorite && (
                <Star
                  className="h-4 w-4 fill-clay text-clay"
                  aria-label="Favorite"
                />
              )}
            </div>
          </div>

          <p className="mt-4 line-clamp-5 whitespace-pre-line font-serif text-[1.02rem] leading-7 text-ink/82">
            {visibleText(clipping) || "Bookmark"}
          </p>

          {clipping.personalNote && (
            <div className="mt-4 flex gap-2 rounded-xl bg-sky/[0.07] px-3 py-2.5 text-xs leading-5 text-sky/80">
              <MessageSquareText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p className="line-clamp-2">{clipping.personalNote}</p>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] font-medium text-ink/40">
            <span className="uppercase tracking-[0.13em]">{clipping.kind}</span>
            {position && <span>{position}</span>}
            {date && <span>{date}</span>}
            {clipping.editedText && (
              <span className="rounded-full bg-moss/8 px-2 py-1 text-moss">
                edited
              </span>
            )}
          </div>

          {clipping.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {clipping.tags.slice(0, 5).map((tag) => (
                <span
                  key={tag.id}
                  className="rounded-full bg-ink/[0.045] px-2.5 py-1 text-[11px] font-medium text-ink/55"
                >
                  {tag.name}
                </span>
              ))}
              {clipping.tags.length > 5 && (
                <span className="px-1 py-1 text-[11px] text-ink/40">
                  +{clipping.tags.length - 5}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
