interface GeneratingOverlayProps {
  title: string;
  message: string;
  onCancel?: () => void;
}

export function GeneratingOverlay({ title, message, onCancel }: GeneratingOverlayProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {/* Animated bouncing dots */}
      <div className="flex gap-1.5 mb-6">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-3 h-3 rounded-full bg-indigo-500"
            style={{
              animation: 'bounce 1.4s infinite ease-in-out both',
              animationDelay: `${i * 0.16}s`,
            }}
          />
        ))}
      </div>
      <h3 className="text-lg font-semibold text-primary mb-1">{title}</h3>
      <p className="text-sm text-secondary max-w-md">{message}</p>
      {onCancel && (
        <button
          onClick={onCancel}
          className="mt-6 text-sm text-muted hover:text-primary transition-colors underline min-h-[44px]"
        >
          Cancel
        </button>
      )}
      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0); }
          40% { transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
