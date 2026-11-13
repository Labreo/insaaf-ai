/**
 * Clean architectural background for a full-day desktop legal practice & research workspace.
 */
export default function Backdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-void">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brass/25 to-transparent" />
      <div className="absolute inset-0 bg-[radial-gradient(65%_40%_at_50%_0%,rgba(201,168,104,0.06)_0%,rgba(11,13,17,0)_70%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:64px_64px] opacity-30" />
    </div>
  )
}
