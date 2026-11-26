import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiAddSpaceMember, apiGetSpaceMembers, apiGetSpaces, apiRemoveSpaceMember } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { getSharedSpaceUrl } from '../utils/appLinks';
import Avatar from './Avatar';
import AvatarPreviewModal from './AvatarPreviewModal';
import './SettingsManager.css';

export default function PeopleManager() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [spaces, setSpaces] = useState([]);
  const [selectedSpace, setSelectedSpace] = useState('');
  const [members, setMembers] = useState([]);
  const [newUsername, setNewUsername] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [previewMember, setPreviewMember] = useState(null);

  const selectedSpaceItem = useMemo(
    () => spaces.find((space) => space.id === selectedSpace) || null,
    [spaces, selectedSpace]
  );

  const fetchSpaces = useCallback(async () => {
    if (!user) return;
    try {
      const { owned = [] } = await apiGetSpaces();
      setSpaces([...owned].sort((a, b) => a.name.localeCompare(b.name)));
    } catch {
      setSpaces([]);
    }
  }, [user]);

  const fetchMembers = useCallback(async () => {
    if (!selectedSpace) {
      setMembers([]);
      return;
    }

    try {
      const { members: data = [] } = await apiGetSpaceMembers(selectedSpace);
      setMembers(data);
    } catch {
      setMembers([]);
    }
  }, [selectedSpace]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSpaces();
  }, [fetchSpaces]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchMembers();
  }, [fetchMembers]);

  useEffect(() => {
    if (!selectedSpace && spaces.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedSpace(spaces[0].id);
      return;
    }

    if (selectedSpace && !spaces.some((space) => space.id === selectedSpace)) {
      setSelectedSpace(spaces[0]?.id || '');
    }
  }, [selectedSpace, spaces]);

  async function handleAdd() {
    const username = newUsername.trim();
    if (!username || !selectedSpace) return;

    setMessage('');
    setError('');

    try {
      await apiAddSpaceMember(selectedSpace, username);
      setNewUsername('');
      setMessage('Person added.');
      await fetchMembers();
      window.dispatchEvent(new Event('arkive:sidebar-refresh'));
    } catch (insertError) {
      setError(insertError.message || 'Could not add this person.');
    }
  }

  async function handleRemove(memberUsername) {
    try {
      await apiRemoveSpaceMember(selectedSpace, memberUsername);
      await fetchMembers();
      window.dispatchEvent(new Event('arkive:sidebar-refresh'));
    } catch (err) {
      setError(err.message || 'Could not remove person.');
    }
  }

  async function handleCopyLink() {
    if (!selectedSpaceItem?.share_link) return;

    try {
      await navigator.clipboard.writeText(getSharedSpaceUrl(selectedSpaceItem.share_link));
      setMessage('Link copied.');
      setError('');
    } catch {
      setError('Could not copy link.');
      setMessage('');
    }
  }

  return (
    <div className="settings-tool">
      <div className="settings-tool-form">
        <div className="settings-tool-row">
          <select
            className="settings-tool-input"
            value={selectedSpace}
            onChange={(event) => {
              setSelectedSpace(event.target.value);
              setError('');
              setMessage('');
            }}
          >
            <option value="">Select space</option>
            {spaces.map((space) => (
              <option key={space.id} value={space.id}>{space.icon} {space.name}</option>
            ))}
          </select>

          {selectedSpaceItem && (
            <button className="btn btn-ghost" onClick={handleCopyLink}>
              Copy link
            </button>
          )}
        </div>

        {selectedSpace && (
          <div className="settings-tool-row">
            <input
              className="settings-tool-input"
              type="text"
              placeholder="Username"
              value={newUsername}
              onChange={(event) => {
                setNewUsername(event.target.value);
                setError('');
                setMessage('');
              }}
              onKeyDown={(event) => event.key === 'Enter' && handleAdd()}
            />
            <button className="btn btn-primary" onClick={handleAdd}>Add</button>
          </div>
        )}

        {error && <p className="settings-tool-note error">{error}</p>}
        {message && <p className="settings-tool-note success">{message}</p>}
      </div>

      <div className="settings-tool-list">
        {members.map((member) => {
          const displayName = member.display_name || member.member_username;
          const hasDistinctName = member.display_name && member.display_name !== member.member_username;
          return (
            <div key={member.id} className="settings-tool-item">
              <div className="settings-tool-person">
                <button
                  type="button"
                  className="settings-tool-person-avatar"
                  onClick={() => setPreviewMember(member)}
                  title="View profile picture"
                  aria-label={`View ${displayName} profile picture`}
                >
                  <Avatar
                    avatarUrl={member.avatar_url || ''}
                    identiconValue={member.member_username}
                    size={32}
                    alt={`${displayName} profile picture`}
                  />
                </button>
                <div className="settings-tool-main">
                  <button
                    type="button"
                    className="settings-tool-name settings-tool-person-link"
                    onClick={() => navigate(`/people/${encodeURIComponent(member.member_username)}`)}
                  >
                    {displayName}
                  </button>
                  {hasDistinctName && (
                    <span className="settings-tool-meta">@{member.member_username}</span>
                  )}
                </div>
              </div>
              <div className="settings-tool-item-actions">
                <button
                  type="button"
                  className="settings-tool-link"
                  onClick={() => setPreviewMember(member)}
                >
                  View picture
                </button>
                <button
                  type="button"
                  className="settings-tool-link danger"
                  onClick={() => handleRemove(member.member_username)}
                >
                  Remove
                </button>
              </div>
            </div>
          );
        })}

        {selectedSpace && members.length === 0 && <p className="settings-tool-empty">No people yet.</p>}
        {!selectedSpace && spaces.length > 0 && <p className="settings-tool-empty">Choose a space.</p>}
        {spaces.length === 0 && <p className="settings-tool-empty">Create a space first.</p>}
      </div>
      {previewMember && (
        <AvatarPreviewModal
          avatarUrl={previewMember.avatar_url || ''}
          identiconValue={previewMember.member_username}
          title={previewMember.display_name || previewMember.member_username}
          subtitle={
            previewMember.display_name && previewMember.display_name !== previewMember.member_username
              ? `@${previewMember.member_username}`
              : previewMember.member_username
          }
          onClose={() => setPreviewMember(null)}
        />
      )}
    </div>
  );
}
