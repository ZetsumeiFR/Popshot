import { Button } from "@popshot/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@popshot/ui/components/card";
import { Input } from "@popshot/ui/components/input";
import { Label } from "@popshot/ui/components/label";
import { Toaster } from "@popshot/ui/components/sonner";
import { cn } from "@popshot/ui/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ThemeProvider } from "@/components/theme-provider";

type Position =
  | "top-left"
  | "top-center"
  | "top-right"
  | "middle-left"
  | "center"
  | "middle-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

interface Config {
  clientId: string;
  sharedKey: string;
  volume: number;
  position: Position;
  size: number;
}

const POSITIONS: { value: Position; label: string }[] = [
  { value: "top-left", label: "Top left" },
  { value: "top-center", label: "Top center" },
  { value: "top-right", label: "Top right" },
  { value: "middle-left", label: "Middle left" },
  { value: "center", label: "Center" },
  { value: "middle-right", label: "Middle right" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "bottom-center", label: "Bottom center" },
  { value: "bottom-right", label: "Bottom right" },
];

export function Settings() {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      disableTransitionOnChange
    >
      <SettingsContent />
      <Toaster richColors position="bottom-right" />
    </ThemeProvider>
  );
}

function SettingsContent() {
  const [config, setConfig] = useState<Config | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void invoke<Config>("get_config")
      .then(setConfig)
      .catch((e) => toast.error(`Load failed: ${String(e)}`));
  }, []);

  const update = (patch: Partial<Config>) => {
    setConfig((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const save = async () => {
    if (!config) return;
    setSaving(true);
    try {
      await invoke("save_config", { config });
      toast.success("Saved.");
    } catch (e) {
      toast.error(`Save failed: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    try {
      await invoke("send_test_display");
      toast.info("Test overlay triggered.");
    } catch (e) {
      toast.error(`Test failed: ${String(e)}`);
    }
  };

  return (
    <div className="min-h-svh bg-background p-5 text-foreground">
      <Card>
        <CardHeader>
          <CardTitle>Popshot — Settings</CardTitle>
          <CardDescription>
            Identity, key, default volume, and where the overlay shows up.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="clientId">Client ID</Label>
            <Input
              id="clientId"
              value={config?.clientId ?? ""}
              onChange={(e) => update({ clientId: e.target.value })}
              placeholder="alice-laptop"
              disabled={!config}
            />
            <p className="text-xs text-muted-foreground">
              Link your Discord account with{" "}
              <code className="rounded bg-muted px-1 py-0.5">
                /popshot-link client-id:{config?.clientId || "..."}
              </code>
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="sharedKey">Shared Key</Label>
            <Input
              id="sharedKey"
              type="password"
              value={config?.sharedKey ?? ""}
              onChange={(e) => update({ sharedKey: e.target.value })}
              placeholder="paste the key from the admin"
              disabled={!config}
            />
          </div>

          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="volume">Default volume</Label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {config?.volume ?? 15}%
              </span>
            </div>
            <input
              id="volume"
              type="range"
              min={0}
              max={100}
              step={1}
              value={config?.volume ?? 15}
              onChange={(e) => update({ volume: Number(e.target.value) })}
              disabled={!config}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Overlay position</Label>
            <div className="relative mx-auto aspect-video h-32 rounded bg-muted ring-1 ring-foreground/10">
              <div className="absolute inset-1 grid grid-cols-3 grid-rows-3 gap-1">
                {POSITIONS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    aria-label={p.label}
                    title={p.label}
                    onClick={() => update({ position: p.value })}
                    disabled={!config}
                    className={cn(
                      "rounded transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                      config?.position === p.value
                        ? "bg-primary ring-1 ring-primary"
                        : "bg-foreground/10 hover:bg-foreground/25",
                    )}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="size">Overlay size</Label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {config?.size ?? 60}%
              </span>
            </div>
            <input
              id="size"
              type="range"
              min={20}
              max={100}
              step={5}
              value={config?.size ?? 60}
              onChange={(e) => update({ size: Number(e.target.value) })}
              disabled={!config}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary disabled:cursor-not-allowed disabled:opacity-50"
            />
            <p className="text-xs text-muted-foreground">
              Percentage of the screen used. Applies on the next overlay.
            </p>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between gap-2">
          <Button variant="ghost" onClick={sendTest} disabled={!config}>
            Send test overlay
          </Button>
          <Button onClick={save} disabled={!config || saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
