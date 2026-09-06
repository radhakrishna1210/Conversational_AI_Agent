import { Link } from 'react-router-dom';

export default function DevKnowledgeBase() {
  return (
    <div className="docs-article">
      <div className="rz-eyebrow-pill" style={{ marginBottom: 12 }}>Developer Guide</div>
      <h1 className="rz-h1" style={{ fontSize: 'clamp(28px, 4vw, 40px)', marginBottom: 16 }}>Knowledge Base API</h1>
      
      <p className="rz-sub-lg" style={{ marginBottom: 24 }}>
        Ground your voice agents in your own files. Programmatically upload documents (PDF, TXT, CSV) to embed and supply custom factual details.
      </p>

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 32, marginBottom: 16 }}>1. Grounding Files Overview &amp; RAG Flow</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        AI voice agents perform significantly better when backed by specific product directories, pricing structures, or policy guides. 
        When you upload files, Spandan automatically parses the text, calculates embeddings, and stores them in our vector store to retrieve answers contextually during voice conversations.
      </p>

      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
{`graph TD
    Upload[User / Client File Upload] -->|POST /api/v1/files/upload| API[kbFile.controller.js]
    API -->|Save record status=PROCESSING| DBFile[KbFile Record in PostgreSQL]
    API -->|Spawn background thread| Worker[kbExtract.worker.js Node Worker Thread]
    Worker -->|Read PDF / CSV buffer| Extract[textExtraction.service.js]
    Extract -->|Extracted raw text| ChunkSvc[kbChunking.service.js]
    ChunkSvc -->|Generate text chunks| EmbedSvc[embeddings.service.js]
    EmbedSvc -->|Generate 1536-dim vectors| OpenAI[OpenAI Embedding API text-embedding-3-small]
    OpenAI -->|Vector embeddings| DBChunk[Save KbChunk Records in PostgreSQL]
    DBChunk -->|Mark status=READY| DBFile
    
    subgraph Voice Turn Retrieval
        CallerSpeech[Caller Speech Input] --> RAG[embeddings.service.js Cosine Similarity]
        DBChunk -->|Vector Search Match| RAG
        RAG -->|Top K Context Chunks| Prompt[Agent System Prompt Context]
        Prompt --> LLM[LLM Completion Turn via llm.factory.js]
    end`}
        </pre>
      </div>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 16, marginBottom: 8 }}>What this shows</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: 14, lineHeight: 1.6 }}>
        This diagram maps the complete Knowledge Base grounding lifecycle. Uploaded documents (PDF, CSV, TXT) are saved as `KbFile` records and parsed off the main thread by `kbExtract.worker.js`. `kbChunking.service.js` splits text into clean chunks, `embeddings.service.js` calculates 1536-dimensional vector embeddings via OpenAI, and `KbChunk` records are stored in PostgreSQL to provide vector similarity search context for live LLM voice turns.
      </p>

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 32, marginBottom: 16 }}>2. Uploading a File (multipart/form-data)</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        Send a multipart request containing the file object to the files API:
      </p>

      <pre style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: 16, borderRadius: 8, overflowX: 'auto', marginBottom: 28 }}>
        <code style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.5 }}>
{`// Example Node.js script using fetch
import fs from 'fs';

async function uploadKnowledge() {
  const form = new FormData();
  form.append('file', fs.createReadStream('./faq-guide.pdf'));
  form.append('name', 'FAQs Document');
  form.append('purpose', 'agent_grounding');

  const response = await fetch('http://localhost:4000/api/v1/files/upload', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer YOUR_SECRET_API_KEY'
    },
    body: form
  });

  const data = await response.json();
  console.log("File uploaded successfully. File ID:", data.file.id);
}`}
        </code>
      </pre>

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 32, marginBottom: 16 }}>3. Grounding Files to an Agent</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        Once a file is uploaded, map it to a voice agent's context by including its UUID in the agent's knowledge configuration:
      </p>

      <pre style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: 16, borderRadius: 8, overflowX: 'auto', marginBottom: 28 }}>
        <code style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.5 }}>
{`// Update voice agent configuration
const updatedAgent = await client.agents.update("agent-uuid-456", {
  knowledgeFiles: [
    "file-uuid-abc111", // ID of pdf document uploaded
    "file-uuid-xyz222"  // ID of product catalog csv
  ]
});`}
        </code>
      </pre>

      <div className="docs-nav-buttons" style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 20, marginTop: 40 }}>
        <Link to="/docs/developer/webhooks" className="rz-btn rz-btn-secondary" style={{ textDecoration: 'none' }}>
          ← Webhooks Integration
        </Link>
        <span></span>
      </div>
    </div>
  );
}
