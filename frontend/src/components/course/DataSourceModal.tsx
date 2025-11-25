'use client';

import React, { useState } from 'react';
import {
  X,
  Globe,
  Upload,
  Link,
  Database,
  FileText,
  Video,
  Cloud,
  HardDrive,
  Search,
  Info,
  CheckCircle,
  Circle
} from 'lucide-react';

interface DataSource {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  category: 'web' | 'upload' | 'integration';
  features?: string[];
  limitText?: string;
  recommended?: boolean;
}

interface DataSourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedSource?: string;
  onSourceSelect: (source: string) => void;
}

export default function DataSourceModal({
  isOpen,
  onClose,
  selectedSource,
  onSourceSelect
}: DataSourceModalProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const dataSources: DataSource[] = [
    {
      id: 'open-web',
      name: 'Open Web Search',
      description: 'Search and extract content from publicly available web pages, articles, and documentation',
      icon: <Globe className="w-6 h-6 text-blue-600" />,
      category: 'web',
      features: [
        'Real-time web scraping',
        'Multiple search engines',
        'Automatic content extraction',
        'Citation tracking'
      ],
      limitText: 'Limited to public content only',
      recommended: true
    },
    {
      id: 'curated-web',
      name: 'Curated Web Sources',
      description: 'Access pre-approved educational websites and knowledge bases',
      icon: <Search className="w-6 h-6 text-green-600" />,
      category: 'web',
      features: [
        'Verified educational content',
        'Academic journals',
        'Industry publications',
        'No misinformation risk'
      ]
    },
    {
      id: 'pdf-upload',
      name: 'PDF Documents',
      description: 'Upload PDF files including manuals, guides, and training materials',
      icon: <FileText className="w-6 h-6 text-red-600" />,
      category: 'upload',
      features: [
        'Bulk upload support',
        'OCR for scanned documents',
        'Automatic outline extraction',
        'Page-level referencing'
      ],
      limitText: 'Max 100MB per file'
    },
    {
      id: 'video-upload',
      name: 'Video Content',
      description: 'Upload MP4, MOV, or other video formats for transcript-based learning',
      icon: <Video className="w-6 h-6 text-purple-600" />,
      category: 'upload',
      features: [
        'Automatic transcription',
        'Chapter detection',
        'Multi-language support',
        'Timestamp referencing'
      ],
      limitText: 'Max 2GB per file'
    },
    {
      id: 'document-upload',
      name: 'Office Documents',
      description: 'Upload Word docs, PowerPoints, Excel sheets, and other office formats',
      icon: <FileText className="w-6 h-6 text-blue-500" />,
      category: 'upload',
      features: [
        'DOCX, PPTX, XLSX support',
        'Format preservation',
        'Table extraction',
        'Embedded media handling'
      ],
      limitText: 'Max 50MB per file'
    },
    {
      id: 'google-drive',
      name: 'Google Drive',
      description: 'Connect to your Google Drive to access documents and presentations',
      icon: <Cloud className="w-6 h-6 text-yellow-600" />,
      category: 'integration',
      features: [
        'Real-time sync',
        'Folder access',
        'Shared drives support',
        'Version history'
      ]
    },
    {
      id: 'sharepoint',
      name: 'SharePoint',
      description: 'Connect to Microsoft SharePoint for enterprise document management',
      icon: <Database className="w-6 h-6 text-blue-700" />,
      category: 'integration',
      features: [
        'Team sites access',
        'Document libraries',
        'Metadata support',
        'Permission inheritance'
      ]
    },
    {
      id: 'confluence',
      name: 'Confluence',
      description: 'Import knowledge base articles and documentation from Atlassian Confluence',
      icon: <Link className="w-6 h-6 text-blue-600" />,
      category: 'integration',
      features: [
        'Space synchronization',
        'Page hierarchies',
        'Attachment support',
        'Macro content handling'
      ]
    },
    {
      id: 'local-storage',
      name: 'Local Knowledge Base',
      description: 'Use your organization\'s existing knowledge base and training materials',
      icon: <HardDrive className="w-6 h-6 text-gray-600" />,
      category: 'integration',
      features: [
        'Private & secure',
        'No external access',
        'Custom taxonomies',
        'Bulk import tools'
      ]
    }
  ];

  const categories = [
    { id: 'all', name: 'All Sources', count: dataSources.length },
    { id: 'web', name: 'Web Sources', count: dataSources.filter(s => s.category === 'web').length },
    { id: 'upload', name: 'File Upload', count: dataSources.filter(s => s.category === 'upload').length },
    { id: 'integration', name: 'Integrations', count: dataSources.filter(s => s.category === 'integration').length }
  ];

  const filteredSources = selectedCategory === 'all'
    ? dataSources
    : dataSources.filter(source => source.category === selectedCategory);

  if (!isOpen) return null;

  const handleSelect = (source: DataSource) => {
    onSourceSelect(source.id);
    onClose();
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
        <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                Select Data Source
                <button className="p-1 hover:bg-gray-100 rounded-full group relative">
                  <Info className="w-4 h-4 text-gray-400" />
                  <div className="absolute left-0 top-8 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50">
                    Data sources determine where the AI will gather information to create your course content. You can combine multiple sources for comprehensive coverage.
                    <div className="absolute -top-1 left-3 w-2 h-2 bg-gray-900 rotate-45"></div>
                  </div>
                </button>
              </h2>
              <p className="text-sm text-gray-500 mt-1">Choose where to pull content and information from</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Category Tabs */}
          <div className="flex gap-2 px-6 pt-4 border-b border-gray-200">
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                className={`
                  px-4 py-2 rounded-t-lg font-medium text-sm transition-all
                  ${selectedCategory === category.id
                    ? 'bg-white border-t border-l border-r border-gray-200 text-gray-900 -mb-px'
                    : 'text-gray-600 hover:text-gray-900'
                  }
                `}
              >
                {category.name}
                <span className="ml-2 text-xs text-gray-400">({category.count})</span>
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="p-6 max-h-[60vh] overflow-y-auto">
            <div className="grid gap-4">
              {filteredSources.map((source) => (
                <div
                  key={source.id}
                  onClick={() => handleSelect(source)}
                  className={`
                    relative border rounded-xl p-4 cursor-pointer transition-all
                    ${selectedSource === source.id
                      ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-200'
                      : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
                    }
                  `}
                >
                  {source.recommended && (
                    <span className="absolute -top-2 right-4 px-2 py-0.5 bg-green-500 text-white text-xs rounded-full font-medium">
                      Recommended
                    </span>
                  )}

                  <div className="flex gap-4">
                    {/* Icon and Selection */}
                    <div className="flex flex-col items-center gap-2">
                      <div className="p-3 bg-white rounded-lg shadow-sm">
                        {source.icon}
                      </div>
                      {selectedSource === source.id ? (
                        <CheckCircle className="w-5 h-5 text-primary-600" />
                      ) : (
                        <Circle className="w-5 h-5 text-gray-300" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 mb-1">{source.name}</h3>
                      <p className="text-sm text-gray-600 mb-3">{source.description}</p>

                      {source.features && (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {source.features.map((feature, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center px-2 py-1 bg-gray-100 text-gray-700 rounded-md text-xs"
                            >
                              {feature}
                            </span>
                          ))}
                        </div>
                      )}

                      {source.limitText && (
                        <p className="text-xs text-gray-500 italic">{source.limitText}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-between items-center px-6 pb-6 pt-3 border-t border-gray-200">
            <div className="text-sm text-gray-500">
              {selectedSource ? (
                <span className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  {dataSources.find(s => s.id === selectedSource)?.name} selected
                </span>
              ) : (
                'No data source selected'
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (selectedSource) {
                    onClose();
                  }
                }}
                disabled={!selectedSource}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Select Source
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}