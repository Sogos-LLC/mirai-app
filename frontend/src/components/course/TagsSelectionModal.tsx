'use client';

import React, { useState } from 'react';
import { Plus, Tag, Hash, X } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';

interface TagsSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
}

export default function TagsSelectionModal({
  isOpen,
  onClose,
  selectedTags,
  onTagsChange
}: TagsSelectionModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [customTagInput, setCustomTagInput] = useState('');

  // Predefined tags organized by category
  const predefinedTags = {
    'Skill Level': ['Beginner', 'Intermediate', 'Advanced', 'Expert'],
    'Department': ['Sales', 'Marketing', 'Engineering', 'HR', 'Product', 'Customer Success', 'Finance'],
    'Content Type': ['Tutorial', 'Workshop', 'Certification', 'Onboarding', 'Best Practices', 'Compliance'],
    'Duration': ['Quick (< 30 min)', 'Short (1 hour)', 'Medium (2-4 hours)', 'Long (> 4 hours)'],
    'Topics': ['Leadership', 'Communication', 'Technical Skills', 'Soft Skills', 'Process', 'Tools', 'Strategy']
  };

  // Popular/suggested tags
  const suggestedTags = [
    'Required', 'Optional', 'New Hire', 'Quarterly Training', 'Annual Review',
    'Remote Work', 'Management', 'Safety', 'Security', 'Innovation'
  ];

  const handleAddTag = (tag: string) => {
    if (!selectedTags.includes(tag)) {
      onTagsChange([...selectedTags, tag]);
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    onTagsChange(selectedTags.filter(tag => tag !== tagToRemove));
  };

  const handleAddCustomTag = () => {
    const trimmedTag = customTagInput.trim();
    if (trimmedTag && !selectedTags.includes(trimmedTag)) {
      handleAddTag(trimmedTag);
      setCustomTagInput('');
    }
  };

  const filteredPredefinedTags = Object.entries(predefinedTags).reduce<Record<string, string[]>>((acc, [category, tags]) => {
    const filtered = tags.filter(tag =>
      tag.toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (filtered.length > 0) {
      acc[category] = filtered;
    }
    return acc;
  }, {});

  const filteredSuggestedTags = suggestedTags.filter(tag =>
    tag.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <ResponsiveModal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Tags"
      size="lg"
    >
      <div className="flex flex-col h-full">
        {/* Selected Tags */}
        {selectedTags.length > 0 && (
          <div className="pb-3 mb-3 border-b border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <Tag className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Selected ({selectedTags.length})</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary-100 text-primary-700 rounded-full text-sm font-medium"
                >
                  <Hash className="w-3 h-3" />
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="ml-1 hover:bg-primary-200 rounded-full p-0.5 min-w-[24px] min-h-[24px] flex items-center justify-center"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto -mx-4 px-4 lg:mx-0 lg:px-0">
          {/* Search and Custom Tag Input */}
          <div className="mb-4 lg:mb-6 space-y-3">
            <input
              type="text"
              placeholder="Search existing tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-3 lg:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none min-h-[44px]"
            />

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="Create a custom tag..."
                value={customTagInput}
                onChange={(e) => setCustomTagInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleAddCustomTag();
                  }
                }}
                className="flex-1 px-4 py-3 lg:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none min-h-[44px]"
              />
              <button
                onClick={handleAddCustomTag}
                disabled={!customTagInput.trim()}
                className="px-4 py-3 lg:py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[44px]"
              >
                <Plus className="w-4 h-4" />
                Add Custom
              </button>
            </div>
          </div>

          {/* Suggested Tags */}
          {filteredSuggestedTags.length > 0 && (
            <div className="mb-4 lg:mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Suggested Tags</h3>
              <div className="flex flex-wrap gap-2">
                {filteredSuggestedTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => handleAddTag(tag)}
                    disabled={selectedTags.includes(tag)}
                    className={`
                      inline-flex items-center gap-1 px-3 py-2 lg:py-1.5 rounded-full text-sm font-medium
                      transition-all min-h-[36px]
                      ${selectedTags.includes(tag)
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                      }
                    `}
                  >
                    <Hash className="w-3 h-3" />
                    {tag}
                    {!selectedTags.includes(tag) && (
                      <Plus className="w-3 h-3 ml-0.5" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Categorized Tags */}
          {Object.entries(filteredPredefinedTags).map(([category, tags]) => (
            <div key={category} className="mb-4 lg:mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">{category}</h3>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => handleAddTag(tag)}
                    disabled={selectedTags.includes(tag)}
                    className={`
                      inline-flex items-center gap-1 px-3 py-2 lg:py-1.5 rounded-full text-sm font-medium
                      transition-all min-h-[36px]
                      ${selectedTags.includes(tag)
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                      }
                    `}
                  >
                    <Hash className="w-3 h-3" />
                    {tag}
                    {!selectedTags.includes(tag) && (
                      <Plus className="w-3 h-3 ml-0.5" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 mt-4 pt-4 border-t border-gray-200">
          <div className="text-sm text-gray-500 text-center sm:text-left">
            {selectedTags.length} tag{selectedTags.length !== 1 ? 's' : ''} selected
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
            <button
              onClick={() => {
                onTagsChange([]);
              }}
              className="px-4 py-3 lg:py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors font-medium min-h-[44px]"
            >
              Clear All
            </button>
            <button
              onClick={onClose}
              className="px-4 py-3 lg:py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium min-h-[44px]"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </ResponsiveModal>
  );
}