// Uploads a File directly to R2 using a presigned URL. Returns the public
// URL to store on the Quote/Photo record.
export async function uploadPhoto(file: File): Promise<string> {
  const presignRes = await fetch("/api/uploads/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: file.name, contentType: file.type }),
  });

  if (!presignRes.ok) {
    throw new Error("Could not prepare upload");
  }

  const { uploadUrl, publicUrl } = await presignRes.json();

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });

  if (!putRes.ok) {
    throw new Error("Upload failed");
  }

  return publicUrl;
}
