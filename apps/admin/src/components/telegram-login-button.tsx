"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

declare global {
  interface Window {
    onFullFocusTelegramAuth?: (user: Record<string, unknown>) => void;
  }
}

interface TelegramLoginButtonProps {
  botName: string;
  onAuth: (user: Record<string, unknown>) => Promise<void> | void;
}

export function TelegramLoginButton({ botName, onAuth }: TelegramLoginButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    setStatus("loading");
    container.innerHTML = "";
    window.onFullFocusTelegramAuth = (user) => {
      void onAuth(user);
    };

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", botName);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "8");
    script.setAttribute("data-userpic", "false");
    script.setAttribute("data-request-access", "write");
    script.setAttribute("data-onauth", "onFullFocusTelegramAuth(user)");
    script.onload = () => setStatus("ready");
    script.onerror = () => setStatus("failed");
    container.appendChild(script);

    const timer = window.setTimeout(() => {
      if (!container.querySelector("iframe")) {
        setStatus("failed");
      }
    }, 5000);

    return () => {
      window.clearTimeout(timer);
      if (container.contains(script)) {
        container.removeChild(script);
      }
    };
  }, [botName, onAuth, reloadKey]);

  return (
    <div className="space-y-3">
      <div className="telegram-widget-box" ref={containerRef} />
      {status === "loading" ? <div className="text-sm text-zinc-500">Загружаем кнопку Telegram...</div> : null}
      {status === "failed" ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
          <div>Telegram widget не загрузился. Проверь домен бота в BotFather и доступ к telegram.org.</div>
          <button className="btn btn-ghost mt-3 h-9" type="button" onClick={() => setReloadKey((value) => value + 1)}>
            <RefreshCw size={16} />
            Обновить кнопку
          </button>
        </div>
      ) : null}
    </div>
  );
}
