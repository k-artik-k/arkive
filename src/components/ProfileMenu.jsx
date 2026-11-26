import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Avatar from './Avatar';
import './ProfileMenu.css';

export default function ProfileMenu({ onClose, onViewAvatar }) {
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();

  const currentUsername =
    profile?.username ||
    profile?.display_name ||
    user?.email?.split('@')[0] ||
    'user';
  const identiconSeed = profile?.id || user?.id || profile?.username || 'default';

  function openPage(path) {
    navigate(path);
    onClose?.();
  }

  async function handleSignOut() {
    await signOut();
    onClose?.();
  }

  return (
    <div className="profile-menu">
      <div className="profile-menu-profile">
        <button
          type="button"
          className="profile-menu-avatar-btn"
          onClick={() => onViewAvatar?.()}
          title="View profile picture"
          aria-label="View profile picture"
        >
          <Avatar
            avatarUrl={profile?.avatar_url}
            identiconValue={identiconSeed}
            size={36}
            alt="Profile picture"
          />
        </button>
        <div className="profile-menu-identity">
          <div className="profile-menu-username">{currentUsername}</div>
        </div>
      </div>

      <div className="profile-menu-sep" />

      <button type="button" className="profile-menu-item" onClick={() => onViewAvatar?.()}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        View picture
      </button>
      <button type="button" className="profile-menu-item" onClick={() => openPage('/settings/profile')}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></svg>
        Profile
      </button>
      <button type="button" className="profile-menu-item" onClick={() => openPage('/settings/people')}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        People
      </button>
      <button type="button" className="profile-menu-item" onClick={() => openPage('/settings/spaces')}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        Spaces
      </button>
      <button type="button" className="profile-menu-item" onClick={() => openPage('/settings/tags')}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
        Tags
      </button>

      <div className="profile-menu-sep" />

      <button type="button" className="profile-menu-item" onClick={handleSignOut} style={{ color: 'var(--danger)' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
        Sign out
      </button>
    </div>
  );
}
