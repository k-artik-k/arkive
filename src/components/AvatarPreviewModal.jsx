import { useEffect } from 'react';
import Avatar from './Avatar';
import './AvatarPreviewModal.css';

export default function AvatarPreviewModal({
  avatarUrl = '',
  identiconValue = 'default',
  title = '',
  subtitle = '',
  onUseIdenticon,
  usingIdenticonSaving = false,
  onClose,
}) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose?.();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const hasCustomPhoto = Boolean(typeof avatarUrl === 'string' && avatarUrl.trim());

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title ? `${title} profile picture` : 'Profile picture'}
    >
      <div className="modal-content avatar-preview-modal" onClick={(event) => event.stopPropagation()}>
        <div className="avatar-preview-header">
          <div className="avatar-preview-meta">
            {title && <h3 className="avatar-preview-title">{title}</h3>}
            {subtitle && <p className="avatar-preview-subtitle">{subtitle}</p>}
          </div>
          <button
            type="button"
            className="avatar-preview-close"
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="avatar-preview-stage">
          <div className="avatar-preview-frame">
            <Avatar
              avatarUrl={avatarUrl}
              identiconValue={identiconValue}
              size={220}
              alt={title ? `${title} profile picture` : 'Profile picture'}
            />
          </div>
        </div>

        <div className="modal-actions avatar-preview-actions">
          {hasCustomPhoto && onUseIdenticon && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onUseIdenticon}
              disabled={usingIdenticonSaving}
            >
              {usingIdenticonSaving ? 'Switching...' : 'Use identicon'}
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
