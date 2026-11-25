// arKive API Client — communicates with Cloudflare Pages Functions (/api)

const API = '/api';
const TOKEN_KEY = 'arkive_token';

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function isAuthenticated() {
  return !!getToken();
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}) };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let body = options.body;
  if (body !== undefined && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }

  const res = await fetch(`${API}${path}`, { ...options, headers, body });

  if (!res.ok) {
    if (res.status === 401 && path !== '/auth/login' && path !== '/auth/register') {
      setToken(null);
    }
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
  const data = await request('/auth/register', {
    method: 'POST',
    body: { email, password, username },
  });
  setToken(data.token);
  return data;
}

export async function apiLogin(email, password) {
  const data = await request('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  setToken(data.token);
  return data;
}

export function apiLogout() {
  setToken(null);
}

export async function apiUpdatePassword(password) {
  return request('/auth/password', { method: 'PUT', body: { password } });
}

export function getGoogleAuthUrl(redirect = '/') {
  return `${API}/auth/google?redirect=${encodeURIComponent(redirect)}`;
}

export async function apiDeleteAccount() {
  const data = await request('/auth/account', { method: 'DELETE' });
  setToken(null);
  return data;
}

// ── Profile ──

export async function apiGetProfile() {
  return request('/profile');
}

export async function apiUpdateProfile(updates) {
  return request('/profile', { method: 'PUT', body: updates });
}

// ── Posts ──

export async function apiGetPosts({ page = 0, search = '' } = {}) {
  const params = new URLSearchParams();
  if (page) params.set('page', String(page));
  if (search) params.set('search', search);
  const qs = params.toString();
  return request(`/posts${qs ? `?${qs}` : ''}`);
}

export async function apiGetPinnedPosts({ search = '' } = {}) {
  const qs = search ? `?search=${encodeURIComponent(search)}` : '';
  return request(`/posts/pinned${qs}`);
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

export async function apiGetSpacePosts(spaceId, { page = 0 } = {}) {
  const qs = page ? `?page=${encodeURIComponent(page)}` : '';
  return request(`/spaces/${encodeURIComponent(spaceId)}/posts${qs}`);
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
