"use client";

import type { ReactNode } from "react";

export function ConfirmPlatformDeleteButton({ className, children, message }: {
  className?: string;
  children: ReactNode;
  message: string;
}) {
  return (
    <button type="submit" className={className} onClick={(event) => {
      if (!window.confirm(message)) event.preventDefault();
    }}>
      {children}
    </button>
  );
}
