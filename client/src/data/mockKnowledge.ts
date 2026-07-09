export type SourceType = 'website' | 'pdf' | 'faq' | 'notes';
export type SourceStatus = 'synced' | 'syncing' | 'failed' | 'pending';

export interface KnowledgeChunk {
  id: string;
  content: string;
  tokens: number;
}

export interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

export interface BaseKnowledgeSource {
  id: string;
  name: string;
  type: SourceType;
  status: SourceStatus;
  updatedAt: string;
  createdAt: string;
  chunkCount: number;
  sizeBytes: number;
  chunks: KnowledgeChunk[];
}

export interface WebsiteSource extends BaseKnowledgeSource {
  type: 'website';
  url: string;
  pagesScraped: number;
}

export interface PDFSource extends BaseKnowledgeSource {
  type: 'pdf';
  filename: string;
  pages: number;
}

export interface FAQSource extends BaseKnowledgeSource {
  type: 'faq';
  faqs: FAQItem[];
}

export interface NotesSource extends BaseKnowledgeSource {
  type: 'notes';
  content: string;
}

export type KnowledgeSource = WebsiteSource | PDFSource | FAQSource | NotesSource;

export const mockKnowledgeStats = {
  totalSources: 4,
  documents: 12,
  chunks: 485,
  storageUsedBytes: 24500000 // ~24.5 MB
};

export const mockKnowledgeSources: KnowledgeSource[] = [
  {
    id: 'src_web_1',
    name: 'Company Help Center',
    type: 'website',
    status: 'synced',
    updatedAt: new Date(Date.now() - 3600000).toISOString(),
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    chunkCount: 142,
    sizeBytes: 1540000,
    url: 'https://help.example.com',
    pagesScraped: 24,
    chunks: [
      { id: 'chk_1', content: 'Our refund policy allows returns within 30 days of purchase with original receipt.', tokens: 16 },
      { id: 'chk_2', content: 'To reset your password, visit the login page and click "Forgot Password". A link will be sent to your email.', tokens: 23 },
    ]
  },
  {
    id: 'src_pdf_1',
    name: 'Q3_Product_Manual_v2.pdf',
    type: 'pdf',
    status: 'synced',
    updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    chunkCount: 215,
    sizeBytes: 4200000,
    filename: 'Q3_Product_Manual_v2.pdf',
    pages: 45,
    chunks: [
      { id: 'chk_3', content: 'The power button is located on the back right side of the device, beneath the ventilation grill.', tokens: 19 },
      { id: 'chk_4', content: 'Operating temperature should not exceed 40°C (104°F) to prevent battery degradation.', tokens: 14 },
    ]
  },
  {
    id: 'src_faq_1',
    name: 'General Sales FAQs',
    type: 'faq',
    status: 'synced',
    updatedAt: new Date(Date.now() - 1800000).toISOString(),
    createdAt: new Date(Date.now() - 86400000 * 10).toISOString(),
    chunkCount: 8,
    sizeBytes: 24000,
    faqs: [
      { id: 'faq_1', question: 'Do you offer bulk discounts?', answer: 'Yes, we offer a 15% discount for orders over 50 units.' },
      { id: 'faq_2', question: 'Is shipping free?', answer: 'Standard shipping is free on all orders over $100.' },
    ],
    chunks: [
      { id: 'chk_5', content: 'Q: Do you offer bulk discounts? A: Yes, we offer a 15% discount for orders over 50 units.', tokens: 22 },
      { id: 'chk_6', content: 'Q: Is shipping free? A: Standard shipping is free on all orders over $100.', tokens: 18 },
    ]
  },
  {
    id: 'src_notes_1',
    name: 'Internal Agent Instructions',
    type: 'notes',
    status: 'synced',
    updatedAt: new Date(Date.now() - 60000).toISOString(),
    createdAt: new Date(Date.now() - 86400000 * 1).toISOString(),
    chunkCount: 4,
    sizeBytes: 5200,
    content: 'Always refer to the customer by their first name if known.\n\nNever promise exact delivery dates, use phrases like "estimated 3-5 business days".\n\nIf asked about competitors, highlight our 24/7 support and enterprise-grade security.',
    chunks: [
      { id: 'chk_7', content: 'Always refer to the customer by their first name if known.', tokens: 12 },
      { id: 'chk_8', content: 'Never promise exact delivery dates, use phrases like "estimated 3-5 business days".', tokens: 14 },
    ]
  }
];
