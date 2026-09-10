"use client";

interface VideoEmbedProps {
  platform: string;
  videoId: string;
  url?: string;
}

function buildEmbedSrc(platform: string, videoId: string): string | null {
  if (platform === "youtube") {
    // youtube-nocookie keeps it lighter on tracking; preserve native cover/controls
    return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`;
  }
  if (platform === "bilibili") {
    // Bilibili iframe shows native player UI + cover by default
    return `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(
      videoId
    )}&autoplay=0&high_quality=1&danmaku=0`;
  }
  return null;
}

export function VideoEmbed({ platform, videoId, url }: VideoEmbedProps) {
  const src = buildEmbedSrc(platform, videoId);

  if (!src) {
    return url ? (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="my-6 inline-block text-sm underline"
      >
        打开视频 →
      </a>
    ) : null;
  }

  return (
    <figure className="my-8 overflow-hidden rounded-xl border border-zinc-200 bg-black shadow-sm dark:border-zinc-800">
      <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
        <iframe
          src={src}
          title={`${platform} video ${videoId}`}
          className="absolute inset-0 h-full w-full"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          // Bilibili requires this attribute to render the full UI in some browsers
          scrolling="no"
        />
      </div>
    </figure>
  );
}
