import { ShieldCheck } from "lucide-react";

export function GuidelinesNote({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-start gap-2 text-xs text-muted-foreground ${className}`}>
      <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
      <p>
        Keep it kind. Content is auto-scanned by our AI — anything that breaks our{" "}
        <span className="text-white/90 font-medium">Community Guidelines</span> (bullying,
        harassment, drugs, hate, nudity, or violence) may be blocked or removed.
      </p>
    </div>
  );
}
