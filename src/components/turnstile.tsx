"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      theme?: "auto" | "light" | "dark";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let scriptLoading: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptLoading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile did not load")));
    script.onerror = () => {
      scriptLoading = null;
      reject(new Error("Turnstile did not load"));
    };
    document.head.appendChild(script);
  });
  return scriptLoading;
}

/**
 * Cloudflare Turnstile, when the server has a site key. Returns the widget
 * to place in the form, the current token (null until the check passes), and
 * `headers` to send with the Better Auth call. Tokens are single-use, so call
 * `reset` after every attempt.
 */
export function useTurnstile(siteKey: string | null): {
  widget: ReactNode;
  ready: boolean;
  headers: Record<string, string>;
  reset: () => void;
} {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!siteKey || !container.current) return;
    let cancelled = false;
    loadTurnstile()
      .then((api) => {
        if (cancelled || !container.current) return;
        widgetId.current = api.render(container.current, {
          sitekey: siteKey,
          theme: "auto",
          callback: (value) => setToken(value),
          "expired-callback": () => setToken(null),
          "error-callback": () => setToken(null),
        });
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [siteKey]);

  const reset = useCallback(() => {
    setToken(null);
    if (widgetId.current) window.turnstile?.reset(widgetId.current);
  }, []);

  if (!siteKey) return { widget: null, ready: true, headers: {}, reset };

  return {
    widget: (
      <div className="flex min-h-[65px] flex-col gap-1">
        <div ref={container} />
        {failed ? (
          <p className="text-sm text-destructive">
            The bot check couldn&rsquo;t load. Check your connection, or turn off a blocker for this site.
          </p>
        ) : null}
      </div>
    ),
    ready: token !== null,
    headers: token ? { "x-captcha-response": token } : {},
    reset,
  };
}
