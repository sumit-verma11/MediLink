import { cn } from "@/lib/utils"

interface BlobBackgroundProps {
  variant: "hero" | "ambient"
  className?: string
}

function BlobBackground({ variant, className }: BlobBackgroundProps) {
  const isAmbient = variant === "ambient"

  return (
    <div
      aria-hidden="true"
      className={cn(
        "overflow-hidden",
        isAmbient
          ? "fixed inset-0 z-[-1] pointer-events-none opacity-[0.12]"
          : "absolute inset-0 opacity-50",
        className
      )}
    >
      <div
        className={cn(
          "absolute -right-10 -top-10 rounded-full bg-[#DCEAE3] blur-3xl",
          isAmbient ? "h-96 w-96" : "h-72 w-72"
        )}
      />
      <div
        className={cn(
          "absolute -bottom-10 -left-10 rounded-full bg-[#F3DCD3] blur-3xl",
          isAmbient ? "h-72 w-72" : "h-56 w-56"
        )}
      />
    </div>
  )
}

export { BlobBackground }
