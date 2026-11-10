import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from "next-themes";

// Wraps next-themes so the app gets the shadcn `dark` class toggling with
// centralized provider config (storage key, system theme, transitions).
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
