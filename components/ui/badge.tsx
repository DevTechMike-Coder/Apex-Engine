import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold font-mono uppercase tracking-wider border",
  {
    variants: {
      variant: {
        default: "bg-primary/10 text-primary border-primary/20",
        danger: "bg-danger/10 text-danger border-danger/20",
        muted: "bg-white/5 text-white/40 border-white/10",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
