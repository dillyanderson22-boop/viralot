"use client";

import { useState } from "react";

/**
 * A car photo that falls back to the car's next photo when one won't load
 * (a manufacturer site refusing, a dead link), and to an icon at the end.
 */
export function CarImg({ srcs, alt = "", className, fallback }: { srcs: (string | undefined)[]; alt?: string; className?: string; fallback: React.ReactNode }) {
  const list = [...new Set(srcs.filter(Boolean) as string[])];
  const [i, setI] = useState(0);
  if (i >= list.length) return <>{fallback}</>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img key={list[i]} src={list[i]} alt={alt} loading="lazy" className={className} onError={() => setI((n) => n + 1)} />;
}
