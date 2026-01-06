import { useState, useEffect } from 'react';
import api from '../services/api';

interface AuthenticatedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  fallback?: React.ReactNode;
}

export default function AuthenticatedImage({ src, alt, fallback, ...props }: AuthenticatedImageProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    const fetchImage = async () => {
      try {
        setLoading(true);
        setError(false);

        // Call the proxy endpoint
        const response = await api.get('/media/proxy', {
          params: { url: src },
          responseType: 'blob',
        });

        if (active) {
          objectUrl = URL.createObjectURL(response.data);
          setImageSrc(objectUrl);
        }
      } catch (err) {
        if (active) {
          console.error('Failed to load image:', err);
          setError(true);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    if (src) {
      fetchImage();
    }

    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [src]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 ${props.className}`}>
        <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error) {
    return fallback ? (
      <>{fallback}</>
    ) : (
      <div className={`flex items-center justify-center bg-gray-100 text-gray-400 ${props.className}`}>
        <span className="text-xs">Failed to load</span>
      </div>
    );
  }

  return <img src={imageSrc || ''} alt={alt} {...props} />;
}

