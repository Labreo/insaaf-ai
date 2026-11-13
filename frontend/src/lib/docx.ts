/**
 * Validated browser file download helper for backend-generated exports (DOCX / PDF).
 * Never synthesizes fake client exports when a server response is empty or an error payload.
 */
export function download(blob: Blob, name: string): void {
  if (!blob || blob.size === 0) {
    throw new Error('Export failed: received an empty file from the server.')
  }
  const mime = (blob.type || '').toLowerCase()
  if (mime.includes('application/json') || mime.includes('text/html') || mime.includes('text/plain')) {
    throw new Error('Export failed: server returned an unexpected text/error payload instead of a document.')
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name || 'instrument_draft'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
