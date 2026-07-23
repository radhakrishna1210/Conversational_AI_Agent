import { Link } from "react-router-dom";
import { Check, ArrowRight, Play } from "lucide-react";

/* -------------------------------------------------------------------------- */
/*                                   LOGO                                     */
/* -------------------------------------------------------------------------- */


function VonageLogo() {
  return (
    <div
      style={{
        width:'clamp(52px,10vw,60px)',
        height:'clamp(52px,10vw,60px)',
        borderRadius: 12,
        background: '#000000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      <img
        src="https://companieslogo.com/img/orig/VG.defunct.D-70cee1f4.png?t=1720244494"
        alt="Vonage"
        style={{
          width:'100%',
          height:'100%',
          objectFit: 'contain',
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                SMALL ICONS                                 */
/* -------------------------------------------------------------------------- */

function TwilioIcon() {
  return (
    <div
      style={{
        width: 42,
        height: 42,
        borderRadius: 10,
        background: "#1b1b1b",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg width="22" height="22">
        <circle cx="11" cy="11" r="10" fill="#F22F46" />
        <circle cx="8" cy="8" r="2" fill="white" />
        <circle cx="14" cy="8" r="2" fill="white" />
        <circle cx="8" cy="14" r="2" fill="white" />
        <circle cx="14" cy="14" r="2" fill="white" />
      </svg>
    </div>
  );
}

function RingCentralIcon() {
  return (
    <div
      style={{
        width: 42,
        height: 42,
        borderRadius: 10,
        background: "#1b1b1b",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: 5,
          background: "#F58220",
          color: "#003DA6",
          fontWeight: 900,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
        }}
      >
        R
      </div>
    </div>
  );
}

function ExotelIcon() {
  return (
    <div
      style={{
        width: 42,
        height: 42,
        borderRadius: 10,
        background: "#1b1b1b",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          fontWeight: 700,
          color: "white",
          fontSize: 13,
        }}
      >
        exo
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                              REUSABLE HELPERS                              */
/* -------------------------------------------------------------------------- */

function SectionLabel({ text }: { text: string }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "var(--text-secondary)",
        marginBottom: 18,
      }}
    >
      {text}
    </div>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        marginBottom: 12,
      }}
    >
      <Check
        size={15}
        style={{
          color: "#10C7A6",
          marginTop: 2,
          flexShrink: 0,
        }}
      />

      <span
        style={{
          color: "var(--text-secondary)",
          fontSize: 14,
          lineHeight: 1.7,
        }}
      >
        {text}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 COMPONENT                                  */
/* -------------------------------------------------------------------------- */

export default function Vonage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-primary)",
        color: "var(--text-primary)",
      }}
    >
      <div
        style={{
          width:"100%",maxWidth:760,margin:"0 auto",padding:"clamp(24px,5vw,50px) clamp(16px,4vw,24px) 80px",boxSizing:"border-box"
        }}
      >

        
        {/* Hero */}

        <div
          style={{
            display:"flex",flexWrap:"wrap",alignItems:"center",gap:26,
            marginBottom: 34,
          }}
        >
          <VonageLogo />

          <div style={{ paddingTop: 8 }}>
            <h1
              style={{
                fontSize:"clamp(24px,5vw,30px)",
                fontWeight: 800,
                marginBottom: 6,
                color: "var(--text-primary)",
              }}
            >
              Vonage
            </h1>

            <p
              style={{
                fontSize: 15,
                color: "var(--text-primary)",
              }}
            >
              Connect Vonage SIP trunks with UserKey and Secret authentication.
            </p>
          </div>
        </div>

        {/* Intro */}

        <p
          style={{
            fontSize: 14,
            color: "var(--text-secondary)",
            lineHeight: 1.8,
            marginBottom: 42,
          }}
        >
          Conversational AI Agent works with any SIP-compatible carrier, and Vonage is one
          popular example. Connect Vonage SIP trunks with UserKey and Secret
          authentication and optional IP whitelisting.
        </p>

        {/* Benefits */}

        <div
          style={{
            marginBottom: 48,
          }}
        >
          <SectionLabel text="Key Benefits" />

          <Bullet text="Use existing Vonage SIP trunks" />

          <Bullet text="UserKey and Secret authentication" />

          <Bullet text="IP whitelisting available" />
        </div>

        {/* ===== PART 2 STARTS HERE ===== */}
                {/* Video Walkthrough */}

        <div
          style={{
            marginBottom: 42,
          }}
        >
          <SectionLabel text="Video Walkthrough" />

          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 16,
              overflow: "hidden",
              background: "#111",
            }}
          >
            <div
              style={{
                position: "relative",
                width: "100%",
                aspectRatio: "16 / 9",
                background:
                  "linear-gradient(135deg,#181818 0%,#262626 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: 76,
                  height: 76,
                  borderRadius: "50%",
                  background: "rgba(255,255,255,.95)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <Play
                  size={30}
                  fill="#111"
                  color="#111"
                  style={{ marginLeft: 4 }}
                />
              </div>
            </div>

            <div
              style={{
                padding: 22,
              }}
            >
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 700,
                  marginBottom: 8,
                  color: "var(--text-primary)",
                }}
              >
                Watch the Vonage setup
              </div>

              <div
                style={{
                  fontSize: 14,
                  color: "var(--text-secondary)",
                  lineHeight: 1.7,
                }}
              >
                Learn how to connect your Vonage SIP trunk with
                Conversational AI Agent in just a few minutes.
              </div>
            </div>
          </div>
        </div>

        {/* Documentation */}

        <div
          style={{
            marginBottom: 52,
          }}
        >
          <SectionLabel text="Documentation" />

          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 16,
              padding:"clamp(18px,4vw,28px)",
            }}
          >
            <div
              style={{
                fontSize: 17,
                fontWeight: 700,
                marginBottom: 8,
                color: "var(--text-primary)",
              }}
            >
              Read the full setup guide
            </div>

            <div
              style={{
                color: "var(--text-secondary)",
                fontSize: 14,
                lineHeight: 1.7,
                marginBottom: 18,
              }}
            >
              Our documentation walks through SIP credentials,
              UserKey & Secret authentication, optional IP
              whitelisting and troubleshooting.
            </div>

            <Link
              to="/documentation"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                color: "#10C7A6",
                textDecoration: "none",
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              Read Documentation

              <ArrowRight size={15} />
            </Link>
          </div>
        </div>

        {/* CTA */}

        <div
          style={{
            position: "relative",
            overflow: "hidden",
            borderRadius: 20,
            padding:"clamp(20px,5vw,40px)",
            marginBottom: 60,
            border: "1px solid var(--border)",
            background:
              "linear-gradient(135deg,rgba(16,199,166,.12),rgba(16,199,166,.03))",
          }}
        >
          <div
            style={{
              position: "absolute",
              width: 240,
              height: 240,
              borderRadius: "50%",
              right: -70,
              top: -70,
              background:
                "radial-gradient(circle, rgba(16,199,166,.18), transparent 70%)",
            }}
          />

          <h2
            style={{
              fontSize:"clamp(22px,5vw,28px)",
              fontWeight: 800,
              marginBottom: 12,
              letterSpacing: "-.02em",
              color: "var(--text-primary)",
            }}
          >
            Build a voice agent using Vonage
          </h2>

          <p
            style={{
              fontSize: 15,
              lineHeight: 1.8,
              color: "var(--text-secondary)",
              maxWidth: 520,
              marginBottom: 28,
            }}
          >
            Connect your existing Vonage SIP infrastructure with
            Conversational AI Agent and launch production-ready AI voice
            agents in minutes.
          </p>

          <div
            style={{
              display: "flex",
              gap: 14,
              flexWrap: "wrap",
            }}
          >
            <Link
              to="/signup"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: "#10C7A6",
                color: "#fff",
                textDecoration: "none",
                padding: "12px 24px",
                borderRadius: 999,
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              Start free

              <ArrowRight size={15} />
            </Link>

            <Link
              to="/book-appointment"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
                textDecoration: "none",
                padding: "12px 24px",
                borderRadius: 999,
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              Book a demo

              <ArrowRight size={15} />
            </Link>
          </div>
        </div>

        {/* ===== PART 3 STARTS HERE ===== */}
                {/* More Telephony Integrations */}

        <div>
          <SectionLabel text="More Telephony Integrations" />

          <div
            style={{
              display: "grid",
              gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",
              gap: 22,
            }}
          >
            {/* Twilio */}

            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 14,
                padding: 20,
                transition: "all .2s ease",
              }}
            >
              <div style={{ marginBottom: 16 }}>
                <TwilioIcon />
              </div>

              <div
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  marginBottom: 8,
                  color: "var(--text-primary)",
                }}
              >
                Twilio
              </div>

              <div
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  lineHeight: 1.7,
                  marginBottom: 18,
                }}
              >
                Connect Twilio Voice numbers and SIP trunks to power
                AI voice conversations.
              </div>

              <Link
                to="/integrations/twilio"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  textDecoration: "none",
                  color: "#10C7A6",
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                Learn more
                <ArrowRight size={14} />
              </Link>
            </div>

            {/* RingCentral */}

            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 14,
                padding: 20,
              }}
            >
              <div style={{ marginBottom: 16 }}>
                <RingCentralIcon />
              </div>

              <div
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  marginBottom: 8,
                  color: "var(--text-primary)",
                }}
              >
                RingCentral
              </div>

              <div
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  lineHeight: 1.7,
                  marginBottom: 18,
                }}
              >
                Integrate RingCentral telephony with Conversational AI Agent
                and automate inbound customer conversations.
              </div>

              <Link
                to="/integrations/ringcentral"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  textDecoration: "none",
                  color: "#10C7A6",
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                Learn more
                <ArrowRight size={14} />
              </Link>
            </div>

            {/* Exotel */}

            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 14,
                padding: 20,
              }}
            >
              <div style={{ marginBottom: 16 }}>
                <ExotelIcon />
              </div>

              <div
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  marginBottom: 8,
                  color: "var(--text-primary)",
                }}
              >
                Exotel
              </div>

              <div
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  lineHeight: 1.7,
                  marginBottom: 18,
                }}
              >
                Connect Exotel SIP trunks and cloud telephony
                services to your AI agents with ease.
              </div>

              <Link
                to="/integrations/exotel"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  textDecoration: "none",
                  color: "#10C7A6",
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                Learn more
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}