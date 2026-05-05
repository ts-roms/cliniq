'use client';

import { useEffect, useRef } from 'react';

export function VideoTile({
  stream,
  muted = false,
  label,
  mirror = false,
}: {
  stream: MediaStream | null;
  muted?: boolean;
  label: string;
  mirror?: boolean;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (stream && el.srcObject !== stream) {
      el.srcObject = stream;
    }
    if (!stream && el.srcObject) {
      el.srcObject = null;
    }
  }, [stream]);

  return (
    <div className="relative overflow-hidden rounded-lg border bg-zinc-900">
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        className={`h-full w-full object-cover ${mirror ? 'scale-x-[-1]' : ''}`}
      />
      <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
        {label}
      </span>
      {!stream && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-zinc-400">
          waiting for media…
        </div>
      )}
    </div>
  );
}
