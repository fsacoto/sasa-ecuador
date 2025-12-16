'use client';

interface AlertDialogProps {
  open: boolean;
  title?: string;
  message: string;
  buttonText?: string;
  onClose: () => void;
}

export default function AlertDialog({
  open,
  title = 'Alert',
  message,
  buttonText = 'OK',
  onClose,
}: AlertDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-md shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {title}
          </h3>
          <p className="text-gray-600 text-sm whitespace-pre-line">
            {message}
          </p>
        </div>
        <div className="flex justify-end px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[#4f0c1b] text-white hover:bg-[#6b1824] font-medium transition-colors"
          >
            {buttonText}
          </button>
        </div>
      </div>
    </div>
  );
}





