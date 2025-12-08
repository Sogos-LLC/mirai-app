'use client';

import React, { useState } from 'react';
import {
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
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';

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

  const handleSelect = (source: DataSource) => {
    onSourceSelect(source.id);
    onClose();
  };

  const footer = (
    <div className="flex flex-col gap-3">
      <div className="text-sm text-secondary text-center sm:text-left">
        {selectedSource ? (
          <span className="flex items-center justify-center sm:justify-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-500" />
            {dataSources.find(s => s.id === selectedSource)?.name} selected
          </span>
        ) : (
          'No data source selected'
        )}
      </div>
      <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
        <button
          onClick={onClose}
          className="w-full sm:w-auto px-4 py-3 sm:py-2 text-primary bg-hover rounded-lg hover:bg-active transition-colors font-medium min-h-[44px]"
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
          className="w-full sm:w-auto px-4 py-3 sm:py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
        >
          Select Source
        </button>
      </div>
    </div>
  );

  return (
    <ResponsiveModal
      isOpen={isOpen}
      onClose={onClose}
      title="Select Data Source"
      size="xl"
      mobileHeight="full"
      footer={footer}
    >
      <div className="flex flex-col h-full">
        {/* Header Info */}
        <div className="flex items-start gap-2 mb-4 p-3 bg-page rounded-lg">
          <Info className="w-4 h-4 text-muted flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-secondary">Choose where to pull content and information from</p>
            <p className="text-xs text-muted mt-1">
              Data sources determine where the AI will gather information to create your course content.
            </p>
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(category.id)}
              className={`
                px-4 py-2 rounded-lg font-medium text-sm transition-all whitespace-nowrap min-h-[44px]
                ${selectedCategory === category.id
                  ? 'bg-primary-600 text-white'
                  : 'bg-hover text-secondary hover:bg-active'
                }
              `}
            >
              {category.name}
              <span className="ml-2 text-xs opacity-70">({category.count})</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <div className="grid gap-3 sm:gap-4">
            {filteredSources.map((source) => (
              <button
                key={source.id}
                onClick={() => handleSelect(source)}
                className={`
                  relative border rounded-xl p-4 cursor-pointer transition-all text-left w-full min-h-[44px]
                  ${selectedSource === source.id
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 ring-2 ring-primary-200'
                    : 'border hover:border-primary-300 hover:shadow-md bg-surface'
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
                  <div className="flex flex-col items-center gap-2 flex-shrink-0">
                    <div className="p-3 bg-surface rounded-lg shadow-sm border">
                      {source.icon}
                    </div>
                    {selectedSource === source.id ? (
                      <CheckCircle className="w-5 h-5 text-primary-600" />
                    ) : (
                      <Circle className="w-5 h-5 text-muted" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-primary mb-1">{source.name}</h3>
                    <p className="text-sm text-secondary mb-3">{source.description}</p>

                    {source.features && (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {source.features.map((feature, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center px-2 py-1 bg-hover text-secondary rounded-md text-xs"
                          >
                            {feature}
                          </span>
                        ))}
                      </div>
                    )}

                    {source.limitText && (
                      <p className="text-xs text-muted italic">{source.limitText}</p>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </ResponsiveModal>
  );
}