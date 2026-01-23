// Preview layout - minimal wrapper, relies on root layout for providers
export default function PreviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-page">
      {children}
    </div>
  );
}
