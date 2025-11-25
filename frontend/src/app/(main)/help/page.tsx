'use client';

import React, { useState } from 'react';
import {
  Search,
  MessageCircle,
  Mail,
  BookOpen,
  HelpCircle,
  ExternalLink,
  ChevronDown,
} from 'lucide-react';

export default function HelpPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const faqs = [
    {
      question: 'How do I get started with Mirai?',
      answer:
        'Start by exploring our tutorials section and create your first project using one of our templates. We recommend beginning with the "Getting Started with Mirai" tutorial to familiarize yourself with the platform.',
    },
    {
      question: 'Can I customize the templates?',
      answer:
        'Yes, all templates are fully customizable. You can modify text, images, layouts, and structure to match your needs. Use the template editor to make real-time changes and preview your content.',
    },
    {
      question: 'How does billing work?',
      answer:
        'We offer monthly and annual subscriptions with different tiers. You can manage your billing, update payment methods, and view invoices in the Settings section under Billing.',
    },
    {
      question: 'Is there a free trial?',
      answer:
        'Yes, we offer a 14-day free trial with access to all Pro features. No credit card required to start. You can upgrade to a paid plan at any time during or after the trial.',
    },
    {
      question: 'How do I collaborate with my team?',
      answer:
        'Invite team members from your workspace settings. You can share folders, assign permissions, and collaborate in real-time on content projects. Each team member can have different access levels.',
    },
    {
      question: 'What file formats can I export?',
      answer:
        'You can export your content in multiple formats including PDF, DOCX, HTML, and plain text. Each format preserves your formatting and styling appropriately.',
    },
    {
      question: 'How secure is my data?',
      answer:
        'We use enterprise-grade encryption for all data in transit and at rest. Your content is backed up regularly, and we comply with GDPR and SOC 2 standards. We never share your data with third parties.',
    },
    {
      question: 'Can I integrate Mirai with other tools?',
      answer:
        'Yes, Mirai integrates with popular tools like Slack, Google Drive, Dropbox, and more. Visit our integrations page to see the full list and setup instructions.',
    },
  ];

  const resources = [
    {
      title: 'Documentation',
      description: 'Complete guides and API references',
      icon: BookOpen,
      link: '#',
    },
    {
      title: 'Video Tutorials',
      description: 'Step-by-step video guides',
      icon: BookOpen,
      link: '#',
    },
    {
      title: 'Community Forum',
      description: 'Connect with other users',
      icon: MessageCircle,
      link: '#',
    },
    {
      title: 'Contact Support',
      description: 'Get help from our team',
      icon: Mail,
      link: '#',
    },
  ];

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-3">
            How can we help you?
          </h1>
          <p className="text-gray-600 mb-8">
            Search our knowledge base or browse common questions
          </p>
          <div className="max-w-2xl mx-auto relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search for help..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent text-lg shadow-sm"
            />
          </div>
        </div>

        {/* Resource Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {resources.map((resource, idx) => {
            const Icon = resource.icon;
            return (
              <a
                key={idx}
                href={resource.link}
                className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-all hover:border-primary-300 group"
              >
                <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-primary-200 transition-colors">
                  <Icon className="w-6 h-6 text-primary-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
                  {resource.title}
                  <ExternalLink className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                </h3>
                <p className="text-gray-600 text-sm">{resource.description}</p>
              </a>
            );
          })}
        </div>

        {/* FAQ Section */}
        <section className="bg-white border border-gray-200 rounded-xl p-8 mb-12 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <HelpCircle className="w-6 h-6 text-primary-600" />
            <h2 className="text-2xl font-bold text-gray-900">
              Frequently Asked Questions
            </h2>
          </div>
          <div className="space-y-3">
            {faqs.map((faq, idx) => (
              <div
                key={idx}
                className="border border-gray-200 rounded-lg overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="font-semibold text-gray-900 pr-4">
                    {faq.question}
                  </span>
                  <ChevronDown
                    className={`w-5 h-5 text-primary-600 flex-shrink-0 transition-transform ${
                      openFaq === idx ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {openFaq === idx && (
                  <div className="px-4 pb-4 pt-0">
                    <p className="text-gray-600 leading-relaxed">
                      {faq.answer}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Contact CTA */}
        <section className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-2xl p-8 text-white text-center shadow-md">
          <h2 className="text-2xl font-bold mb-2">Still need help?</h2>
          <p className="mb-6 opacity-90">
            Our support team is here to assist you
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <button className="bg-white text-primary-600 px-6 py-3 rounded-lg font-semibold hover:bg-gray-100 flex items-center gap-2">
              <MessageCircle className="w-5 h-5" />
              Live Chat
            </button>
            <button className="bg-white/20 backdrop-blur-sm text-white px-6 py-3 rounded-lg font-semibold hover:bg-white/30 flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Email Support
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

