import { useCreatePost } from "@workspace/api-client-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Upload as UploadIcon, Video, Image as ImageIcon, Music } from "lucide-react";

export default function Upload() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const createPostMutation = useCreatePost();
  
  const [type, setType] = useState<"video" | "image">("video");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mediaUrl, setMediaUrl] = useState("https://images.unsplash.com/photo-1549490349-8643362247b5");
  const [musicTitle, setMusicTitle] = useState("");
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    createPostMutation.mutate({
      data: {
        userId: 1, // Demo hardcoded
        type,
        title,
        description,
        mediaUrl,
        musicTitle: musicTitle || undefined,
        tags: ["#NewPost"]
      }
    }, {
      onSuccess: () => {
        toast({
          title: "Post Created! 🚀",
          description: "Your masterpiece is now live.",
        });
        setLocation("/");
      }
    });
  };

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

          <div className="border-2 border-dashed border-border rounded-xl p-12 flex flex-col items-center justify-center gap-4 hover:border-primary/50 transition-colors cursor-pointer bg-black/20">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <UploadIcon className="w-8 h-8 text-primary" />
            </div>
            <div className="text-center">
              <p className="text-white font-medium">Click to select or drag and drop</p>
              <p className="text-sm text-muted-foreground mt-1">MP4, WebM, JPG or PNG</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-white">Title</Label>
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
              <Label className="text-white flex items-center gap-2"><Music className="w-4 h-4"/> Audio Track</Label>
              <Input 
                value={musicTitle} 
                onChange={(e) => setMusicTitle(e.target.value)} 
                className="bg-input border-border" 
                placeholder="Original Sound"
              />
            </div>
          </div>

          <Button 
            type="submit" 
            className="w-full h-12 text-lg font-bold bg-primary hover:bg-primary/90 text-black"
            disabled={createPostMutation.isPending}
          >
            {createPostMutation.isPending ? "Posting..." : "Post Now"}
          </Button>

        </form>
      </div>
    </div>
  );
}