import { apiUploadImage } from '../api';

export const ALLOWED_AVATAR_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif',
]);

export const AVATAR_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/avif';

export async function uploadProfilePhoto(file, updateProfile) {
  if (!file) {
    return { error: new Error('No image selected.') };
  }
  if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
    return { error: new Error('Only PNG, JPEG, WebP, GIF, and AVIF images are allowed.') };
  }

  try {
    const { url } = await apiUploadImage(file);
    if (!url) {
      return { error: new Error('Could not upload image.') };
    }
    const result = await updateProfile({ avatar_url: url });
    if (result?.error) {
      return { error: result.error };
    }
    return { url, error: null };
  } catch (err) {
    return { error: err instanceof Error ? err : new Error('Image upload failed.') };
  }
}
