import { cn } from "@/lib/utils";

interface LoadingIconProps {
  className?: string;
}

export function LoadingIcon({ className }: LoadingIconProps) {
  return (
    <div className={cn("relative flex items-center justify-center", className)}>
      <img 
        src="/iconsessionsync_black.svg" 
        alt="Loading" 
        className="w-full h-full animate-spin-slow" 
      />
    </div>
  );
}
