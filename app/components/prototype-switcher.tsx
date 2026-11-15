// PROTOTYPE: throwaway variant switcher. Never merge to main.
import { useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function PrototypeSwitcher({
  variants,
  current,
  onChange,
}: {
  variants: { key: string; name: string }[];
  current: string;
  onChange: (key: string) => void;
}) {
  const index = Math.max(
    0,
    variants.findIndex((v) => v.key === current)
  );

  function go(delta: number) {
    const next = variants[(index + delta + variants.length) % variants.length];
    onChange(next.key);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      )
        return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (import.meta.env.PROD) return null;

  const v = variants[index];
  return (
    <div className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full bg-black px-2 py-1.5 text-sm text-white shadow-xl ring-2 ring-yellow-400">
      <button
        onClick={() => go(-1)}
        className="rounded-full p-1 hover:bg-white/20"
        aria-label="Previous variant"
      >
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-56 text-center font-mono">
        PROTOTYPE {v.key} ({v.name})
      </span>
      <button
        onClick={() => go(1)}
        className="rounded-full p-1 hover:bg-white/20"
        aria-label="Next variant"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
