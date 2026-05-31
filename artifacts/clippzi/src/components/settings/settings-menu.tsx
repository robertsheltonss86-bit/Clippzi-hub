import { useState } from "react";
import { useLocation } from "wouter";
import { LifeBuoy, Wallet } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PayoutSetup } from "@/components/payout/payout-setup";
import { usePayoutMethod } from "@/hooks/use-payout-method";
import { useCurrentUser } from "@/hooks/use-current-user";

// One place for "all settings" — opens from a gear button in the top bar / nav.
// Holds payout settings (where you get paid) and Report a Problem. The caller
// supplies the trigger element (gear icon, nav row, etc.) via `children`.
export function SettingsMenu({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const { userId, isAuthenticated, login } = useCurrentUser();
  const { data: payout, refetch } = usePayoutMethod(userId ?? 0, isAuthenticated && !!userId);
  const [payoutOpen, setPayoutOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Settings</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              if (!isAuthenticated) { login(); return; }
              setPayoutOpen(true);
            }}
            data-testid="menu-payout-settings"
          >
            <Wallet className="w-4 h-4 mr-2" /> Payout settings
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setLocation("/support")} data-testid="menu-report-problem">
            <LifeBuoy className="w-4 h-4 mr-2" /> Report a problem
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {userId ? (
        <Dialog open={payoutOpen} onOpenChange={setPayoutOpen}>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle>Payout settings</DialogTitle>
              <DialogDescription>
                Choose where you'd like to get paid. This is required once before you can go live.
              </DialogDescription>
            </DialogHeader>
            <PayoutSetup
              userId={userId}
              currentMethod={payout?.payoutMethod}
              currentHandle={payout?.payoutHandle}
              onSaved={() => { setPayoutOpen(false); refetch(); }}
            />
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
