export function FloatingIcon3D({ src, size = 160, alt }: { src: string; size?: number; alt: string }) {
  return (
    <div
      className="icon-3d-float relative flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/15 to-primary/5"
      style={{ height: size, width: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} width={size * 0.65} height={size * 0.65} />
    </div>
  );
}
