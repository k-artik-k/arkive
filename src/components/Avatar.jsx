import { useState } from 'react';
import Identicon from './Identicon';
import './Avatar.css';

export default function Avatar({
  avatarUrl = '',
  identiconValue = 'default',
  size = 32,
  alt = '',
  className = '',
}) {
  const [failedUrl, setFailedUrl] = useState('');
  const normalizedUrl = typeof avatarUrl === 'string' ? avatarUrl.trim() : '';
  const showImage = Boolean(normalizedUrl) && failedUrl !== normalizedUrl;

  return (
    <span
      className={`arkive-avatar ${className}`.trim()}
      style={{ width: size, height: size }}
    >
      {showImage ? (
        <img
          src={normalizedUrl}
          alt={alt}
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(normalizedUrl)}
        />
      ) : (
        <Identicon value={identiconValue || 'default'} size={size} />
      )}
    </span>
  );
}
