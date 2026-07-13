/** Logo WoodTribe — Fraunces + accent terracotta sur « Wood ». */
export default function BrandLogo({ className = '', compact = false, as: Tag = 'span', dark = false }) {
  return (
    <Tag
      className={`brand-logo${compact ? ' brand-logo--compact' : ''}${dark ? ' brand-logo--on-dark' : ''}${className ? ` ${className}` : ''}`}
    >
      <span className="brand-logo-wood">Wood</span>Tribe
    </Tag>
  )
}
