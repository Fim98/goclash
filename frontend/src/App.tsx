import { useEffect, useRef, useState } from "react";
import { Events, WML } from "@wailsio/runtime";
import { Moon, Sun, User, ArrowRight, Clock } from "lucide-react";
import { useTheme } from "next-themes";
import { GreetService } from "../bindings/changeme";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

// Show the actual Wails version this project was generated against.
const wailsVersion = "v3.0.0";

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      variant="outline"
      size="icon"
      aria-label="Toggle theme"
      className="rounded-full"
      // Wails: make the button clickable instead of a window-drag handle.
      style={{ ["--wails-draggable" as string]: "no-drag" }}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun className="size-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
      <Moon className="absolute size-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
    </Button>
  );
}

function App() {
  const [name, setName] = useState<string>("");
  const [greeting, setGreeting] = useState<string | null>(null);
  const [time, setTime] = useState<string>("Listening for Time event...");

  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const doGreet = () => {
    const n = name || "anonymous";
    GreetService.Greet(n)
      .then((message) => {
        setGreeting(message);
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setGreeting(null), 4000);
      })
      .catch(console.error);
  };

  useEffect(() => {
    Events.On("time", (timeValue: { data: string }) => {
      setTime(timeValue.data);
    });
    // Reload WML so it picks up the wml tags
    WML.Reload();
    return () => clearTimeout(toastTimer.current);
  }, []);

  return (
    <div className="bg-background text-foreground flex min-h-svh flex-col">
      <header className="flex items-center justify-end p-4">
        <ThemeToggle />
      </header>

      <main
        className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-6 pb-16"
        style={{ ["--wails-draggable" as string]: "no-drag" }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Wails + React + shadcn/ui</CardTitle>
            <CardDescription>
              Tailwind v4 · light &amp; dark theme · ready for StyleKit themes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex w-full items-center gap-2">
              <Input
                aria-label="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") doGreet();
                }}
                type="text"
                placeholder="Your name"
                autoComplete="off"
              />
              <Button onClick={doGreet}>
                <User />
                Greet
                <ArrowRight />
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>

      <footer className="mx-auto flex w-full max-w-xl items-center justify-between px-6 py-4 text-muted-foreground text-sm">
        <span>{wailsVersion}</span>
        <span className="flex items-center gap-1.5">
          <Clock className="size-3.5" aria-hidden="true" />
          <span>{time}</span>
        </span>
      </footer>

      {greeting && (
        <div
          role="status"
          aria-live="polite"
          className="bg-popover text-popover-foreground animate-in fade-in slide-in-from-bottom-4 fixed inset-x-0 bottom-6 z-50 mx-auto flex w-fit items-center gap-2 rounded-lg border px-4 py-3 shadow-lg"
          style={{ ["--wails-draggable" as string]: "no-drag" }}
        >
          <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            From Go
          </span>
          <span aria-label="result" className="text-sm">
            {greeting}
          </span>
        </div>
      )}
    </div>
  );
}

export default App;
