import { useLocation } from "wouter";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CheckoutCancel() {
  const [, setLocation] = useLocation();
  return (
    <div className="min-h-full w-full flex items-center justify-center p-8">
      <div className="max-w-md w-full bg-card border border-border rounded-lg p-8 text-center space-y-4">
        <XCircle className="w-12 h-12 mx-auto text-muted-foreground" />
        <h2 className="text-xl font-bold">Checkout cancelled</h2>
        <p className="text-muted-foreground">No charge was made.</p>
        <Button onClick={() => setLocation("/")} className="w-full">Back to feed</Button>
      </div>
    </div>
  );
}
