/** Galerie lecture seule : photo source + tracé validé. */
export default function OrderCreationGallery({
  sourcePhotoUrl,
  validatedLineartUrl,
  previewUrl,
  lineartVersion,
  readonly = true,
}) {
  const lineart = validatedLineartUrl || previewUrl
  if (!sourcePhotoUrl && !lineart) return null

  return (
    <div className="customer-card space-y-3">
      <p className="text-sm font-semibold text-[#2C1F14]">Votre création</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {sourcePhotoUrl && (
          <div className="space-y-2">
            <p className="text-xs customer-muted text-center">Photo</p>
            <div className="customer-photo-frame">
              <img src={sourcePhotoUrl} alt="Votre photo" className="w-full h-auto" />
            </div>
          </div>
        )}
        {lineart && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[#C0684A] text-center">
              Tracé validé{lineartVersion ? ` · v${lineartVersion}` : ''}
            </p>
            <div className="customer-photo-frame ring-2 ring-[#C0684A]/40">
              <img src={lineart} alt="Tracé validé" className="w-full h-auto" />
            </div>
          </div>
        )}
      </div>
      {readonly && (
        <p className="text-xs customer-muted text-center">
          Ces visuels sont conservés pour le suivi de votre commande.
        </p>
      )}
    </div>
  )
}
