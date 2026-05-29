import { useCreatePost } from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Upload as UploadIcon, Video, Image as ImageIcon, Music, X, CheckCircle } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { GuidelinesNote } from "@/components/community-guidelines";

export default function Upload() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createPostMutation = useCreatePost();
  const { userId, isAuthenticated, login } = useCurrentUser();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [type, setType] = useState<"video" | "image">("video");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [musicTitle, setMusicTitle] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadedObjectPath, setUploadedObjectPath] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const { uploadFile, isUploading, progress } = useUpload({
    onSuccess: (response) => {
      setUploadedObjectPath(response.objectPath);
    },
    onError: (err) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    },
  });

  const handleFile = useCallback(async (file: File) => {
    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");
    if (!isVideo && !isImage) {
      toast({ title: "Invalid file", description: "Please select a video or image file.", variant: "destructive" });
      return;
    }
    setType(isVideo ? "video" : "image");
    setSelectedFile(file);
    setUploadedObjectPath(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    await uploadFile(file);
  }, [previewUrl, uploadFile, toast]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);

  const clearFile = () => {
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setUploadedObjectPath(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated || !userId) {
      toast({ title: "Login required", description: "Sign in to post." });
      login();
      return;
    }
    if (!uploadedObjectPath) {
      toast({ title: "No file uploaded", description: "Please wait for the file to finish uploading.", variant: "destructive" });
      return;
    }
    if (!title.trim()) {
      toast({ title: "Title required", description: "Give your post a title.", variant: "destructive" });
      return;
    }
    const mediaUrl = `/api/storage${uploadedObjectPath}`;
    createPostMutation.mutate({
      data: {
        userId,
        type,
        title,
        description,
        mediaUrl,
        musicTitle: musicTitle || undefined,
        tags: ["#NewPost"],
      }
    }, {
      onSuccess: () => {
        toast({ title: "Posted! 🚀", description: "Your content is now live." });
        setLocation("/");
      },
      onError: (err: any) => {
        const msg = err?.data?.error ?? err?.message ?? String(err);
        const blocked = err?.status === 422;
        toast({ title: blocked ? "Post blocked" : "Post failed", description: msg, variant: "destructive" });
      }
    });
  };

  const canSubmit = !!uploadedObjectPath && !!title.trim() && !isUploading && !createPostMutation.isPending;

  return (
    <div className="w-full min-h-full bg-background p-4 md:p-8 flex justify-center">
      <div className="max-w-2xl w-full space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-white">Create Post</h1>
          <p className="text-muted-foreground">Share your vibe with the world.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 bg-card p-6 md:p-8 rounded-2xl border border-border">

          <div className="flex gap-4 p-1 bg-input rounded-lg w-full max-w-xs mx-auto">
            <button
              type="button"
              onClick={() => setType("video")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md font-medium transition-all ${type === "video" ? "bg-primary text-black" : "text-muted-foreground hover:text-white"}`}
            >
              <Video className="w-4 h-4" /> Video
            </button>
            <button
              type="button"
              onClick={() => setType("image")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md font-medium transition-all ${type === "image" ? "bg-primary text-black" : "text-muted-foreground hover:text-white"}`}
            >
              <ImageIcon className="w-4 h-4" /> Image
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,image/*"
            className="hidden"
            onChange={handleFileInputChange}
          />

          {!selectedFile ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`border-2 border-dashed rounded-xl p-12 flex flex-col items-center justify-center gap-4 cursor-pointer transition-colors ${isDragging ? "border-primary bg-primary/10" : "border-border hover:border-primary/50 bg-black/20"}`}
            >
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <UploadIcon className="w-8 h-8 text-primary" />
              </div>
              <div className="text-center">
                <p className="text-white font-medium">Click to select or drag and drop</p>
                <p className="text-sm text-muted-foreground mt-1">MP4, WebM, MOV, JPG, PNG, GIF — any length</p>
              </div>
            </div>
          ) : (
            <div className="relative rounded-xl overflow-hidden border border-border bg-black/20">
              {type === "video" && previewUrl ? (
                <video
                  src={previewUrl}
                  className="w-full max-h-64 object-contain"
                  controls
                  muted
                />
              ) : previewUrl ? (
                <img src={previewUrl} alt="Preview" className="w-full max-h-64 object-contain" />
              ) : null}

              <div className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  {isUploading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
                      <span className="text-sm text-muted-foreground truncate">Uploading… {progress}%</span>
                    </>
                  ) : uploadedObjectPath ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                      <span className="text-sm text-green-500 truncate">Upload complete</span>
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground truncate">{selectedFile.name}</span>
                  )}
                </div>
                <button type="button" onClick={clearFile} className="ml-2 p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-white shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {isUploading && (
                <div className="mx-3 mb-3 h-1.5 rounded-full bg-border overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300 rounded-full"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-white">Title <span className="text-red-500">*</span></Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="bg-input border-border"
                placeholder="Give it a catchy title"
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="text-white">Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="bg-input border-border min-h-[100px]"
                placeholder="Tell us more about it..."
              />
            </div>

            <div className="space-y-2">
              <Label className="text-white flex items-center gap-2"><Music className="w-4 h-4" /> Audio Track</Label>
              <Input
                value={musicTitle}
                onChange={(e) => setMusicTitle(e.target.value)}
                className="bg-input border-border"
                placeholder="Original Sound"
              />
            </div>
          </div>

          <GuidelinesNote />

          <Button
            type="submit"
            className="w-full h-12 text-lg font-bold bg-primary hover:bg-primary/90 text-black"
            disabled={!canSubmit}
          >
            {createPostMutation.isPending ? "Posting..." : isUploading ? `Uploading ${progress}%…` : !selectedFile ? "Select a file first" : !uploadedObjectPath ? "Waiting for upload…" : "Post Now"}
          </Button>

        </form>
      </div>
    </div>
  );
}
