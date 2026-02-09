// Shared viewer layout - minimal wrapper, no sidebar or auth
export default function SharedLayout({
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
