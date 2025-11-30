'use client';

import React, { useState, useEffect } from 'react';
import { Folder, FolderOpen, ChevronRight, ChevronDown, Users, User } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import * as courseClient from '@/lib/courseClient';

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

  // Load folder structure from connect-rpc API
  useEffect(() => {
    const loadFolders = async () => {
      try {
        setLoading(true);
        const folders = await courseClient.getFolderHierarchy(false);
        // Convert proto folders to local format
        setFolderStructure(folders.map((f: any) => ({
          id: f.id,
          name: f.name,
          type: f.type === 1 ? 'library' : f.type === 2 ? 'team' : f.type === 3 ? 'personal' : 'folder',
          children: f.children?.map((c: any) => ({
            id: c.id,
            name: c.name,
            type: c.type === 1 ? 'library' : c.type === 2 ? 'team' : c.type === 3 ? 'personal' : 'folder',
            children: c.children,
          })),
        })));
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
    <ResponsiveModal
      isOpen={isOpen}
      onClose={onClose}
      title="Choose Destination Folder"
      size="lg"
    >
      <div className="flex flex-col h-full">
        {/* Loading State */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <div className="text-gray-600">Loading folders...</div>
          </div>
        ) : (
          <>
            {/* Folder Tree */}
            <div className="flex-1 overflow-y-auto -mx-4 px-4 lg:mx-0 lg:px-0">
              <div className="space-y-1">
                {folderStructure.map((node) => renderFolderNode(node))}
              </div>
            </div>

            {/* Footer */}
            <div className="flex flex-col-reverse sm:flex-row gap-3 mt-4 pt-4 border-t border-gray-200">
              <button
                onClick={onClose}
                className="w-full sm:w-auto px-4 py-3 lg:py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors font-medium min-h-[44px]"
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
                className="w-full sm:w-auto px-4 py-3 lg:py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
              >
                Select Folder
              </button>
            </div>
          </>
        )}
      </div>
    </ResponsiveModal>
  );
}