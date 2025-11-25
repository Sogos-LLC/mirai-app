'use client';

import React, { useState } from 'react';
import { Persona } from '@/types';
import { X } from 'lucide-react';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';

interface PersonaCardProps {
  persona: Persona;
  onUpdate: (persona: Partial<Persona>) => void;
  onRemove: () => void;
}

export default function PersonaCard({ persona, onUpdate, onRemove }: PersonaCardProps) {
  return (
    <div className="bg-gray-50 rounded-lg p-6 relative">
      <button
        onClick={onRemove}
        className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
      >
        <X className="w-5 h-5" />
      </button>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Role: <span className="text-gray-400">(eg: Account Executive; Product Marketing)</span>
          </label>
          <input
            type="text"
            value={persona.role}
            onChange={(e) => onUpdate({ role: e.target.value })}
            placeholder="Account Executive; Product Marketing"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            KPIs:
          </label>
          <textarea
            value={persona.kpis}
            onChange={(e) => onUpdate({ kpis: e.target.value })}
            placeholder="What does this person care about?"
            rows={3}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
          />
        </div>
      </div>
    </div>
  );
}
