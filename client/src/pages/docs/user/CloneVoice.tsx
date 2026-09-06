import { Link } from 'react-router-dom';
import DocsCallout from '../DocsCallout';
import DocsWorkflow from '../DocsWorkflow';
import DocsImage from '../DocsImage';
import DocsScreenshotPlaceholder from '../DocsScreenshotPlaceholder';
import { Mic, CheckCircle, Volume2, Sparkles } from 'lucide-react';

export default function UserCloneVoice() {
  return (
    <div className="docs-article" style={{ maxWidth: '880px', lineHeight: 1.7 }}>
      <div className="rz-eyebrow-pill" style={{ marginBottom: 12 }}>Voice AI Setup</div>
      <h1 className="rz-h1" style={{ fontSize: 'clamp(30px, 4vw, 42px)', marginBottom: 16 }}>Voice Cloning Studio</h1>
      
      <p className="rz-sub-lg" style={{ fontSize: '17px', color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.6 }}>
        Create high-fidelity digital replicas of human voices using sample recordings or uploaded audio files, and deploy them across your Voice AI agents.
      </p>

      {/* Workflow Diagram */}
      <DocsWorkflow
        title="Voice Cloning Studio Lifecycle"
        description="The multi-step process from capturing a voice sample to generating a cloned voice profile."
        steps={[
          {
            badge: 'STEP 01',
            title: 'Capture Sample',
            description: 'Record 20-60 seconds of clear speech via microphone or upload an audio file.',
            icon: <Mic size={16} />
          },
          {
            badge: 'STEP 02',
            title: 'Configure Profile',
            description: 'Provide voice name, gender, primary language, and use-case description.',
            icon: <Volume2 size={16} />
          },
          {
            badge: 'STEP 03',
            title: 'Neural Synthesis',
            description: 'Neural voice engine analyzes timbre, pitch, and cadence to build the voice model.',
            icon: <Sparkles size={16} />
          },
          {
            badge: 'STEP 04',
            title: 'Deploy to Agents',
            description: 'The cloned voice appears in your workspace voice catalog for all assistants.',
            icon: <CheckCircle size={16} />
          }
        ]}
      />

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>1. Overview & Requirements</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        The <strong>Clone Voice</strong> studio (<code style={{ color: 'var(--teal-fg)' }}>/clone_voice</code>) enables businesses to maintain their exact brand personality, celebrity voice endorsements, or executive tone across automated telephone calls.
      </p>

      <div style={{ overflowX: 'auto', marginBottom: 24 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px' }}>
          <thead>
            <tr style={{ background: 'var(--bg-primary)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
              <th style={{ padding: '12px 16px', color: 'var(--text-primary)', fontWeight: 600 }}>Parameter</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-primary)', fontWeight: 600 }}>Requirement / Limit</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-primary)', fontWeight: 600 }}>Recommendation for Best Quality</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--teal-fg)' }}>Minimum Duration</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>20 seconds</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>45–90 seconds of continuous natural speech.</td>
            </tr>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--teal-fg)' }}>Supported Formats</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>MP3, WAV, WEBM, OGG, M4A, AAC</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Lossless 44.1kHz or 48kHz WAV recording.</td>
            </tr>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--teal-fg)' }}>Maximum File Size</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>10 MB per sample</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Under 5 MB for rapid upload and processing.</td>
            </tr>
            <tr>
              <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--teal-fg)' }}>Audio Environment</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Single speaker only</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Quiet room, high-quality microphone, zero background music or echo.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <DocsImage
        src="/screenshots/voice-clone.png"
        alt="Voice Cloning Studio Interface"
        caption="Voice Cloning Studio: record audio samples, synthesize custom voice profiles, and manage cloned voices"
      />

      <DocsScreenshotPlaceholder
        title="Voice Cloning Studio Interface"
        description="Tabbed interface to capture voice samples via live browser recording or file upload, complete with sample playback and metadata forms."
        routePath="/clone_voice"
        elements={[
          { label: 'Capture Mode', value: 'Record with Mic | Upload Audio File', type: 'button' },
          { label: 'Voice Profile Form', value: 'Voice Name, Gender, Language, Description', type: 'input' },
          { label: 'Cloned Voices Grid', value: 'Audio player, status badge, delete action', type: 'text' }
        ]}
      />

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>2. Step-by-Step Guide to Clone a Voice</h2>

      <h3 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', marginTop: 20, marginBottom: 12 }}>Method 1: Live Microphone Recording</h3>
      <ol style={{ paddingLeft: 22, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.8 }}>
        <li>Navigate to <strong>Clone Voice</strong> (<code style={{ color: 'var(--teal-fg)' }}>/clone_voice</code>) from the left sidebar.</li>
        <li>Select the <strong>Record</strong> tab.</li>
        <li>Click <strong>Start Recording</strong> and allow browser microphone permissions.</li>
        <li>Read a sample script with natural energy and pacing for at least 20–30 seconds.</li>
        <li>Click <strong>Stop Recording</strong>. Listen to the generated sample in the built-in player to ensure crisp audio without distortion.</li>
      </ol>

      <h3 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 12 }}>Method 2: Upload Audio File</h3>
      <ol style={{ paddingLeft: 22, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.8 }}>
        <li>Select the <strong>Upload</strong> tab.</li>
        <li>Drag and drop your audio file or click <strong>Browse files</strong>.</li>
        <li>The studio automatically measures the duration and validates that the audio is at least 20 seconds long.</li>
      </ol>

      <h3 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 12 }}>Completing Voice Creation</h3>
      <ol style={{ paddingLeft: 22, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.8 }}>
        <li>Enter a descriptive <strong>Voice Name</strong> (e.g., <em>"Aarav - Professional Executive"</em>).</li>
        <li>Select the speaker's <strong>Gender</strong> (Male, Female, Neutral) and primary <strong>Language</strong>.</li>
        <li>Optionally add a description of the tone (e.g., <em>"Warm, confident corporate narrator"</em>).</li>
        <li>Click <strong>Create Cloned Voice</strong>.</li>
        <li>The system generates the voice profile and adds it to your <strong>Cloned Voices</strong> library.</li>
      </ol>

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 40, marginBottom: 16 }}>3. Assigning Cloned Voices to AI Agents</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        Once created, your cloned voice is instantly available across your workspace:
      </p>
      <ol style={{ paddingLeft: 22, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.8 }}>
        <li>Open <strong>Voice AI Assistants</strong> and click on the agent you wish to update.</li>
        <li>Under <strong>Tab 1: Assistant details</strong>, open the <strong>Voice</strong> dropdown.</li>
        <li>Your cloned voices appear under the <strong>Workspace Cloned Voices</strong> section.</li>
        <li>Select your cloned voice and click <strong>Deploy</strong>. The agent will immediately speak in the cloned voice on all subsequent calls.</li>
      </ol>

      <DocsCallout type="security" title="CONSENT & RESPONSIBLE AI USAGE">
        Voice cloning must only be performed with explicit authorization from the voice owner. Impersonating individuals without consent or creating misleading voice content violates Spandan Acceptable Use Policies and telecom regulations.
      </DocsCallout>

      {/* Navigation Footer */}
      <div className="docs-nav-buttons" style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 24, marginTop: 48 }}>
        <Link to="/docs/user/agents" className="rz-btn rz-btn-secondary" style={{ textDecoration: 'none' }}>
          ← Creating AI Voice Agents
        </Link>
        <Link to="/docs/user/knowledge-base" className="rz-btn rz-btn-primary" style={{ textDecoration: 'none' }}>
          Knowledge Base & Grounding →
        </Link>
      </div>
    </div>
  );
}
