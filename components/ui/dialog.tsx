"use client"

import * as React from "react"
import { Maximize2Icon, Minimize2Icon, MinusIcon, XIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

type DialogWindowState = "normal" | "minimized" | "maximized"
const DialogWindowContext = React.createContext<{
  windowState: DialogWindowState
  setWindowState: React.Dispatch<React.SetStateAction<DialogWindowState>>
} | null>(null)

function Dialog({
  modal = true,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  const [windowState, setWindowState] = React.useState<DialogWindowState>("normal")
  return (
    <DialogWindowContext.Provider value={{ windowState, setWindowState }}>
      <DialogPrimitive.Root
        data-slot="dialog"
        modal={windowState === "minimized" ? false : modal}
        onOpenChange={(open) => {
          if (!open) setWindowState("normal")
          onOpenChange?.(open)
        }}
        {...props}
      />
    </DialogWindowContext.Provider>
  )
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  const window = React.useContext(DialogWindowContext)
  if (window?.windowState === "minimized") return null
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  showWindowControls = true,
  onCloseAutoFocus,
  onInteractOutside,
  onPointerDownOutside,
  onEscapeKeyDown,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
  showWindowControls?: boolean
}) {
  const window = React.useContext(DialogWindowContext)
  const windowState = window?.windowState ?? "normal"
  const setWindowState = window?.setWindowState

  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        data-window-state={windowState}
        className={cn(
          "fixed z-50 grid w-full max-w-[calc(100%-2rem)] gap-4 rounded-xl border border-border/80 bg-background p-5 shadow-2xl shadow-slate-950/15 duration-200 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-h-[calc(100dvh-2rem)] sm:max-w-4xl sm:overflow-y-auto sm:p-6",
          windowState === "normal" && "top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%]",
          className
        )}
        onCloseAutoFocus={(event) => {
          setWindowState?.("normal")
          onCloseAutoFocus?.(event)
        }}
        onInteractOutside={(event) => {
          if (windowState === "minimized") event.preventDefault()
          onInteractOutside?.(event)
        }}
        onPointerDownOutside={(event) => {
          if (windowState === "minimized") event.preventDefault()
          onPointerDownOutside?.(event)
        }}
        onEscapeKeyDown={(event) => {
          if (windowState === "minimized") event.preventDefault()
          onEscapeKeyDown?.(event)
        }}
        {...props}
      >
        {children}
        {showWindowControls && (
          <div data-slot="dialog-window-controls" className="absolute right-12 top-3 z-20 flex items-center gap-1 print:hidden">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-foreground"
              aria-label={windowState === "minimized" ? "Restore window" : "Minimize window"}
              title={windowState === "minimized" ? "Restore" : "Minimize"}
              onClick={() => setWindowState?.((current) => current === "minimized" ? "normal" : "minimized")}
            >
              <MinusIcon className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-foreground"
              aria-label={windowState === "maximized" ? "Restore window" : "Maximize window"}
              title={windowState === "maximized" ? "Restore" : "Maximize"}
              onClick={() => setWindowState?.((current) => current === "maximized" ? "normal" : "maximized")}
            >
              {windowState === "maximized" ? <Minimize2Icon className="size-4" /> : <Maximize2Icon className="size-4" />}
            </Button>
          </div>
        )}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="absolute top-4 right-4 grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:ring-2 focus:ring-ring/40 focus:outline-hidden disabled:pointer-events-none data-[state=open]:bg-accent [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 pr-28 text-center sm:text-left", className)}
      {...props}
    >
      {children}
      <div data-export-slot="dialog" className="flex justify-end pr-6 empty:hidden" />
    </div>
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
