import { Toaster as Sonner } from "sonner"

import { useTheme } from "@/hooks/useTheme"

type ToasterProps = React.ComponentProps<typeof Sonner>

// The light or dark theme of the app (hooks/useTheme), not the operating system's.
const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useTheme()

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-subtle group-[.toast]:text-muted",
          success: "[&_[data-icon]]:text-good",
          error: "group-[.toaster]:border-crit/40 [&_[data-icon]]:text-crit",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
