import { useEffect, useState } from 'react';
import { ChurchPreloader } from './ChurchPreloader';

type PreloadedImageProps = {
  src: string;
  alt: string;
  className?: string;
  imageClassName?: string;
  loading?: 'eager' | 'lazy';
};

export function PreloadedImage({ src, alt, className = '', imageClassName = '', loading = 'lazy' }: PreloadedImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setIsLoaded(false);
  }, [src]);

  const wrapperClassName = ['preloaded-image', isLoaded ? 'is-loaded' : 'is-loading', className].filter(Boolean).join(' ');

  return (
    <span className={wrapperClassName}>
      {!isLoaded ? <ChurchPreloader compact visualOnly label="Загружаем фото" className="image-preloader" /> : null}
      <img
        className={imageClassName}
        src={src}
        alt={alt}
        loading={loading}
        decoding="async"
        onLoad={() => setIsLoaded(true)}
        onError={() => setIsLoaded(true)}
      />
    </span>
  );
}
