import AdminSettingsForm from '../components/AdminSettingsForm'

export default function AdminSettingsPage() {
  return (
    <div className="space-y-2">
      <p className="text-sm text-stone-500 mb-4">
        Paramètres par défaut pour les nouvelles générations du pipeline.
      </p>
      <AdminSettingsForm />
    </div>
  )
}
