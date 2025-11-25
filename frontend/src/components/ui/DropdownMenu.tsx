import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, MoreVertical } from 'lucide-react';

export interface DropdownMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  divider?: boolean;
}

interface DropdownMenuProps {
  items: DropdownMenuItem[];
  trigger?: React.ReactNode;
  triggerIcon?: 'chevron' | 'dots' | 'none';
  className?: string;
  menuClassName?: string;
  align?: 'left' | 'right' | 'center';
}

export default function DropdownMenu({
  items,
  trigger,
  triggerIcon = 'chevron',
  className = '',
  menuClassName = '',
  align = 'right',
}: DropdownMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleItemClick = (item: DropdownMenuItem) => {
    if (!item.disabled && item.onClick) {
      item.onClick();
      setIsOpen(false);
    }
  };

  // Determine menu alignment classes
  const alignmentClasses = {
    left: 'left-0',
    right: 'right-0',
    center: 'left-1/2 transform -translate-x-1/2',
  };

  return (
    <div className={`relative inline-block ${className}`} ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
      >
        {trigger}
        {triggerIcon === 'chevron' && (
          <ChevronDown
            className={`w-4 h-4 transition-transform ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        )}
        {triggerIcon === 'dots' && <MoreVertical className="w-4 h-4" />}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className={`
            absolute top-full mt-2 min-w-[200px] bg-white border border-gray-200
            rounded-lg shadow-xl z-20 py-1
            ${alignmentClasses[align]}
            ${menuClassName}
          `}
        >
          {items.map((item, index) => {
            if (item.divider) {
              return <hr key={index} className="my-1 border-gray-200" />;
            }

            return (
              <button
                key={index}
                type="button"
                onClick={() => handleItemClick(item)}
                disabled={item.disabled}
                className={`
                  w-full text-left px-4 py-2 text-sm flex items-center gap-3
                  ${
                    item.disabled
                      ? 'text-gray-400 cursor-not-allowed'
                      : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                  }
                  transition-colors
                `}
              >
                {item.icon && (
                  <span className="flex-shrink-0 w-4 h-4">{item.icon}</span>
                )}
                <span className="flex-grow">{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}