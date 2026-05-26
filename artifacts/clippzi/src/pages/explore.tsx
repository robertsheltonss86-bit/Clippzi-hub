import { useGetTrendingPosts, getGetTrendingPostsQueryKey, useListShopProducts, getListShopProductsQueryKey, useListUsers, getListUsersQueryKey } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Compass, TrendingUp, Flame, Tag, ShoppingBag, Users } from "lucide-react";

export default function Explore() {
  const { data: trendingPosts, isLoading: postsLoading } = useGetTrendingPosts({ limit: 6 }, { query: { queryKey: getGetTrendingPostsQueryKey({ limit: 6 }) } });
  const { data: topCreators, isLoading: creatorsLoading } = useListUsers({ limit: 5 }, { query: { queryKey: getListUsersQueryKey({ limit: 5 }) } });
  const { data: shopProducts, isLoading: productsLoading } = useListShopProducts({ limit: 4 }, { query: { queryKey: getListShopProductsQueryKey({ limit: 4 }) } });

  const trendingTags = ["#CyberPunk", "#NeonVibes", "#DanceChallenge", "#Gaming", "#StreetStyle"];

  return (
    <div className="w-full min-h-full bg-background p-4 md:p-8 space-y-12">
      <div className="flex items-center gap-3">
        <Compass className="w-8 h-8 text-primary" />
        <h1 className="text-3xl font-bold tracking-tight text-white">Explore</h1>
      </div>

      {/* Trending Tags */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Tag className="w-5 h-5 text-secondary" />
          <h2 className="text-xl font-semibold text-white">Trending Tags</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {trendingTags.map((tag) => (
            <div key={tag} className="px-4 py-2 rounded-full bg-secondary/10 text-secondary border border-secondary/20 font-medium hover:bg-secondary/20 cursor-pointer transition-colors">
              {tag}
            </div>
          ))}
        </div>
      </section>

      {/* Trending Posts */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Flame className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-semibold text-white">Trending Posts</h2>
        </div>
        
        {postsLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[9/16] rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {trendingPosts?.map((post) => (
              <Link key={post.id} href={`/`}>
                <div className="aspect-[9/16] rounded-xl overflow-hidden relative group cursor-pointer border border-border hover:border-primary/50 transition-colors">
                  <img src={post.thumbnailUrl || post.mediaUrl || "https://images.unsplash.com/photo-1549490349-8643362247b5"} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="absolute bottom-2 left-2 flex items-center gap-1">
                      <TrendingUp className="w-4 h-4 text-primary" />
                      <span className="text-xs text-white font-medium">{post.viewCount}</span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Top Creators */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-accent" />
          <h2 className="text-xl font-semibold text-white">Top Creators</h2>
        </div>
        
        {creatorsLoading ? (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="w-32 h-40 rounded-xl flex-shrink-0" />
            ))}
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
            {topCreators?.map((creator) => (
              <Link key={creator.id} href={`/profile/${creator.id}`}>
                <div className="w-32 flex-shrink-0 flex flex-col items-center gap-3 p-4 rounded-xl bg-card border border-border hover:border-accent/50 transition-colors cursor-pointer group">
                  <img src={creator.avatarUrl || "/assets/avatar1.png"} alt="" className="w-16 h-16 rounded-full object-cover ring-2 ring-accent/20 group-hover:ring-accent transition-all" />
                  <div className="text-center">
                    <p className="font-semibold text-sm text-white truncate w-24">{creator.displayName}</p>
                    <p className="text-xs text-muted-foreground">@{creator.username}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Clip Shop Featured */}
      <section className="space-y-4 pb-8">
        <div className="flex items-center gap-2">
          <ShoppingBag className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-semibold text-white">Clip Shop Featured</h2>
        </div>
        
        {productsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-64 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {shopProducts?.map((product) => (
              <Link key={product.id} href={`/shop/${product.id}`}>
                <div className="group rounded-xl overflow-hidden bg-card border border-border hover:border-primary/50 cursor-pointer flex flex-col">
                  <div className="h-40 overflow-hidden bg-black relative">
                    <img src={product.imageUrl || "https://images.unsplash.com/photo-1505740420928-5e560c06d30e"} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 opacity-80 group-hover:opacity-100" />
                    <div className="absolute top-2 right-2 px-2 py-1 rounded bg-black/60 backdrop-blur-md border border-white/10 text-xs font-bold text-primary">
                      ${product.price}
                    </div>
                  </div>
                  <div className="p-3">
                    <h3 className="font-semibold text-white text-sm line-clamp-1">{product.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{product.description}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}