import { createFileRoute } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";

import { Settings } from "@/components/settings";

export const Route = createFileRoute("/")({
  component: RootDispatch,
});

function RootDispatch() {
  const mode = new URLSearchParams(window.location.search).get("mode");
  const isSettings = mode === "settings";

  useEffect(() => {
    if (!isSettings) {
      document.body.classList.add("overlay-window");
      return () => {
        document.body.classList.remove("overlay-window");
      };
    }
  }, [isSettings]);

  if (isSettings) return <Settings />;
  return <OverlayComponent />;
}

interface MediaInfo {
  url: string;
  mime: string;
  size: number;
  filename: string;
}

interface DisplayPayload {
  id: string;
  media: MediaInfo;
  text: string | null;
  duration: number;
  from: string;
  channelId: string;
}

interface Config {
  clientId: string;
  sharedKey: string;
  volume: number;
  position: string;
  size: number;
}

const TEXT_SHADOW =
  "[text-shadow:0_2px_8px_rgba(0,0,0,0.85),0_0_2px_rgba(0,0,0,0.9)]";

const DEFAULT_VOLUME = 0.15;

function OverlayComponent() {
  const [payload, setPayload] = useState<DisplayPayload | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [volume, setVolume] = useState(DEFAULT_VOLUME);

  useEffect(() => {
    void invoke<Config>("get_config")
      .then((cfg) => setVolume(cfg.volume / 100))
      .catch(() => {});

    const unlistenConfig = listen<Config>(
      "popshot://config-updated",
      (event) => setVolume(event.payload.volume / 100),
    );

    const unlistenDisplay = listen<DisplayPayload>(
      "popshot://display",
      async (event) => {
        setPayload(event.payload);
        try {
          await invoke("prepare_overlay");
        } catch (e) {
          console.error("prepare_overlay failed", e);
        }
        const win = getCurrentWindow();
        await win.show();
        await win.setFocus();
      },
    );

    return () => {
      void unlistenConfig.then((fn) => fn());
      void unlistenDisplay.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    if (!payload) return;
    const start = performance.now();
    setRemaining(payload.duration);

    const intervalId = window.setInterval(() => {
      const elapsed = (performance.now() - start) / 1000;
      setRemaining(Math.max(0, payload.duration - elapsed));
    }, 100);

    const timeoutId = window.setTimeout(async () => {
      await getCurrentWindow().hide();
      setPayload(null);
    }, payload.duration * 1000);

    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, [payload]);

  if (!payload) return null;

  const progress = (remaining / payload.duration) * 100;

  return (
    <div className="dark relative flex h-screen w-screen flex-col items-center justify-center gap-3 p-4">
      <Media media={payload.media} volume={volume} />

      {payload.text && (
        <div
          className={`max-w-[90%] text-center text-xl font-semibold text-white ${TEXT_SHADOW}`}
        >
          {payload.text}
        </div>
      )}

      <div
        className={`text-xs font-medium tracking-wide text-white/85 ${TEXT_SHADOW}`}
      >
        {payload.from}
      </div>

      <div className="h-1 w-[85%] overflow-hidden rounded-full bg-black/40 backdrop-blur-sm">
        <div
          className="h-full bg-white/90 transition-[width] duration-100 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function Media({ media, volume }: { media: MediaInfo; volume: number }) {
  const ref = useRef<HTMLMediaElement | null>(null);
  const className =
    "max-h-[70vh] max-w-[85%] rounded-2xl object-contain shadow-2xl shadow-black/60";

  useEffect(() => {
    if (ref.current) ref.current.volume = volume;
  }, [volume, media.url]);

  if (media.mime.startsWith("video/")) {
    return (
      <video
        ref={ref as React.Ref<HTMLVideoElement>}
        src={media.url}
        autoPlay
        controls
        className={className}
      />
    );
  }
  if (media.mime.startsWith("audio/")) {
    return (
      <audio
        ref={ref as React.Ref<HTMLAudioElement>}
        src={media.url}
        autoPlay
        controls
      />
    );
  }
  return <img src={media.url} alt={media.filename} className={className} />;
}
