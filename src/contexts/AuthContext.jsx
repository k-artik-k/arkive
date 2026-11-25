import { createContext, useContext, useEffect, useState } from 'react';
import {
  apiDeleteAccount,
  apiGetProfile,
  apiLogin,
  apiLogout,
  apiRegister,
  apiUpdatePassword,
  apiUpdateProfile,
  getGoogleAuthUrl,
} from '../api';

const AuthContext = createContext({});

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  async function loadSession() {
    try {
      const data = await apiGetProfile();
      setUser(data.user || (data.profile ? { id: data.profile.id, email: '' } : null));
      setProfile(data.profile || null);
    } catch {
      setUser(null);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSession();
  }, []);

  async function updateProfile(updates) {
    try {
      const { profile: updated } = await apiUpdateProfile(updates);
      setProfile(updated);
      return { data: updated, error: null };
    } catch (error) {
      return { data: null, error };
    }
  }

  async function updateUsername(username) {
    const nextUsername = username.trim();
    if (!nextUsername) {
      return { data: null, error: { message: 'Username is required' } };
    }
    return updateProfile({ username: nextUsername, display_name: nextUsername });
  }

  async function signUp(email, password, username) {
    const nextUsername = username.trim();
    if (!nextUsername) {
      return { data: null, error: { message: 'Username is required' } };
    }

    try {
      const data = await apiRegister(email, password, nextUsername);
      setUser(data.user);
      setProfile(data.profile);
      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  }

  async function signIn(email, password) {
    try {
      const data = await apiLogin(email, password);
      setUser(data.user);
      setProfile(data.profile);
      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  }

  function signInWithGoogle(redirectPath = '/') {
    window.location.assign(getGoogleAuthUrl(redirectPath));
  }

  async function signOut() {
    try {
      await apiLogout();
    } catch {
      // ignore network error on sign out
    }
    setUser(null);
    setProfile(null);
  }

  async function updatePassword(newPassword) {
    try {
      const data = await apiUpdatePassword(newPassword);
      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  }

  async function deleteAccount() {
    try {
      const data = await apiDeleteAccount();
      setUser(null);
      setProfile(null);
      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  }

  const value = {
    user,
    profile,
    loading,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    updatePassword,
    deleteAccount,
    updateProfile,
    updateUsername,
    fetchProfile: loadSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
