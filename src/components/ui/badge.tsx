import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "badge-premium inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-[rgba(36,255,145,0.28)] bg-[rgba(36,255,145,0.14)] text-[#24FF91] hover:bg-[rgba(36,255,145,0.2)] [--badge-shadow:rgba(36,255,145,0.42)]",
        secondary: "border-[rgba(148,163,184,0.28)] bg-[rgba(148,163,184,0.14)] text-[#94A3B8] hover:bg-[rgba(148,163,184,0.2)] [--badge-shadow:rgba(148,163,184,0.32)]",
        destructive: "border-[rgba(255,90,95,0.28)] bg-[rgba(255,90,95,0.14)] text-[#FF5A5F] hover:bg-[rgba(255,90,95,0.2)] [--badge-shadow:rgba(255,90,95,0.38)]",
        outline: "border-[rgba(148,163,184,0.28)] bg-[rgba(148,163,184,0.08)] text-[#94A3B8] [--badge-shadow:rgba(148,163,184,0.28)]",
        success: "border-[rgba(36,255,145,0.28)] bg-[rgba(36,255,145,0.14)] text-[#24FF91] [--badge-shadow:rgba(36,255,145,0.42)]",
        warning: "border-[rgba(255,200,87,0.28)] bg-[rgba(255,200,87,0.14)] text-[#FFC857] [--badge-shadow:rgba(255,200,87,0.4)]",
        info: "border-[rgba(56,189,248,0.28)] bg-[rgba(56,189,248,0.14)] text-[#38BDF8] [--badge-shadow:rgba(56,189,248,0.4)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
