// arKive API Client — communicates with Cloudflare Pages Functions (/api)
// Session authentication uses an HttpOnly SameSite=Lax cookie managed by the server.

const API = '/api';

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };

  let body = options.body;
  if (body !== undefined && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }

  const res = await fetch(`${API}${path}`, {
    credentials: 'same-origin',
    ...options,
    headers,
    body,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText || 'Request failed' }));
    const error = new Error(err.error || err.message || 'Request failed');
    error.status = res.status;
    throw error;
  }

  if (res.status === 204) return {};
  return res.json();
}

// ── Auth ──

export async function apiRegister(email, password, username) {
  return request('/auth/register', {
    method: 'POST',
    body: { email, password, username },
  });
}

export async function apiLogin(email, password) {
  return request('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
}

export async function apiLogout() {
  return request('/auth/logout', { method: 'POST' });
}

export async function apiUpdatePassword(password) {
  return request('/auth/password', { method: 'PUT', body: { password } });
}

export function getGoogleAuthUrl(redirect = '/') {
  return `${API}/auth/google?redirect=${encodeURIComponent(redirect)}`;
}

export async function apiDeleteAccount() {
  return request('/auth/account', { method: 'DELETE' });
}

// ── Profile ──

export async function apiGetProfile() {
  return request('/profile');
}

export async function apiUpdateProfile(updates) {
  return request('/profile', { method: 'PUT', body: updates });
}

// ── Posts ──

export async function apiGetPosts({ page = 0, search = '', tag = '', drafts = false } = {}) {
  const params = new URLSearchParams();
  if (page) params.set('page', String(page));
  if (search) params.set('search', search);
  if (tag) params.set('tag', tag);
  if (drafts) params.set('drafts', '1');
  const qs = params.toString();
  return request(`/posts${qs ? `?${qs}` : ''}`);
}

export async function apiGetPinnedPosts({ search = '', tag = '', drafts = false } = {}) {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (tag) params.set('tag', tag);
  if (drafts) params.set('drafts', '1');
  const qs = params.toString();
  return request(`/posts/pinned${qs ? `?${qs}` : ''}`);
}

export async function apiGetPostIds() {
  return request('/posts/ids');
}

export async function apiGetCalendarPosts(year) {
  return request(`/posts/calendar?year=${encodeURIComponent(year)}`);
}

export async function apiGetPost(id) {
  return request(`/posts/${encodeURIComponent(id)}`);
}

export async function apiCreatePost(data) {
  return request('/posts', { method: 'POST', body: data });
}

export async function apiUpdatePost(id, data) {
  return request(`/posts/${encodeURIComponent(id)}`, { method: 'PUT', body: data });
}

export async function apiDeletePost(id) {
  return request(`/posts/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ── Tags ──

export async function apiGetTags() {
  return request('/tags');
}

export async function apiCreateTag(data) {
  return request('/tags', { method: 'POST', body: data });
}

export async function apiUpdateTag(id, data) {
  return request(`/tags/${encodeURIComponent(id)}`, { method: 'PUT', body: data });
}

export async function apiDeleteTag(id) {
  return request(`/tags/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ── Spaces ──

export async function apiGetSpaces() {
  return request('/spaces');
}

export async function apiGetSpace(id) {
  return request(`/spaces/${encodeURIComponent(id)}`);
}

export async function apiCreateSpace(data) {
  return request('/spaces', { method: 'POST', body: data });
}

export async function apiUpdateSpace(id, data) {
  return request(`/spaces/${encodeURIComponent(id)}`, { method: 'PUT', body: data });
}

export async function apiDeleteSpace(id) {
  return request(`/spaces/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function apiGetSpacePosts(spaceId, { page = 0, tag = '' } = {}) {
  const params = new URLSearchParams();
  if (page) params.set('page', String(page));
  if (tag) params.set('tag', tag);
  const qs = params.toString();
  return request(`/spaces/${encodeURIComponent(spaceId)}/posts${qs ? `?${qs}` : ''}`);
}

export async function apiGetSpaceMembers(spaceId) {
  return request(`/spaces/${encodeURIComponent(spaceId)}/members`);
}

export async function apiAddSpaceMember(spaceId, username) {
  return request(`/spaces/${encodeURIComponent(spaceId)}/members`, {
    method: 'POST',
    body: { username },
  });
}

export async function apiRemoveSpaceMember(spaceId, username) {
  return request(
    `/spaces/${encodeURIComponent(spaceId)}/members/${encodeURIComponent(username)}`,
    { method: 'DELETE' }
  );
}

// ── Shared ──

export async function apiResolveShareLink(shareLink) {
  return request(`/shared/${encodeURIComponent(shareLink)}`);
}

export async function apiCheckSharedPost(shareLink, postId) {
  return request(
    `/shared/${encodeURIComponent(shareLink)}/post/${encodeURIComponent(postId)}`
  );
}

// ── People ──

export async function apiGetPeople() {
  return request('/people');
}

export async function apiGetPerson(username) {
  return request(`/people/${encodeURIComponent(username)}`);
}

// ── Images ──

export async function apiUploadImage(file) {
  const formData = new FormData();
  formData.append('file', file);
  return request('/images', { method: 'POST', body: formData });
}

// ── Data Export / Import ──

export async function apiExportData() {
  return request('/data/export');
}

export async function apiImportData(data) {
  return request('/data/import', { method: 'POST', body: data });
}
