import AdminSettingsForm from '../components/AdminSettingsForm'

export default function AdminSettingsPage() {
  return (
    <div className="space-y-2">
      <p className="text-sm text-stone-500 mb-4">
        Prompts pipeline partagés (2K · 16:9). La référence line art est stockée sur R2.
      </p>
      <AdminSettingsForm />
    </div>
  )
}
