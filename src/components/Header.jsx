import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { uploadProfilePhoto } from '../utils/avatarUpload';
import Avatar from './Avatar';
import AvatarPreviewModal from './AvatarPreviewModal';
import ProfileMenu from './ProfileMenu';
import './Header.css';

export default function Header({ onSearch, initialSearch = '', showMobileMenuToggle = false, mobileMenuOpen = false, onMenuToggle }) {
  const { user, profile, updateProfile } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showAvatarPreview, setShowAvatarPreview] = useState(false);
  const [resettingAvatar, setResettingAvatar] = useState(false);
  const profileRef = useRef(null);

  const currentUsername =
    profile?.username ||
    profile?.display_name ||
    user?.email?.split('@')[0] ||
    'user';
  const identiconSeed = profile?.id || user?.id || profile?.username || 'default';

  useEffect(() => {
    setSearchQuery(initialSearch);
  }, [initialSearch]);

  useEffect(() => {
    function handleClick(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setShowProfileMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleSearch(e) {
    const value = e.target.value;
    setSearchQuery(value);
    onSearch?.(value);
  }

  function handleSearchKeyDown(e) {
    if (e.key === 'Escape') {
      setSearchQuery('');
      onSearch?.('');
      e.target.blur();
    } else if (e.key === 'Enter' && !onSearch && searchQuery.trim()) {
      navigate(`/?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  }

  async function handleUseIdenticon() {
    setResettingAvatar(true);
    await updateProfile({ avatar_url: null });
    setResettingAvatar(false);
  }

  async function handleUploadPhoto(file) {
    return uploadProfilePhoto(file, updateProfile);
  }

  return (
    <header className="header">
      <div
        className="header-logo"
        onClick={() => navigate('/')}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            navigate('/');
          }
        }}
      >
        arKive
      </div>

      <div className="header-search-wrap">
        {showMobileMenuToggle && (
          <button
            className="header-menu-btn"
            onClick={onMenuToggle}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-pressed={mobileMenuOpen}
            title={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          >
            <svg className="header-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" aria-hidden="true">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        )}

        <div className="header-search">
          <svg className="header-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            id="global-search"
            className="header-search-input"
            type="text"
            placeholder="Search"
            value={searchQuery}
            onChange={handleSearch}
            onKeyDown={handleSearchKeyDown}
          />
        </div>

        {showMobileMenuToggle && (
          <button
            className="header-create-btn header-create-btn-mobile"
            onClick={() => navigate('/create')}
            title="Create post (Ctrl+K)"
            aria-label="Create post (Ctrl+K)"
          >
            <svg className="header-create-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        )}
      </div>

      <div className="header-actions">
        <button
          className="header-create-btn header-create-btn-desktop"
          onClick={() => navigate('/create')}
          title="Create post (Ctrl+K)"
          aria-label="Create post (Ctrl+K)"
        >
          <svg className="header-create-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span>Create</span>
        </button>

        <div ref={profileRef} style={{ position: 'relative' }}>
          <button
            type="button"
            className="header-avatar"
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            title="Profile"
            aria-label="Profile menu"
          >
            <Avatar
              avatarUrl={profile?.avatar_url}
              identiconValue={identiconSeed}
              size={32}
              alt="Profile picture"
            />
          </button>
          {showProfileMenu && (
            <ProfileMenu
              onClose={() => setShowProfileMenu(false)}
              onViewAvatar={() => {
                setShowProfileMenu(false);
                setShowAvatarPreview(true);
              }}
            />
          )}
        </div>
      </div>
      {showAvatarPreview && (
        <AvatarPreviewModal
          avatarUrl={profile?.avatar_url}
          identiconValue={identiconSeed}
          title={profile?.display_name || currentUsername}
          subtitle={`@${currentUsername}`}
          onUploadPhoto={handleUploadPhoto}
          onUseIdenticon={profile?.avatar_url ? handleUseIdenticon : undefined}
          usingIdenticonSaving={resettingAvatar}
          onClose={() => setShowAvatarPreview(false)}
        />
      )}
    </header>
  );
}
