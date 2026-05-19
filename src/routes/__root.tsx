import { Outlet } from "@tanstack/react-router";
import { ThemeProvider } from "~/contexts/ThemeContext";

export default function RootLayout() {
  return (
    <ThemeProvider>
      <Outlet />
    </ThemeProvider>
  );
}
