import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
}

/** Page shell — every screen wraps with this. The .page class lives in globals.css. */
export function Page({ children }: Props) {
  return <div className="page">{children}</div>;
}
