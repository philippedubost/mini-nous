import { ImageWithZoom } from './ImageLightbox'

function RejectedLineartThumb({ version }) {
  if (!version?.url) return null
  return (
    <div className="relative w-[min(42%,150px)] shrink-0">
      <p className="text-[10px] customer-muted text-center mb-1 line-through decoration-[#8A4030]/60">
        Tracé v{version.studioVersion}
      </p>
      <div className="customer-photo-frame opacity-45 grayscale-[35%] relative overflow-hidden">
        <ImageWithZoom
          src={version.url}
          alt={`Tracé v${version.studioVersion} non retenu`}
          label={`Tracé v${version.studioVersion} (non retenu)`}
          imgClassName="w-full h-auto"
        />
        <div
          className="absolute inset-0 pointer-events-none flex items-center justify-center"
          aria-hidden
        >
          <div className="absolute w-[120%] h-0.5 bg-[#8A4030]/55 rotate-[-12deg]" />
        </div>
      </div>
      <p className="text-[9px] text-center customer-muted mt-1">Non retenu</p>
    </div>
  )
}

/** Galerie lecture seule : photo source + tracé validé. */
export default function OrderCreationGallery({
  sourcePhotoUrl,
  validatedLineartUrl,
  previewUrl,
  lineartVersion,
  lineartVersions = [],
  readonly = true,
}) {
  const lineart = validatedLineartUrl || previewUrl
  const validatedV = lineartVersion ?? null
  const rejected = validatedV
    ? lineartVersions.filter(v => v.studioVersion !== validatedV && v.url)
    : []

  if (!sourcePhotoUrl && !lineart) return null

  return (
    <div className="customer-card space-y-3">
      <p className="text-sm font-semibold text-[#2C1F14]">Votre création</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {sourcePhotoUrl && (
          <div className="space-y-2">
            <p className="text-xs customer-muted text-center">Photo</p>
            <div className="customer-photo-frame">
              <ImageWithZoom
                src={sourcePhotoUrl}
                alt="Votre photo"
                label="Votre photo"
                imgClassName="w-full h-auto"
              />
            </div>
          </div>
        )}
        {lineart && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[#C0684A] text-center">
              Tracé validé{lineartVersion ? ` · v${lineartVersion}` : ''}
            </p>
            <div className="customer-photo-frame ring-2 ring-[#C0684A]/40">
              <ImageWithZoom
                src={lineart}
                alt="Tracé validé"
                label={`Tracé validé${lineartVersion ? ` v${lineartVersion}` : ''}`}
                imgClassName="w-full h-auto"
              />
            </div>
          </div>
        )}
      </div>

      {rejected.length > 0 && (
        <div className="pt-3 border-t border-[#E8DFD4] space-y-2">
          <p className="text-xs customer-muted text-center">Autre version non retenue</p>
          <div className="flex flex-wrap justify-center gap-3">
            {rejected.map(v => (
              <RejectedLineartThumb key={v.versionId} version={v} />
            ))}
          </div>
        </div>
      )}

      {readonly && (
        <p className="hidden sm:block text-xs customer-muted text-center">
          Cliquez sur la loupe pour agrandir et vérifier le détail.
        </p>
      )}
    </div>
  )
}
