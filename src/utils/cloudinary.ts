// ─── Cloudinary Upload Utility ────────────────────────────────────────────────
// cloud_name: doaukggrt
// Presets (unsigned): dualis_avatars | dualis_payments

const CLOUD_NAME = 'doaukggrt';

export type CloudinaryPreset = 'dualis_avatars' | 'dualis_payments' | 'dualis_products' | 'dualis_kyc';

export interface CloudinaryResult {
  secure_url: string;
  public_id: string;
}

/**
 * Uploads a file to Cloudinary using an unsigned upload preset.
 * Returns the secure URL and public_id of the uploaded asset.
 */
export async function uploadToCloudinary(
  file: File,
  preset: CloudinaryPreset,
): Promise<CloudinaryResult> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', preset);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
    { method: 'POST', body: formData },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? 'Cloudinary upload failed');
  }

  const data = await res.json();
  return { secure_url: data.secure_url, public_id: data.public_id };
}
