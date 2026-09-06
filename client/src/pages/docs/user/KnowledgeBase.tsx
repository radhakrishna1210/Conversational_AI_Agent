import { Link } from 'react-router-dom';
import DocsWorkflow from '../DocsWorkflow';
import DocsImage from '../DocsImage';
import DocsScreenshotPlaceholder from '../DocsScreenshotPlaceholder';
import { UploadCloud, FileText, Database, Search } from 'lucide-react';

export default function UserKnowledgeBase() {
  return (
    <div className="docs-article" style={{ maxWidth: '880px', lineHeight: 1.7 }}>
      <div className="rz-eyebrow-pill" style={{ marginBottom: 12 }}>Voice AI Setup</div>
      <h1 className="rz-h1" style={{ fontSize: 'clamp(30px, 4vw, 42px)', marginBottom: 16 }}>Knowledge Base & File Grounding</h1>
      
      <p className="rz-sub-lg" style={{ fontSize: '17px', color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.6 }}>
        Ground your Voice AI assistants in authoritative business documents using automated text extraction, intelligent chunking, and pgvector semantic retrieval.
      </p>

      {/* Workflow Diagram */}
      <DocsWorkflow
        title="Document Ingestion & RAG Retrieval Pipeline"
        description="How files are transformed from raw documents into real-time voice context during phone conversations."
        steps={[
          {
            badge: 'STEP 01',
            title: 'Upload File',
            description: 'Upload PDF, DOCX, CSV, TXT, or JSON files into the workspace repository.',
            icon: <UploadCloud size={16} />
          },
          {
            badge: 'STEP 02',
            title: 'Text Extraction',
            description: 'Server extracts clean text content and strips binary formatting.',
            icon: <FileText size={16} />
          },
          {
            badge: 'STEP 03',
            title: 'Chunking & Embedding',
            description: 'Long documents are sliced into overlapping chunks and vectorized into 1536-dim embeddings.',
            icon: <Database size={16} />
          },
          {
            badge: 'STEP 04',
            title: 'In-Call Vector RAG',
            description: 'When a caller asks a question, semantic similarity retrieves exact paragraphs for the LLM.',
            icon: <Search size={16} />
          }
        ]}
      />

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>1. What is Knowledge Base Grounding?</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        Large Language Models have vast general knowledge, but they know nothing about your company's proprietary pricing, return policies, product inventory, or clinical guidelines. Spandan's <strong>Knowledge Base</strong> (<code style={{ color: 'var(--teal-fg)' }}>/files</code>) equips agents with your exact business knowledge.
      </p>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>
        When grounded with files, the agent is instructed to answer questions strictly from your documents, eliminating hallucinations and ensuring compliant, accurate answers on every phone call.
      </p>

      <DocsImage
        src="/screenshots/Knowledge_Base.png"
        alt="Knowledge Base Management Console"
        caption="Knowledge Base file repository: upload, manage, and inspect grounded documents"
      />

      {/* Supported Formats Table */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>2. Supported File Types & Processing Limits</h2>

      <div style={{ overflowX: 'auto', marginBottom: 24 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px' }}>
          <thead>
            <tr style={{ background: 'var(--bg-primary)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
              <th style={{ padding: '12px 16px', color: 'var(--text-primary)', fontWeight: 600 }}>File Format</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-primary)', fontWeight: 600 }}>Extension</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-primary)', fontWeight: 600 }}>Optimal Use Case</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-primary)', fontWeight: 600 }}>Extraction Behavior</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--coral)' }}>PDF Document</td>
              <td style={{ padding: '12px 16px', fontFamily: 'monospace' }}>.pdf</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Product manuals, policy docs, terms of service, brochures.</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Text extracted page by page; scanned image PDFs require OCR.</td>
            </tr>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--lime)' }}>CSV / Spreadsheet</td>
              <td style={{ padding: '12px 16px', fontFamily: 'monospace' }}>.csv</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Pricing tables, product catalogues, branch directories, FAQs.</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Parsed row-by-row into key-value context chunks.</td>
            </tr>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--violet)' }}>Word / Text</td>
              <td style={{ padding: '12px 16px', fontFamily: 'monospace' }}>.docx, .txt, .md</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Call scripts, company policies, agent guidelines.</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Instant full-text extraction and semantic chunking.</td>
            </tr>
            <tr>
              <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--cyan-fg)' }}>JSON Structured</td>
              <td style={{ padding: '12px 16px', fontFamily: 'monospace' }}>.json</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Structured entity catalogs and API response mocks.</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Parsed directly into structured knowledge nodes.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <DocsScreenshotPlaceholder
        title="Knowledge Base File Repository"
        description="Unified file management showing searchable text status, storage size, agent links, and instant download/delete actions."
        routePath="/files"
        elements={[
          { label: 'Dropzone Area', value: 'Drag and drop PDF, CSV, TXT, DOCX files', type: 'input' },
          { label: 'File Repository Grid', value: 'File name, extension tag, size, searchable status', type: 'text' },
          { label: 'Actions', value: 'Download original file / Delete file', type: 'button' }
        ]}
      />

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>3. Step-by-Step: Uploading & Grounding Knowledge</h2>

      <h3 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', marginTop: 20, marginBottom: 12 }}>Step 1: Upload to Workspace Files</h3>
      <ol style={{ paddingLeft: 22, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.8 }}>
        <li>From the left sidebar, navigate to <strong>Files</strong> (<code style={{ color: 'var(--teal-fg)' }}>/files</code>).</li>
        <li>Drag your document into the upload dropzone, or click inside the dashed area to open your operating system file picker.</li>
        <li>The file uploads to the secure workspace bucket. The server automatically triggers text parsing and vector embedding.</li>
        <li>Verify that the status badge indicates <strong style={{ color: 'var(--lime)' }}>Searchable</strong>.</li>
      </ol>

      <h3 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 12 }}>Step 2: Attach Knowledge to an Agent</h3>
      <ol style={{ paddingLeft: 22, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.8 }}>
        <li>Navigate to <strong>Voice AI Assistants</strong> and click your agent to open the workbench.</li>
        <li>Select <strong>Tab 3: Knowledge base</strong>.</li>
        <li>Enable the checkboxes next to the files you want this specific agent to reference.</li>
        <li>Click <strong>Deploy</strong> to apply the changes.</li>
      </ol>

      <h3 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 12 }}>Step 3: Test Knowledge in Real-Time</h3>
      <ol style={{ paddingLeft: 22, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.8 }}>
        <li>Switch to <strong>Tab 6: Chat test</strong> or launch a <strong>Web call</strong>.</li>
        <li>Ask a specific question that is answered only within your uploaded document (e.g., <em>"What is the cancellation penalty in clause 4?"</em>).</li>
        <li>Observe how the agent quotes the exact figure or policy directly from the document.</li>
      </ol>

      {/* Best Practices */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 40, marginBottom: 16 }}>4. Best Practices for Grounding Documents</h2>
      <ul style={{ paddingLeft: 22, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.8 }}>
        <li><strong>Use Clean Headings:</strong> Documents formatted with clear Markdown or H1/H2/H3 headings produce superior vector chunks.</li>
        <li><strong>Write Explicit FAQ Pairs:</strong> For common questions, include a structured Question and Answer format in your document.</li>
        <li><strong>Avoid Image-Only PDFs:</strong> Ensure PDFs contain selectable digital text rather than scanned photograph pages.</li>
        <li><strong>Keep Information Current:</strong> If company policies or prices change, delete the obsolete file and upload the revised version.</li>
      </ul>

      {/* Navigation Footer */}
      <div className="docs-nav-buttons" style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 24, marginTop: 48 }}>
        <Link to="/docs/user/clone-voice" className="rz-btn rz-btn-secondary" style={{ textDecoration: 'none' }}>
          ← Voice Cloning Studio
        </Link>
        <Link to="/docs/user/phone-numbers" className="rz-btn rz-btn-primary" style={{ textDecoration: 'none' }}>
          Phone Numbers & DLT Compliance →
        </Link>
      </div>
    </div>
  );
}
