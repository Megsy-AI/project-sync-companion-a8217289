import { useEffect, useState, type ImgHTMLAttributes } from "react";
import { cacheImage, getCachedImage } from "@/lib/image-cache";

interface CachedImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  src: string;
}

/** <img> that serves from localStorage first, then refreshes in the background. */
const CachedImage = ({ src, alt = "", loading = "lazy", ...rest }: CachedImageProps) => {
  const [resolved, setResolved] = useState<string>(() => getCachedImage(src) || src);

  useEffect(() => {
    let alive = true;
    const hit = getCachedImage(src);
    if (hit) setResolved(hit);
    else setResolved(src);
    void cacheImage(src).then((d) => {
      if (alive && d) setResolved(d);
    });
    return () => {
      alive = false;
    };
  }, [src]);

  return <img src={resolved} alt={alt} loading={loading} draggable={false} {...rest} />;
};

export default CachedImage;
