"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef(
  /**
   * @param {React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>} props
   * @param {React.ForwardedRef<React.ElementRef<typeof DialogPrimitive.Overlay>>} ref
   */
  ({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props} />
  )
)
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef(
  /**
   * @param {React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>} props
   * @param {React.ForwardedRef<React.ElementRef<typeof DialogPrimitive.Content>>} ref
   */
  ({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        // Mobile: slide up from bottom
        "fixed inset-x-0 bottom-0 z-50 grid w-full gap-4 border bg-background p-6 shadow-lg duration-200",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        "rounded-t-2xl",
        "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        // Desktop: centered modal, offset right by sidebar width (220px)
        "md:fixed md:inset-x-[unset] md:inset-y-[unset]",
        "md:left-[calc(50%+110px)] md:top-1/2",
        "md:bottom-[unset]",
        "md:-translate-x-1/2 md:-translate-y-1/2",
        "md:w-full md:max-w-lg",
        "md:rounded-lg",
        "md:data-[state=closed]:zoom-out-95 md:data-[state=open]:zoom-in-95",
        className
      )}
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  </DialogPortal>
  )
)
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = (
  /** @type {React.HTMLAttributes<HTMLDivElement>} */
  props
) => {
  const { className, ...rest } = props

  return (
    <div
      className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)}
      {...rest} />
  )
}
DialogHeader.displayName = "DialogHeader"

const DialogFooter = (
  /** @type {React.HTMLAttributes<HTMLDivElement>} */
  props
) => {
  const { className, ...rest } = props

  return (
    <div
      className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}
      {...rest} />
  )
}
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef(
  /**
   * @param {React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>} props
   * @param {React.ForwardedRef<React.ElementRef<typeof DialogPrimitive.Title>>} ref
   */
  ({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props} />
  )
)
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef(
  /**
   * @param {React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>} props
   * @param {React.ForwardedRef<React.ElementRef<typeof DialogPrimitive.Description>>} ref
   */
  ({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props} />
  )
)
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
