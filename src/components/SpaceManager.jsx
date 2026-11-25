import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiCreateSpace, apiDeleteSpace, apiGetSpaces, apiGetTags, apiUpdateSpace } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { getSharedSpaceUrl } from '../utils/appLinks';
import SettingsItemMenu from './SettingsItemMenu';
import './SettingsManager.css';

const DEFAULT_SPACE_ICON = '\uD83D\uDCC1';

export default function SpaceManager() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [spaces, setSpaces] = useState([]);
  const [tags, setTags] = useState([]);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(DEFAULT_SPACE_ICON);
  const [tagId, setTagId] = useState('');
  const [showInMenu, setShowInMenu] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [feedback, setFeedback] = useState({ type: '', text: '' });

  const fetchSpaces = useCallback(async () => {
    try {
      const { owned = [] } = await apiGetSpaces();
      setSpaces(owned);
    } catch {
      setSpaces([]);
    }
  }, []);

  const fetchTags = useCallback(async () => {
    try {
      const { tags: data = [] } = await apiGetTags();
      setTags([...data].sort((a, b) => a.name.localeCompare(b.name)));
    } catch {
      setTags([]);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSpaces();
    fetchTags();
  }, [user, fetchSpaces, fetchTags]);

  function resetForm() {
    setName('');
    setIcon(DEFAULT_SPACE_ICON);
    setTagId('');
    setShowInMenu(true);
    setEditingId(null);
  }

  async function handleSave() {
    const nextName = name.trim();

    if (!nextName) {
      setFeedback({ type: 'error', text: 'Name is required.' });
      return;
    }

    const payload = {
      name: nextName,
      icon: icon || DEFAULT_SPACE_ICON,
      tag_id: tagId || null,
      show_in_menu: showInMenu,
    };

    try {
      if (editingId) {
        await apiUpdateSpace(editingId, payload);
      } else {
        await apiCreateSpace(payload);
      }
      setFeedback({ type: 'success', text: editingId ? 'Space updated.' : 'Space created.' });
      resetForm();
      await fetchSpaces();
      window.dispatchEvent(new Event('arkive:sidebar-refresh'));
    } catch (error) {
      setFeedback({ type: 'error', text: error.message || 'Could not save space.' });
    }
  }

  async function handleDelete(id) {
    try {
      await apiDeleteSpace(id);
      setFeedback({ type: 'success', text: 'Space deleted.' });
      await fetchSpaces();
      window.dispatchEvent(new Event('arkive:sidebar-refresh'));
    } catch (error) {
      setFeedback({ type: 'error', text: error.message || 'Could not delete space.' });
    }
  }

  function startEdit(space) {
    setEditingId(space.id);
    setName(space.name);
    setIcon(space.icon);
    setTagId(space.tag_id || '');
    setShowInMenu(space.show_in_menu);
    setFeedback({ type: '', text: '' });
  }

  async function copyShareLink(space) {
    try {
      await navigator.clipboard.writeText(getSharedSpaceUrl(space.share_link));
      setFeedback({ type: 'success', text: 'Link copied.' });
    } catch {
      setFeedback({ type: 'error', text: 'Could not copy link.' });
    }
  }

  return (
    <div className="settings-tool">
      <div className="settings-tool-form">
        <div className="settings-tool-grid settings-tool-grid-compact">
          <label className="settings-tool-field">
            <span className="settings-tool-label">Icon</span>
            <input
              className="settings-tool-input icon"
              type="text"
              value={icon}
              onChange={(event) => {
                setIcon(event.target.value);
                setFeedback({ type: '', text: '' });
              }}
              title="Icon"
            />
          </label>

          <label className="settings-tool-field">
            <span className="settings-tool-label">Name</span>
            <input
              className="settings-tool-input"
              type="text"
              placeholder="Space name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setFeedback({ type: '', text: '' });
              }}
            />
          </label>
        </div>

        <label className="settings-tool-field">
          <span className="settings-tool-label">Tag</span>
          <select
            className="settings-tool-input"
            value={tagId}
            onChange={(event) => {
              setTagId(event.target.value);
              setFeedback({ type: '', text: '' });
            }}
          >
            <option value="">None</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>{tag.name}</option>
            ))}
          </select>
        </label>

        <label className="settings-tool-toggle">
          <input
            type="checkbox"
            checked={showInMenu}
            onChange={(event) => {
              setShowInMenu(event.target.checked);
              setFeedback({ type: '', text: '' });
            }}
          />
          Show in sidebar
        </label>

        {feedback.text && (
          <p className={`settings-tool-note ${feedback.type}`}>{feedback.text}</p>
        )}

        <div className="settings-tool-actions">
          <button className="btn btn-primary" onClick={handleSave}>
            {editingId ? 'Save' : 'Create'}
          </button>
          {editingId && (
            <button className="btn btn-ghost" onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
      </div>

      <div className="settings-tool-list">
        {spaces.map((space) => (
          <div key={space.id} className="settings-tool-item">
            <div className="settings-tool-main">
              <div className="settings-tool-title-row">
                <span className="settings-tool-name">{space.icon} {space.name}</span>
                {!space.show_in_menu && <span className="settings-tool-chip">Hidden</span>}
              </div>
              {space.tags?.name && (
                <div className="settings-tool-meta">Tag · {space.tags.name}</div>
              )}
            </div>

            <div className="settings-tool-item-actions">
              <SettingsItemMenu
                items={[
                  { label: 'Open', onSelect: () => navigate(`/space/${space.id}`) },
                  { label: 'Copy link', onSelect: () => copyShareLink(space) },
                  { label: 'Edit', onSelect: () => startEdit(space) },
                  { label: 'Delete', danger: true, onSelect: () => handleDelete(space.id) },
                ]}
              />
            </div>
          </div>
        ))}

        {spaces.length === 0 && <p className="settings-tool-empty">No spaces yet.</p>}
      </div>
    </div>
  );
}
