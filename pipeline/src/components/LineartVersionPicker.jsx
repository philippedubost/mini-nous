export default function LineartVersionPicker({
  versions = [],
  selectedVersionId,
  onSelect,
  disabled,
}) {
  if (!versions.length) return null

  return (
    <div className="space-y-3">
      <p className="text-xs customer-muted text-center">
        Comparez les tracés et sélectionnez celui à valider pour l&apos;impression.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {versions.map(v => {
          const selected = selectedVersionId === v.versionId
          return (
            <button
              key={v.versionId}
              type="button"
              disabled={disabled}
              onClick={() => onSelect?.(v)}
              className={`rounded-xl overflow-hidden border-2 text-left transition-all ${
                selected
                  ? 'border-[#C0684A] shadow-md ring-2 ring-[#C0684A]/20'
                  : 'border-[#C4A882]/50 hover:border-[#C0684A]/60'
              }`}
            >
              <div className="aspect-[4/3] bg-white p-2">
                {v.url
                  ? <img src={v.url} alt={`Tracé v${v.studioVersion}`} className="w-full h-full object-contain"/>
                  : <span className="text-xs customer-muted">—</span>}
              </div>
              <div className={`px-3 py-2 text-center text-xs font-bold ${
                selected ? 'bg-[#FAF0EB] text-[#C0684A]' : 'bg-[#FAF7F2] text-[#7A5C38]'
              }`}>
                Tracé v{v.studioVersion}
                {selected && ' ✓'}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
