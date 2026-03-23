export default function AboutPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-text-primary">About</h1>
      <p className="text-text-secondary">
        This is a sample Azure serverless application with dual-mode authentication.
      </p>
      <div className="rounded-lg border border-border bg-surface-card p-6 transition-colors duration-200">
        <h2 className="mb-3 text-lg font-semibold text-text-primary">Auth Modes</h2>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="font-medium text-text-primary">Demo Mode</dt>
            <dd className="mt-1 text-text-secondary">
              Shared username/password credentials. No Microsoft account required.
              Set <code className="rounded bg-surface-alt px-1.5 py-0.5 text-xs">NEXT_PUBLIC_AUTH_MODE=demo</code>.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-text-primary">Entra ID Mode</dt>
            <dd className="mt-1 text-text-secondary">
              MSAL v5 redirect-based single-tenant login. Production default.
              Set <code className="rounded bg-surface-alt px-1.5 py-0.5 text-xs">NEXT_PUBLIC_AUTH_MODE=entra</code> and configure your Entra ID app registration.
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
