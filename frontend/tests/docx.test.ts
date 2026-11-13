import test from 'node:test'
import assert from 'node:assert/strict'
import { download } from '../src/lib/docx.ts'

test('download rejects empty blobs and error payloads without touching DOM', () => {
  assert.throws(
    () => download(new Blob([], { type: 'application/pdf' }), 'draft.pdf'),
    /empty file/i,
  )
  assert.throws(
    () => download(new Blob(['{"detail":"err"}'], { type: 'application/json' }), 'draft.docx'),
    /error payload/i,
  )
  assert.throws(
    () => download(new Blob(['<html>502</html>'], { type: 'text/html' }), 'draft.pdf'),
    /error payload/i,
  )
  assert.throws(
    () => download(new Blob(['plain error'], { type: 'text/plain' }), 'draft.docx'),
    /error payload/i,
  )
})

test('download triggers anchor download for valid binary DOCX/PDF blob and cleans up URL', () => {
  let clicked = 0
  let removed = 0
  let revoked = ''
  const createdAnchor: Record<string, unknown> = {
    style: {},
    click() {
      clicked += 1
    },
    remove() {
      removed += 1
    },
  }

  const origDoc = globalThis.document
  const origCreateObj = URL.createObjectURL
  const origRevokeObj = URL.revokeObjectURL
  const origSetTimeout = globalThis.setTimeout

  try {
    ;(globalThis as unknown as { document: unknown }).document = {
      createElement: () => createdAnchor,
      body: { appendChild: () => {} },
    }
    URL.createObjectURL = () => 'blob:mock-123'
    URL.revokeObjectURL = (u: string) => {
      revoked = u
    }
    ;(globalThis as unknown as { setTimeout: unknown }).setTimeout = (fn: () => void) => {
      fn()
      return 1
    }

    const pdfBlob = new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], {
      type: 'application/pdf',
    })
    download(pdfBlob, 'pleading.pdf')

    assert.equal(createdAnchor.href, 'blob:mock-123')
    assert.equal(createdAnchor.download, 'pleading.pdf')
    assert.equal(clicked, 1)
    assert.equal(removed, 1)
    assert.equal(revoked, 'blob:mock-123')
  } finally {
    ;(globalThis as unknown as { document: unknown }).document = origDoc
    URL.createObjectURL = origCreateObj
    URL.revokeObjectURL = origRevokeObj
    ;(globalThis as unknown as { setTimeout: unknown }).setTimeout = origSetTimeout
  }
})
