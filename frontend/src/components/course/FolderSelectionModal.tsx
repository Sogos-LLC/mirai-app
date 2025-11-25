'use client';

import React, { useState, useEffect } from 'react';
import { Folder, FolderOpen, ChevronRight, ChevronDown, X, Users, User } from 'lucide-react';

interface FolderNode {
  id: string;
  name: string;
  type?: 'library' | 'team' | 'personal' | 'folder';
  children?: FolderNode[];
}

interface FolderSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (folderId: string, folderName: string) => void;
  selectedFolder?: string;
}

export default function FolderSelectionModal({
  isOpen,
  onClose,
  onSelect,
  selectedFolder
}: FolderSelectionModalProps) {
  const [folderStructure, setFolderStructure] = useState<FolderNode[]>([]);
  const [loading, setLoading] = useState(true);

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(['library', 'team', 'personal'])
  );

  // Load folder structure from API
  useEffect(() => {
    const loadFolders = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/folders');
        if (response.ok) {
          const result = await response.json();
          setFolderStructure(result.data);
        } else {
          console.error('Failed to load folders');
        }
      } catch (error) {
        console.error('Error loading folders:', error);
      } finally {
        setLoading(false);
      }
    };

    if (isOpen) {
      loadFolders();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  if (loading) {
    return (
      <>
        <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="text-gray-600">Loading folders...</div>
          </div>
        </div>
      </>
    );
  }

  const toggleFolder = (folderId: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
    }
    setExpandedFolders(newExpanded);
  };

  const handleSelect = (folder: FolderNode) => {
    onSelect(folder.id, folder.name);
    onClose();
  };

  const renderFolderNode = (node: FolderNode, level: number = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedFolders.has(node.id);
    const isSelected = selectedFolder === node.name;

    const getIcon = () => {
      if (node.type === 'team') return <Users className="w-5 h-5 text-blue-600" />;
      if (node.type === 'personal') return <User className="w-5 h-5 text-green-600" />;
      if (isExpanded) return <FolderOpen className="w-5 h-5 text-yellow-600" />;
      return <Folder className="w-5 h-5 text-gray-600" />;
    };

    return (
      <div key={node.id}>
        <div
          className={`
            flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer
            hover:bg-gray-100 transition-colors
            ${isSelected ? 'bg-primary-100 border border-primary-300' : ''}
          `}
          style={{ paddingLeft: `${level * 20 + 12}px` }}
          onClick={() => {
            if (hasChildren) {
              toggleFolder(node.id);
            }
            if (node.type === 'folder' || !hasChildren) {
              handleSelect(node);
            }
          }}
        >
          {hasChildren && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleFolder(node.id);
              }}
              className="p-0.5 hover:bg-gray-200 rounded"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-gray-500" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-500" />
              )}
            </button>
          )}
          {!hasChildren && <div className="w-5" />}

          {getIcon()}

          <span className={`
            font-medium
            ${node.type === 'team' || node.type === 'personal' ? 'text-gray-900 font-semibold' : 'text-gray-700'}
          `}>
            {node.name}
          </span>
        </div>

        {hasChildren && isExpanded && (
          <div>
            {node.children!.map((child) => renderFolderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">
              Choose Destination Folder
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Folder Tree */}
          <div className="p-6 max-h-[60vh] overflow-y-auto">
            <div className="space-y-1">
              {folderStructure.map((node) => renderFolderNode(node))}
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 px-6 pb-6 pt-3 border-t border-gray-200">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (selectedFolder) {
                  onClose();
                }
              }}
              disabled={!selectedFolder}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Select Folder
            </button>
          </div>
        </div>
      </div>
    </>
  );
}