// What the disease and health-update endpoints accept for a plant photo.
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024

// Returns null when the file is fine, otherwise why it was refused.
export function checkImageFile(file) {
  if (!file || !ACCEPTED_IMAGE_TYPES.includes(file.type)) return 'type'
  if (file.size > MAX_IMAGE_BYTES) return 'size'
  return null
}
