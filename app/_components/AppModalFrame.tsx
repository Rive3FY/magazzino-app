"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect } from "react";

type Props = {
  open: boolean;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  headerRight?: ReactNode;
  onClose: () => void;
  titleId?: string;
  width?: string;
  bodyClassName?: string;
  bodyStyle?: CSSProperties;
  contentStyle?: CSSProperties;
  closeOnBackdrop?: boolean;
};

export default function AppModalFrame({
  open,
  title,
  subtitle,
  children,
  footer,
  headerRight,
  onClose,
  titleId = "app-modal-title",
  width = "min(960px, 100%)",
  bodyClassName,
  bodyStyle,
  contentStyle,
  closeOnBackdrop = true,
}: Props) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="appModalOverlay"
      onMouseDown={() => {
        if (closeOnBackdrop) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className="appModalShell"
        style={{ width, ...contentStyle }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="appModalAccentTop" aria-hidden="true" />
        <div className="appModalHeader">
          <div className="appModalHeaderRow">
            <div style={{ minWidth: 0 }}>
              <div id={titleId} className="appModalTitle">
                {title}
              </div>
              {subtitle ? <div className="appModalSubtitle">{subtitle}</div> : null}
            </div>
            {headerRight ? <div className="appModalHeaderRight">{headerRight}</div> : null}
          </div>
        </div>
        <div className={bodyClassName ? `appModalBody ${bodyClassName}` : "appModalBody"} style={bodyStyle}>
          {children}
        </div>
        {footer ? <div className="appModalFooter">{footer}</div> : null}
      </div>
    </div>
  );
}
