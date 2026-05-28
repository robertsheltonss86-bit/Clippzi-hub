import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Mic, MicOff, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Status = "idle" | "requesting" | "live" | "denied" | "no-device" | "insecure" | "error";

export function CameraPreview({ className }: { className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string>("");
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);

  const start = async () => {
    setError("");
    if (!window.isSecureContext) {
      setStatus("insecure");
      setError("Camera requires HTTPS. Open this site over a secure connection.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("no-device");
      setError("Your browser doesn't support camera access.");
      return;
    }
    setStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setStatus("live");
    } catch (e: any) {
      const name = e?.name ?? "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setStatus("denied");
        setError("Camera access was denied. Allow camera + microphone in your browser settings and try again.");
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setStatus("no-device");
        setError("No camera found on this device.");
      } else if (name === "NotReadableError") {
        setStatus("error");
        setError("Camera is in use by another app. Close it and try again.");
      } else {
        setStatus("error");
        setError(e?.message ?? "Could not start camera.");
      }
    }
  };

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus("idle");
  };

  useEffect(() => {
    start();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleCam = () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setCamOn(track.enabled);
    }
  };
  const toggleMic = () => {
    const track = streamRef.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setMicOn(track.enabled);
    }
  };

  return (
    <div className={`relative w-full h-full bg-black ${className ?? ""}`} data-testid="camera-preview">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
        style={{ transform: "scaleX(-1)" }}
      />

      {status !== "live" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/85 p-6">
          <div className="max-w-sm w-full text-center space-y-3">
            {status === "requesting" && (
              <>
                <Loader2 className="w-10 h-10 mx-auto text-primary animate-spin" />
                <p className="text-white font-semibold">Waiting for camera permission…</p>
                <p className="text-xs text-muted-foreground">Tap "Allow" when your browser asks.</p>
              </>
            )}
            {(status === "denied" || status === "no-device" || status === "insecure" || status === "error" || status === "idle") && (
              <>
                <AlertCircle className="w-10 h-10 mx-auto text-secondary" />
                <p className="text-white font-semibold">
                  {status === "denied" ? "Camera blocked" : status === "no-device" ? "No camera" : status === "insecure" ? "Insecure connection" : "Camera off"}
                </p>
                {error && <p className="text-xs text-muted-foreground">{error}</p>}
                <Button onClick={start} className="w-full" data-testid="button-retry-camera">
                  <Camera className="w-4 h-4 mr-2" /> Try again
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {status === "live" && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2 z-10">
          <Button
            onClick={toggleCam}
            size="icon"
            variant="secondary"
            className="rounded-full bg-black/70 backdrop-blur border border-white/20 h-10 w-10"
            data-testid="button-toggle-cam"
            title={camOn ? "Turn camera off" : "Turn camera on"}
          >
            {camOn ? <Camera className="w-4 h-4 text-white" /> : <CameraOff className="w-4 h-4 text-secondary" />}
          </Button>
          <Button
            onClick={toggleMic}
            size="icon"
            variant="secondary"
            className="rounded-full bg-black/70 backdrop-blur border border-white/20 h-10 w-10"
            data-testid="button-toggle-mic"
            title={micOn ? "Mute microphone" : "Unmute microphone"}
          >
            {micOn ? <Mic className="w-4 h-4 text-white" /> : <MicOff className="w-4 h-4 text-secondary" />}
          </Button>
          <Button
            onClick={stop}
            size="sm"
            variant="destructive"
            className="rounded-full h-10"
            data-testid="button-stop-camera"
          >
            Stop camera
          </Button>
        </div>
      )}
    </div>
  );
}
