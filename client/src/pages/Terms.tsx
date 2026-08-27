import { Link } from 'react-router-dom';

const SECTIONS = [
  { id: 'section-1', num: '1', title: 'Eligibility and Use Restrictions' },
  { id: 'section-2', num: '2', title: 'Personal Data' },
  { id: 'section-3', num: '3', title: 'Accounts' },
  { id: 'section-4', num: '4', title: 'Content and User Voice Models; Models' },
  { id: 'section-5', num: '5', title: 'Voice Cloning: Disclosure, Consent, and Restrictions' },
  { id: 'section-6', num: '6', title: 'Subscription Services; Payment' },
  { id: 'section-7', num: '7', title: 'Telephony and Call Recording' },
  { id: 'section-8', num: '8', title: 'WhatsApp Business Functionality' },
  { id: 'section-9', num: '9', title: 'Indemnification' },
  { id: 'section-10', num: '10', title: 'Disclaimers' },
  { id: 'section-11', num: '11', title: 'Limitation of Liability' },
  { id: 'section-12', num: '12', title: 'Dispute Resolution' },
  { id: 'section-13', num: '13', title: 'Our Intellectual Property' },
  { id: 'section-14', num: '14', title: 'Modifying and Terminating Our Services' },
  { id: 'section-15', num: '15', title: 'Third-Party Services and Content' },
  { id: 'section-16', num: '16', title: 'Export Control' },
  { id: 'section-17', num: '17', title: 'Miscellaneous' },
  { id: 'section-18', num: '18', title: 'Contact Us' },
];

export default function Terms() {
  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <main className="rz-page terms-page">
      <div className="container">
        {/* Breadcrumbs */}
        <div className="breadcrumb">
          <Link to="/">Home</Link>
          <span>›</span>
          <span style={{ color: 'var(--tx)' }}>Terms and Conditions</span>
        </div>

        {/* Page Header */}
        <div className="terms-header">
          <div className="rz-eyebrow-pill">Legal</div>
          <h1 className="rz-h1">Terms and Conditions</h1>
          <p className="terms-updated">
            Effective Date: August 25, 2026 · Last Updated: August 25, 2026
          </p>
        </div>

        <div className="terms-layout">
          {/* Main Document Content */}
          <article className="terms-content" aria-label="Spandan Terms and Conditions">
            {/* Introductory Agreement Block */}
            <div className="terms-intro-block">
              <p>
                These Terms and Conditions (&ldquo;Terms,&rdquo; &ldquo;Agreement&rdquo;) are between you (&ldquo;you&rdquo; or
                &ldquo;your&rdquo;) and Spandan (&ldquo;Spandan,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;). By accessing or using
                our Services (defined below) in any way, by completing the account registration
                process, or by browsing the Website, you agree to be bound by these Terms.
                These Terms apply to your access to and use of Spandan:
              </p>

              <ul className="terms-list">
                <li>
                  The website located at{' '}
                  <a href="https://spandan.mannmate.com" target="_blank" rel="noopener noreferrer" className="terms-link">
                    https://spandan.mannmate.com
                  </a>{' '}
                  and all associated web pages, websites, and social media pages (the &ldquo;Website&rdquo;);
                </li>
                <li>
                  Services and products accessible via the Website or our application
                  programming interfaces (APIs), including conversational AI agents, voice AI
                  agents, telephony functionality, WhatsApp Business integration, admin
                  console, and all related products and services (collectively, the
                  &ldquo;Services&rdquo;).
                </li>
              </ul>
            </div>

            {/* Critical Legal Notices Callout Box */}
            <div className="terms-notice-card">
              <div className="terms-notice-item">
                <div className="terms-notice-badge">Subscription Renewal Notice</div>
                <p>
                  IF YOU SUBSCRIBE TO ANY FEATURE OR FUNCTIONALITY OF THE SERVICES FOR A TERM
                  (THE &ldquo;INITIAL TERM&rdquo;), THEN YOUR SUBSCRIPTION WILL BE AUTOMATICALLY RENEWED FOR
                  ADDITIONAL PERIODS OF THE SAME DURATION AS THE INITIAL TERM AT SPANDAN&apos;S
                  THEN-CURRENT FEE FOR SUCH FEATURES AND FUNCTIONALITY UNLESS YOU DECIDE NOT TO
                  RENEW YOUR SUBSCRIPTION IN ACCORDANCE WITH{' '}
                  <button type="button" onClick={() => scrollTo('section-6')} className="terms-anchor-btn">
                    SECTION 6(a)
                  </button>{' '}
                  BELOW.
                </p>
              </div>

              <div className="terms-notice-item">
                <div className="terms-notice-badge">Liability Limitations</div>
                <p>
                  THESE TERMS CONTAIN VARIOUS LIMITATIONS AND EXCLUSIONS OF LIABILITY IN{' '}
                  <button type="button" onClick={() => scrollTo('section-11')} className="terms-anchor-btn">
                    SECTION 11
                  </button>
                  .
                </p>
              </div>

              <div className="terms-notice-item">
                <div className="terms-notice-badge">Binding Dispute Resolution</div>
                <p>
                  <button type="button" onClick={() => scrollTo('section-12')} className="terms-anchor-btn">
                    SECTION 12
                  </button>{' '}
                  CONTAINS PROVISIONS THAT GOVERN HOW TO RESOLVE DISPUTES BETWEEN YOU AND SPANDAN.
                </p>
              </div>
            </div>

            {/* Supplemental Terms */}
            <div className="terms-sub-block">
              <p>
                We may indicate that different or additional terms, conditions, guidelines,
                policies, or rules apply in relation to your access to and use of some or all
                of our Services (&ldquo;Supplemental Terms&rdquo;), including:
              </p>

              <ul className="terms-list">
                <li>Our Service-Specific Terms, which apply to your use of certain Services;</li>
                <li>Our Prohibited Use Policy, which applies to your use of all of our Services;</li>
                <li>Our Data Processing Addendum, which governs our processing of any personal data contained within any content you provide to us;</li>
                <li>Our Enterprise Terms, which apply to your use of our enterprise Services; and</li>
                <li>Any other terms and conditions disclosed within the Services.</li>
              </ul>

              <p>
                Any Supplemental Terms become part of your agreement with us if you use the
                applicable Services, and if there is a conflict between these Terms and the
                Supplemental Terms, the Supplemental Terms will control for that conflict. We
                may make changes to these Terms. The &ldquo;Last Updated&rdquo; date above indicates when
                these Terms were last changed. If we make future changes, we may provide you
                with notice of those changes by any reasonable means, such as by sending an
                email, providing a notice through our Services, or updating the date at the top
                of these Terms. Unless we say otherwise in our notice, the amended Terms will
                be effective immediately, and your continued use of our Services after we
                provide such notice will confirm your acceptance of the changes. If you do not
                agree to the amended Terms, you must immediately stop using our Services.
              </p>
            </div>

            {/* 1. ELIGIBILITY AND USE RESTRICTIONS */}
            <section id="section-1" className="terms-section">
              <h2 className="terms-section-title">1. ELIGIBILITY AND USE RESTRICTIONS</h2>
              
              <div className="terms-clause">
                <p>
                  <strong>(a) Age.</strong> If you are under 18 years of age (or the age of legal majority where
                  you live), you may not use our Services.
                </p>
              </div>

              <div className="terms-clause">
                <p>
                  <strong>(b) Authorization.</strong> If you register, access or use our Services on behalf of
                  another person or entity, (i) all references to &ldquo;you&rdquo; throughout these Terms
                  (other than in this Section 1(a)) will include that person or entity, (ii) you
                  represent that you are authorized to enter into these Terms on that person&apos;s or
                  entity&apos;s behalf, and (iii) in the event you or that person or entity violates
                  these Terms, that person or entity also agrees to be responsible to us. If you
                  are an entity using any Services pursuant to these Terms, you are responsible
                  for your employees&apos; and representatives&apos; use of the Services, including
                  ensuring they comply with these Terms.
                </p>
              </div>

              <div className="terms-clause">
                <p>
                  <strong>(c) Use Restrictions.</strong> Your access to and use of the Services and your use of
                  any Output (defined below) must comply with these Terms. Without limiting the
                  foregoing: (i) if you access or use our Services free of charge (such a user, a
                  &ldquo;Free User&rdquo;), you may only use the Services for non-commercial purposes; (ii)
                  if you access or use our Services through a paid subscription plan (such a
                  user, a &ldquo;Paid User&rdquo;), you may use the Services for commercial purposes, but in
                  either case, your access and use of the Services and any Output must still
                  comply with the Prohibited Use Policy. If using the Services for non-commercial
                  purposes, a personal email address must be used. To the extent you register for
                  the Services using a business entity&apos;s email address, you acknowledge that we
                  may deem such entity a Controller as it relates to the Personal Data contained
                  in your account, and we may take action on your account at the direction of the
                  Controller.
                </p>
              </div>
            </section>

            {/* 2. PERSONAL DATA */}
            <section id="section-2" className="terms-section">
              <h2 className="terms-section-title">2. PERSONAL DATA</h2>
              <p>
                You may provide certain information to Spandan in connection with your access
                to or use of our Services, or we may otherwise collect certain information
                about you when you access or use our Services. You agree to receive
                communications from Spandan via the Services using the email address or other
                contact information you provide in connection with the Services. You represent
                and warrant that any information that you provide to Spandan in connection with
                the Services is accurate. For information about how we collect, use, share, and
                otherwise process information about you, please review our{' '}
                <Link to="/privacy-policy" className="terms-link">Privacy Policy</Link>. In
                addition, where you agree to these Terms on behalf of an entity, you agree that
                the Data Processing Agreement governs Spandan&apos;s processing of any personal data
                contained within any content you input to our Services. You acknowledge that
                Spandan may process personal data relating to the operation, support, or use of
                our Services for our own business purposes, such as billing, account
                management, data analysis, benchmarking, technical support, product
                development, research and development of its AI models, improvement of its
                systems and technologies, and compliance with law.
              </p>
            </section>

            {/* 3. ACCOUNTS */}
            <section id="section-3" className="terms-section">
              <h2 className="terms-section-title">3. ACCOUNTS</h2>
              <p>
                We may require that you create an account in order to use some or all of our
                Services. You may not share or permit others to use your individual account
                credentials. You will promptly update any information contained in your account
                if it changes. You must maintain the security of your account, as applicable,
                and promptly notify us if you discover or suspect that someone has accessed
                your account without your permission. If your account is closed or terminated,
                you will forfeit all unused credits related to our Services (including call
                minutes and wallet credits) associated with your account.
              </p>
            </section>

            {/* 4. CONTENT AND USER VOICE MODELS; MODELS */}
            <section id="section-4" className="terms-section">
              <h2 className="terms-section-title">4. CONTENT AND USER VOICE MODELS; MODELS</h2>

              <div className="terms-clause">
                <p>
                  <strong>(a) Inputs and Outputs.</strong> You may transmit or otherwise provide data and
                  information as input to our Services (&ldquo;Input&rdquo;). When you provide Input to the
                  Services, you may receive audio output generated and returned by one or more
                  Voice Models, or text output generated and returned by one or more LLMs, based
                  on Input (&ldquo;Output&rdquo;) (Input and Output, collectively, the &ldquo;Content&rdquo;). Input may
                  include, without limitation, recordings of your voice, text descriptions,
                  prompts, instructions, contact data, knowledge-base files, or any other content
                  that you may provide to us through the Services. Your access to and use of the
                  Services, including for the purposes of providing Input to the Services and
                  receiving and using the Output from the Services, is subject to our Prohibited
                  Use Policy. We may enable you to download Output from some (but not all) of the
                  Services; in such cases, you are permitted to use such Output outside of the
                  Services but always subject to these Terms and our Prohibited Use Policy. If
                  you choose to make any of your information publicly available through the
                  Services or otherwise, you do so at your own risk.
                </p>
              </div>

              <div className="terms-clause">
                <p>
                  <strong>(b) User Voice Models.</strong> Some of our Services allow you to create a voice model
                  that can be used to generate Output in the form of synthetic audio sounding
                  like your voice or a voice you are authorized to share with us (a &ldquo;User Voice
                  Model&rdquo;). To create a User Voice Model through our Services, you may be asked to
                  upload audio recordings of your voice or the voice you are authorized to share
                  with us as Input to our Services, and Spandan is permitted to use those audio
                  recordings of the voice you provide to us subject to subsection 4(d) below. For
                  more information on how we collect, use, share, retain, and destroy your audio
                  recordings, please see the Voice Processing Notice in our{' '}
                  <Link to="/privacy-policy" className="terms-link">Privacy Policy</Link>. You
                  may request deletion of your User Voice Models created with your Input
                  recordings through your account.
                </p>
              </div>

              <div className="terms-clause">
                <p>
                  <strong>(c) Rights to Your Content.</strong>
                </p>
                <div className="terms-subclause">
                  <p>
                    <strong>(i)</strong> Except as expressly set forth herein, as between you and Spandan, you
                    retain all rights in and to your Input.
                  </p>
                  <p>
                    <strong>(ii)</strong> For the avoidance of doubt, Output may be generated by, but does not
                    include, Spandan&apos;s voice synthesis, speech-to-text, and language models
                    (collectively, the &ldquo;Models&rdquo;). Except as expressly set forth herein, as between
                    you and Spandan, you retain all rights in and to your Output.
                  </p>
                </div>
              </div>

              <div className="terms-clause">
                <p>
                  <strong>(d) License to Your Content.</strong> You hereby grant to Spandan a license to use,
                  reproduce, modify, adapt, publish, translate, create derivative works from,
                  distribute, publicly or otherwise perform and display, and use your Content to
                  provide the Services (including the trust and safety features therein), to
                  improve the Services, and to develop new services and products. For avoidance
                  of doubt, to the extent that your Content includes your voice, the foregoing
                  license allows Spandan to reproduce, modify, publish, create derivative works
                  from, distribute, publicly or otherwise perform, and use your voice, and other
                  indicia of your persona that may be contained therein, to provide and improve
                  the Services, and to develop new services and products. Notwithstanding the
                  foregoing, we will not commercialize your voice on a standalone basis without
                  your permission to do so. Such license shall be:
                </p>
                <ul className="terms-list">
                  <li>perpetual and irrevocable (which means this license cannot be withdrawn),</li>
                  <li>nonexclusive (which means you can license your Input to others),</li>
                  <li>royalty-free and fully paid (which means there are no monetary fees for this license),</li>
                  <li>worldwide (which means it&apos;s valid anywhere in the world), and</li>
                  <li>sub-licensable, through multiple tiers (which means we can make it available to others).</li>
                </ul>
              </div>

              <div className="terms-clause">
                <p>
                  <strong>(e) License to User Voice Models.</strong> To the extent you own or acquire any
                  intellectual property rights in or to any User Voice Models, you hereby grant
                  to Spandan a license to use, reproduce, modify, adapt, publish, translate,
                  create derivative works from, distribute, publicly or otherwise perform and
                  display, and use the User Voice Models to provide the Services (including the
                  trust and safety features therein) to you, to improve the Services, and to
                  develop new services and products. Such license shall be:
                </p>
                <ul className="terms-list">
                  <li>perpetual and irrevocable (which means this license cannot be withdrawn),</li>
                  <li>nonexclusive (which means you can license your Input to others),</li>
                  <li>royalty-free and fully paid (which means there are no monetary fees for this license),</li>
                  <li>worldwide (which means it&apos;s valid anywhere in the world), and</li>
                  <li>sub-licensable, through multiple tiers (which means we can make it available to others).</li>
                </ul>
              </div>

              <div className="terms-clause">
                <p>
                  <strong>(f) Necessary Rights.</strong> You may not provide Input or create Output for which you
                  do not have all the rights necessary to grant us the license described above.
                  You represent and warrant that the Content and User Voice Models, and our use
                  of the Content and User Voice Models, will not violate any rights of any person
                  or entity, or cause injury to any person or entity.
                </p>
              </div>

              <div className="terms-clause">
                <p>
                  <strong>(g) No PHI.</strong> You may not provide any Input that includes protected health
                  information as defined by the Health Insurance Portability and Accountability
                  Act (HIPAA) of 1996, Pub. L. No. 104-191 except as permitted by an executed
                  HIPAA BAA.
                </p>
              </div>

              <div className="terms-clause">
                <p>
                  <strong>(h) Data Deletion and Opt Out.</strong> You may request for us to delete your personal
                  data as required under applicable law. Please see our{' '}
                  <Link to="/privacy-policy" className="terms-link">Privacy Policy</Link> for more
                  information. In addition, you may opt out of our use of your Content for
                  training at any time by navigating to the &apos;Data use&apos; menu in the &apos;Terms and
                  Privacy&apos; section of your Spandan account. Your Content will no longer be used
                  to improve our Services (including the Models) once the request has been
                  processed by our team, except as may be necessary to provide the Services to
                  you, but does not affect any uses of (or materials resulting from uses of) your
                  Content prior to that date.
                </p>
              </div>

              <div className="terms-clause">
                <p>
                  <strong>(i) Moderation.</strong> We do not undertake to review all Content, and we expressly
                  disclaim any duty or obligation to undertake any monitoring or review of any
                  Content. Although we have no obligation to screen, edit, or monitor Content, we
                  may:
                </p>
                <div className="terms-subclause">
                  <p>
                    <strong>(i)</strong> delete or remove Content or refuse to post any Content at any time and for
                    any reason with or without notice, including for any violations of applicable
                    law or these Terms;
                  </p>
                  <p>
                    <strong>(ii)</strong> terminate or suspend your access to all or part of the Services,
                    temporarily or permanently, if the Content is reasonably likely, in our sole
                    determination, to violate applicable law or these Terms;
                  </p>
                  <p>
                    <strong>(iii)</strong> take any action with respect to the Content that is necessary or
                    appropriate, in Spandan&apos;s sole discretion, to ensure compliance with applicable
                    law and these Terms, or to protect Company&apos;s rights, or to protect any
                    third-party rights, including third-party intellectual property and privacy
                    rights (e.g., providing information to copyright owners in furtherance of
                    Digital Millennium Copyright Act takedown requests) or to respond to threats to
                    the personal safety of users or the public; and
                  </p>
                  <p>
                    <strong>(iv)</strong> as permitted by law, cooperate fully with any law enforcement authorities
                    or court order requesting or directing us to disclose the identity or other
                    information of anyone posting any Content on or through the Services.
                  </p>
                </div>
              </div>
            </section>

            {/* 5. VOICE CLONING */}
            <section id="section-5" className="terms-section">
              <h2 className="terms-section-title">5. VOICE CLONING: DISCLOSURE, CONSENT, AND RESTRICTIONS</h2>
              <p>
                Voice cloning is a sensitive capability. This section applies whenever you use,
                enable, or request the creation of a synthetic voice, voice model, or cloned
                voice through the Services via ElevenLabs, Fish Audio, or any other supported
                voice-cloning provider.
              </p>

              <div className="terms-clause">
                <p>
                  <strong>(a) What Voice Cloning Does.</strong> Voice cloning analyzes an audio sample to create a
                  voice model capable of generating new synthetic speech that resembles the
                  characteristics of the sampled voice. Once created, a voice model can produce
                  speech saying things the original speaker never said.
                </p>
              </div>

              <div className="terms-clause">
                <p>
                  <strong>(b) Consent Requirement &ndash; Mandatory.</strong> You must obtain the explicit, informed,
                  prior consent of any individual whose voice you submit for cloning, synthesis,
                  or replication, before uploading or processing that voice through the Services.
                  This applies regardless of whether the individual is a customer, employee,
                  contractor, public figure, or any other person. If the individual is a minor,
                  you must additionally obtain the verifiable consent of a parent or legal
                  guardian, and confirm that such use is lawful in the relevant jurisdiction.
                </p>
              </div>

              <div className="terms-clause">
                <p>
                  <strong>(c) Your Representations.</strong> By submitting any voice sample for cloning, you
                  represent and warrant that:
                </p>
                <ul className="terms-list">
                  <li>
                    You either own the voice being cloned, or you have obtained documented,
                    verifiable consent from the individual whose voice is being cloned,
                    specifically authorizing its use for AI voice synthesis on the Services;
                  </li>
                  <li>
                    You will not clone or attempt to clone the voice of any individual without
                    such consent, including public figures, celebrities, politicians, or deceased
                    persons, where such use could mislead, defame, or deceive;
                  </li>
                  <li>You will retain evidence of consent and produce it to us upon request;</li>
                  <li>The submitted recording was lawfully obtained.</li>
                </ul>
              </div>

              <div className="terms-clause">
                <p>
                  <strong>(d) Prohibited Uses of Cloned Voices.</strong> You must not use voice cloning
                  functionality to:
                </p>
                <ul className="terms-list">
                  <li>
                    Impersonate any person without authorization, including for fraud, &ldquo;vishing,&rdquo;
                    social engineering, or account takeover;
                  </li>
                  <li>
                    Create content that falsely suggests a person said or endorsed something they
                    did not;
                  </li>
                  <li>Harass, defame, humiliate, threaten, or intimidate any individual;</li>
                  <li>
                    Circumvent voice-based authentication or identity verification systems
                    belonging to any third party;
                  </li>
                  <li>
                    Generate deceptive political content, impersonate political candidates or
                    elected government officials, engage in voter suppression, or otherwise
                    interfere with elections or public institutions;
                  </li>
                  <li>
                    Violate any applicable right-of-publicity, biometric-privacy, or
                    data-protection law.
                  </li>
                </ul>
              </div>

              <div className="terms-clause">
                <p>
                  <strong>(e) Sensitive/Biometric Information.</strong> Depending on your jurisdiction, a voice
                  sample and the resulting voice model may constitute biometric or otherwise
                  sensitive personal information. You are responsible for identifying and
                  complying with any heightened consent, notice, storage, or deletion obligations
                  that apply to biometric data under applicable law (for example, requirements
                  analogous to biometric privacy statutes in certain U.S. states, or
                  special-category data rules under GDPR-equivalent frameworks).
                </p>
              </div>

              <div className="terms-clause">
                <p>
                  <strong>(f) Disclosure to End Users.</strong> Where a synthetic or cloned voice is used to
                  interact with an individual (for example, in a phone call or WhatsApp voice
                  message), you are responsible for providing any disclosure required by
                  applicable law that the individual is interacting with, or hearing, an
                  AI-generated or synthetic voice, and, where a call is being recorded,
                  disclosing that fact as required.
                </p>
              </div>

              <div className="terms-clause">
                <p>
                  <strong>(g) No-Go Voices Safeguard.</strong> We maintain safeguards designed to detect and
                  prevent the creation of voice clones that approximate the voices of prominent
                  public figures as part of our commitment to prevent AI voices from being used
                  to fabricate misleading content. In accordance with these Terms, we may take
                  action based on a violation, which could include warnings, removal of voices,
                  account bans, and cooperation with authorities.
                </p>
              </div>

              <div className="terms-clause">
                <p>
                  <strong>(h) Right to Suspend.</strong> We may, without liability, refuse to process a
                  voice-cloning request, suspend an existing voice model, or remove voice-cloning
                  access for any account where we reasonably suspect the consent, ownership, or
                  use requirements in this Section have not been met.
                </p>
              </div>

              <div className="terms-clause">
                <p>
                  <strong>(i) Deletion of Voice Models.</strong> You may request deletion of a voice model and its
                  underlying samples through available account controls or by contacting us.
                  Deletion propagates to our systems and, where technically and contractually
                  possible, to the underlying voice provider, subject to the retention exceptions
                  described in our <Link to="/privacy-policy" className="terms-link">Privacy Policy</Link>.
                </p>
              </div>

              <div className="terms-clause">
                <p>
                  <strong>(j) No Endorsement.</strong> Spandan does not review or verify consent documentation as
                  a condition of processing a voice-cloning request unless specifically flagged
                  for compliance review. Responsibility for lawful use of voice cloning rests
                  with you as set out in our Prohibited Use Policy and{' '}
                  <button type="button" onClick={() => scrollTo('section-9')} className="terms-anchor-btn">
                    Section 9 (Indemnification)
                  </button>
                  .
                </p>
              </div>
            </section>

            {/* 6. SUBSCRIPTION SERVICES; PAYMENT */}
            <section id="section-6" className="terms-section">
              <h2 className="terms-section-title">6. SUBSCRIPTION SERVICES; PAYMENT</h2>

              <div className="terms-clause">
                <p>
                  <strong>(a) Subscriptions.</strong> To access and use certain Services, you may be required to
                  enroll in a subscription payment plan (a &ldquo;Recurring Subscription&rdquo;). Your
                  Recurring Subscription will automatically renew until you cancel it or your
                  Recurring Subscription is otherwise terminated. You authorize us to store your
                  payment method information and to automatically charge your payment method(s)
                  for the amount of your Recurring Subscription with no further action required
                  by you. The length of your Recurring Subscription will be provided when you
                  make your purchase. In the event that Spandan is unable to charge your payment
                  method(s) as authorized by you when you enrolled in a Recurring Subscription,
                  Spandan may in its sole discretion (i) suspend your access to the Services
                  until payment is received or (ii) seek to update your payment method
                  information through third-party sources (i.e., your bank or a payment
                  processor) to continue charging your payment method as authorized by you. You
                  may cancel your subscription through your account. You may cancel a Recurring
                  Subscription at any time, but if you cancel your Recurring Subscription before
                  the end of the current subscription period, we will not refund any subscription
                  fees already paid to us. Following any cancellation, however, you will continue
                  to have access to the applicable Services through the end of your current
                  subscription period. Spandan may change the prices charged for Recurring
                  Subscriptions at any time by posting updated pricing through the Services;
                  provided, however, that the prices for your Recurring Subscription will remain
                  in force for the duration of the subscription period for which you have paid.
                  After that period ends, your use of the applicable Services will be charged at
                  the then-current subscription price. If you do not agree to these price
                  changes, you must cancel your Recurring Subscription at least 7 days before the
                  changes take effect. If you do not cancel, your Recurring Subscription will
                  automatically renew at the then-current price at the time of renewal and for
                  the same duration as the initial subscription term, and Spandan will charge
                  your on-file payment card or method on the first day of the renewal of the
                  subscription term.
                </p>
              </div>

              <div className="terms-clause">
                <p>
                  <strong>(b) Wallet and Prepaid Credits.</strong>
                </p>
                <div className="terms-subclause">
                  <p>
                    <strong>(i) Overview and Nature of Wallet Credits.</strong> Spandan may offer prepaid usage
                    credits (&ldquo;Wallet Credits&rdquo;) for certain Services or Accounts. Wallet Credits are
                    a limited, revocable, prepaid right to access Services, are not money or a
                    monetary equivalent, and do not constitute a deposit, stored value, or balance
                    held for your benefit, nor do they create any fiduciary or custodial
                    relationship.
                  </p>
                  <p>
                    <strong>(ii) Promotional Credits.</strong> From time to time, Spandan may issue Wallet Credits
                    without charge as part of a promotional, marketing, or trial program
                    (&ldquo;Promotional Credits&rdquo;). Promotional Credits are subject to these Terms unless
                    otherwise expressly stated at the time of issuance and may be subject to
                    additional restrictions, including limitations on use, expiration, or
                    eligibility.
                  </p>
                  <p>
                    <strong>(iii) Purchase of Wallet Credits.</strong> Wallet Credits may be purchased through your
                    Account, either as a one-time purchase or via recurring purchase. Spandan may
                    impose purchase limits, and Wallet Credits are issued upon successful payment.
                    If you elect to enable recurring purchase, you authorize Spandan to
                    automatically charge your saved Payment Method and add additional Wallet
                    Credits to your Account when your available Wallet Credits balance falls below
                    the threshold you select. The recurring purchase will continue until you
                    disable the feature or your Account is terminated in accordance with these
                    Terms.
                  </p>
                  <p>
                    <strong>(iv) Use of Wallet Credits.</strong> Wallet Credits may be used only to pay for eligible
                    Services as expressly permitted by Spandan and solely in connection with your
                    Account. The rate at which Wallet Credits are applied to Services may vary
                    depending on your Recurring Subscription and the pricing applicable to your use
                    of the Services at the time of use. Wallet Credits may not be transferred,
                    sold, gifted, traded, sublicensed, or assigned, whether for value or otherwise,
                    and any purported transfer is void.
                  </p>
                  <p>
                    <strong>(v) Account Balance and Responsibility.</strong> Your available Wallet Credits balance
                    is viewable through your Account, and you are solely responsible for verifying
                    all Wallet Credits additions and deductions. Your Wallet Credits balance is not
                    a bank account, digital wallet, stored value account, or other payment device.
                  </p>
                  <p>
                    <strong>(vi) Expiration of Wallet Credits.</strong> Unless otherwise specified at the time of
                    purchase or issuance, all Wallet Credits expire twelve (12) months after the
                    date of purchase or issuance, as applicable. Expired Wallet Credits are
                    automatically removed from your Account and may not be reinstated. Spandan has
                    no obligation to provide notice prior to the expiration of Wallet Credits.
                  </p>
                  <p>
                    <strong>(vii) No Refunds; Final Sale.</strong> Except where required by applicable law, Wallet
                    Credits purchases are non-refundable, and no refunds or credits will be
                    provided for unused, partially used, expired, or forfeited Wallet Credits.
                    Unused Wallet Credits are not refundable upon Account suspension or
                    termination.
                  </p>
                  <p>
                    <strong>(viii) Prohibited Transfers and Misuse.</strong> Spandan does not permit or recognize
                    the sale, transfer, gift, trade, or exchange of Wallet Credits. Any such
                    attempt constitutes a material breach and may result, at Spandan&apos;s discretion,
                    in cancellation or forfeiture of Wallet Credits or termination of your Account
                    without refund.
                  </p>
                  <p>
                    <strong>(ix) Changes to Wallet Credits Terms.</strong> Spandan may modify Wallet Credits
                    pricing, usage rates, expiration periods, or eligible Services under{' '}
                    <button type="button" onClick={() => scrollTo('section-14')} className="terms-anchor-btn">
                      Section 14
                    </button>
                    . Such changes apply prospectively and will not reduce the remaining validity
                    of purchased Wallet Credits, except as required by law or for fraud prevention,
                    security, or legal compliance.
                  </p>
                  <p>
                    <strong>(x) Effect of Account Termination.</strong> Upon suspension or termination of your
                    Account for any reason, including under{' '}
                    <button type="button" onClick={() => scrollTo('section-14')} className="terms-anchor-btn">
                      Section 14
                    </button>
                    , any unused Wallet Credits remaining in your Account will be forfeited without refund, except where
                    required by applicable law.
                  </p>
                </div>
              </div>

              <div className="terms-clause">
                <p>
                  <strong>(c) Other Usage Charges.</strong> In the event your usage exceeds the volume provided
                  under your Recurring Subscription, you will be charged usage overage fees for
                  your Recurring Subscription, as indicated to you upon subscribing. In such
                  event, you hereby authorize us to charge your payment method on file or any
                  other payment method you choose for these charges.
                </p>
              </div>

              <div className="terms-clause">
                <p>
                  <strong>(d) Payment.</strong> You represent and warrant that you have the right to use any
                  payment method that you submit in connection with a payment. We may receive
                  updated information from your issuing bank or our payment service provider
                  about any payment method you have stored with us. You authorize us to charge
                  your payment method, including any updated payment method information we
                  receive, for any charges you are responsible for under these Terms.
                  Verification of information may be required prior to the acknowledgment or
                  completion of any transaction. You agree to pay all charges incurred by you or
                  on your behalf through the Services, at the prices in effect at the time such
                  charges are incurred, including applicable taxes, where required by law. In the
                  event legal action is necessary to collect on balances due, you will reimburse
                  us and our vendors or agents for all expenses incurred to recover sums due,
                  including attorneys&apos; fees and other legal expenses.
                </p>
              </div>

              <div className="terms-clause">
                <p>
                  <strong>(e) Refunds and Exchanges.</strong> All sales are final. We may offer refunds at our
                  sole discretion.
                </p>
              </div>

              <div className="terms-clause">
                <p>
                  <strong>(f) Reservation of Rights.</strong> Spandan reserves the right, including without prior
                  notice, to impose conditions on the honoring of any coupon, discount, or
                  similar promotion; to bar any user from making any transaction; to alter the
                  payment option for services; and to refuse to provide any user with any
                  Service.
                </p>
              </div>
            </section>

            {/* 7. TELEPHONY AND CALL RECORDING */}
            <section id="section-7" className="terms-section">
              <h2 className="terms-section-title">7. TELEPHONY AND CALL RECORDING</h2>

              <div className="terms-clause">
                <p>
                  <strong>(a) Provider Dependency.</strong> Outbound and inbound calling functionality is
                  delivered through third-party telecommunications providers (including Twilio).
                  Call quality, deliverability, and connectivity depend in part on those
                  providers and on carrier networks outside our control.
                </p>
              </div>

              <div className="terms-clause">
                <p>
                  <strong>(b) Recording and Transcription Consent.</strong> Where you enable call recording,
                  transcription, or post-call analysis, you are solely responsible for
                  determining whether applicable law (including two-party/all-party consent
                  recording laws) requires you to notify or obtain consent from call
                  participants, and for providing that notice or obtaining that consent before or
                  at the start of the call.
                </p>
              </div>

              <div className="terms-clause">
                <p>
                  <strong>(c) AI Agent Disclosure.</strong> Where required by applicable law, you are responsible
                  for disclosing to call recipients that they are speaking with an AI-generated
                  voice or automated system, rather than a human, and that conversations are
                  being recorded and may be shared with us and third-party providers.
                </p>
              </div>

              <div className="terms-clause">
                <p>
                  <strong>(d) Bulk and Automated Calling.</strong> You are solely responsible for ensuring that
                  any bulk, automated, or unsolicited calling campaign complies with applicable
                  telemarketing, robocall, do-not-call, and consumer-protection laws in every
                  jurisdiction you contact, including maintaining and honoring opt-out and
                  do-not-call requests. Spandan&apos;s platform includes a bulk voice campaign
                  dispatcher that respects plan concurrency limits, spaces dials, rotates caller
                  IDs, and records every recipient&apos;s outcome.
                </p>
              </div>

              <div className="terms-clause">
                <p>
                  <strong>(e) Emergency Calling Not Supported.</strong> The Services are not designed or intended
                  to support emergency calling (e.g., 911, 112, or equivalent). Do not rely on
                  the Services for emergency communications.
                </p>
              </div>
            </section>

            {/* 8. WHATSAPP BUSINESS FUNCTIONALITY */}
            <section id="section-8" className="terms-section">
              <h2 className="terms-section-title">8. WHATSAPP BUSINESS FUNCTIONALITY</h2>

              <div className="terms-clause">
                <p>
                  <strong>(a) Meta Policies.</strong> WhatsApp functionality is provided through the Meta
                  WhatsApp Cloud API and is subject to Meta&apos;s business and platform policies in
                  addition to these Terms. You are responsible for complying with Meta&apos;s
                  messaging, opt-in, and template requirements.
                </p>
              </div>

              <div className="terms-clause">
                <p>
                  <strong>(b) Consent for Messaging.</strong> You must obtain appropriate opt-in consent from a
                  contact before sending them commercial or automated WhatsApp messages, and must
                  honor opt-out requests promptly.
                </p>
              </div>

              <div className="terms-clause">
                <p>
                  <strong>(c) Suspension by Meta.</strong> We are not responsible for any suspension, restriction,
                  or termination of your WhatsApp Business account imposed by Meta as a result of
                  your use of the messaging functionality.
                </p>
              </div>
            </section>

            {/* 9. INDEMNIFICATION */}
            <section id="section-9" className="terms-section">
              <h2 className="terms-section-title">9. INDEMNIFICATION</h2>
              <p>
                To the fullest extent permitted by applicable law, you will indemnify, defend
                (at our option), and hold harmless Spandan and our officers, directors,
                partners, licensors, employees and agents from and against any losses,
                liabilities, claims, demands, damages, expenses or costs (&ldquo;Claims&rdquo;) arising out
                of or related to: (a) your access to or use of the Services; (b) the Content or
                Feedback; (c) your violation of these Terms; (d) your violation,
                misappropriation, or infringement of any rights of another (including
                intellectual property rights or privacy rights); (e) your failure to obtain any
                consent required under these Terms; or (f) your conduct in connection with the
                Services or the Content. You will cooperate with Spandan in defending such
                Claims, and pay all fees, costs, and expenses associated with defending such
                Claims (including attorneys&apos; fees). Spandan will have control of the defense or
                settlement, at Spandan&apos;s sole option, of any third-party Claims. This indemnity
                is in addition to, and not in lieu of, any other indemnities set forth in a
                written agreement between you and Spandan.
              </p>
            </section>

            {/* 10. DISCLAIMERS */}
            <section id="section-10" className="terms-section">
              <h2 className="terms-section-title">10. DISCLAIMERS</h2>
              <p>
                Your use of our Services and any content or materials provided therein or
                therewith (including third-party content and services) is at your sole risk. To
                the fullest extent permitted under applicable law, our Services and any content
                or materials provided therein or therewith are provided &ldquo;as is&rdquo; and &ldquo;as
                available&rdquo; without warranties of any kind, either express or implied. Spandan
                disclaims all warranties with respect to the foregoing, including implied
                warranties of merchantability, fitness for a particular purpose, title, and
                non-infringement. In addition, Spandan does not represent or warrant that our
                Services or any content provided therein or therewith are accurate, complete,
                reliable, current, or error-free or that access to our Services or any content
                provided therein or therewith will be uninterrupted. While Spandan attempts to
                make your use of our Services and any content provided therein or therewith
                safe, we cannot and do not represent or warrant that our Services or any
                content provided therein or therewith are free of viruses or other harmful
                components or content or materials. All disclaimers of any kind (including in
                this Section 10 and elsewhere in these Terms) are made for the benefit of all
                Spandan and Spandan&apos;s respective shareholders, agents, representatives,
                licensors, suppliers, and service providers, as well as our and their
                respective successors and assigns. Due to the nature of machine learning, the
                Output generated by you using the Services may not be unique across users, as
                the Services may produce the same or similar Output for you and a third party.
                Two different parties may receive the same or similar Output after submitting
                their respective Inputs. Responses requested by and generated for other users
                that are not you shall not be considered Output for you, and you shall have no
                right or title over it.
              </p>
            </section>

            {/* 11. LIMITATION OF LIABILITY */}
            <section id="section-11" className="terms-section">
              <h2 className="terms-section-title">11. LIMITATION OF LIABILITY</h2>

              <div className="terms-clause">
                <p>
                  <strong>(a)</strong> To the fullest extent permitted by applicable law, Spandan will not be
                  liable to you under any theory of liability (whether based in contract, tort,
                  negligence, warranty, or otherwise) for any indirect, consequential,
                  exemplary, incidental, punitive, or special damages or lost profits, even if
                  Spandan has been advised of the possibility of such damages.
                </p>
              </div>

              <div className="terms-clause">
                <p>
                  <strong>(b)</strong> The total liability of Spandan for any claim arising out of or relating to
                  these Terms or our Services, regardless of the form of the action, is limited
                  to the greater of: (i) One Hundred United States Dollars ($100 USD); and (ii)
                  the amount paid by you to use our Services in the 12 months preceding the
                  claim.
                </p>
              </div>
            </section>

            {/* 12. DISPUTE RESOLUTION */}
            <section id="section-12" className="terms-section">
              <h2 className="terms-section-title">12. DISPUTE RESOLUTION</h2>
              <p>
                Please read this Section 12 carefully. It requires you and Spandan to resolve
                certain disputes and claims through a specific process and limits the manner in
                which we can seek relief from each other.
              </p>

              <div className="terms-clause">
                <p>
                  <strong>(a) Informal Dispute Resolution Prior to Arbitration.</strong> For any dispute or claim
                  between you and Spandan arising out of or relating in any way to your access to
                  or use of the Services, any communications you receive, any products sold or
                  distributed through the Services or these Terms and prior versions of these
                  Terms, including claims and disputes that arose between you and us before the
                  effective date of these Terms, or any privacy or data security claims,
                  (collectively, &ldquo;Disputes&rdquo;, and each a &ldquo;Dispute&rdquo;), you and Spandan agree to
                  attempt to first resolve the Claim informally via the following process:
                </p>
                <ul className="terms-list">
                  <li>
                    If you assert a Dispute against Spandan, you will first contact Spandan by
                    sending a written notice of your Dispute to Spandan by email to{' '}
                    <a href="mailto:Info@mannmate.com" className="terms-link">Info@mannmate.com</a>.
                  </li>
                  <li>
                    If Spandan asserts a Dispute against you, Spandan will contact you by sending
                    a written notice of Spandan&apos;s Dispute to you via email to the primary email
                    address associated with your account.
                  </li>
                  <li>
                    If you and Spandan cannot reach an agreement to resolve the Dispute within 30
                    days after you or Spandan receives the applicable notice, then either party
                    may submit the Dispute to binding arbitration as set forth below. The statute
                    of limitations and any filing fee deadlines shall be tolled for thirty (30)
                    days from the date that either you or Spandan first send the applicable
                    notice so that the parties can engage in this informal dispute-resolution
                    process.
                  </li>
                </ul>
              </div>

              <div className="terms-clause">
                <p>
                  <strong>(b) Disputes Subject to Binding Arbitration; Exceptions.</strong> Except for individual
                  disputes that qualify for small claims court and any disputes exclusively
                  related to the intellectual property or intellectual property rights of you or
                  Spandan, including any disputes in which you or Spandan seek injunctive or
                  other equitable relief for the alleged unlawful use of your or Spandan&apos;s
                  intellectual property or other infringement of your or Spandan&apos;s intellectual
                  property rights (&ldquo;IP Disputes&rdquo;), all Disputes, whether based in contract, tort,
                  statute, fraud, misrepresentation, or any other legal theory, that are not
                  resolved in accordance with Section 12(a) will be resolved by a neutral
                  arbitrator through final and binding arbitration instead of in a court by a
                  judge or jury. The arbitration shall be administered by a reputable arbitration
                  service mutually agreed upon by the parties. The arbitrator will have the
                  authority to grant any remedy or relief that would otherwise be available in
                  court. The remedies and reliefs rendered by the arbitrator may be confirmed and
                  enforced in any court having jurisdiction.
                </p>

                <p>
                  A party who wishes to initiate arbitration must provide the other party with a
                  request for arbitration (the &ldquo;Request&rdquo;). The Request must include: (i) the
                  name, mailing address, email address, and telephone number of the party seeking
                  arbitration and the email address associated with any applicable account; (ii)
                  a statement of the legal claims being asserted and the factual bases of those
                  claims; (iii) a description of the remedy sought and an accurate, good faith
                  calculation of the amount in controversy in United States dollars; (iv) a
                  statement certifying completion of the informal dispute resolution process as
                  described in Section 12(a) above; and (v) evidence that the requesting party
                  has paid any necessary filing fees in connection with such arbitration.
                </p>

                <p>
                  If the party requesting arbitration is represented by counsel, the Request
                  shall also include such counsel&apos;s name, mailing address, email address, and
                  telephone number. Such counsel must also sign the Request. By signing the
                  Request, counsel certifies to the best of counsel&apos;s knowledge, information, and
                  belief, formed after an inquiry reasonable under the circumstances, that: (A)
                  the Request is not being presented for an improper purpose, such as to harass,
                  cause unnecessary delay, or needlessly increase the cost of dispute resolution;
                  (B) the claims, defenses and other legal contentions are warranted by existing
                  law or by a non-frivolous argument for extending, modifying, or reversing
                  existing law or for establishing new law; and (C) the factual and damages
                  contentions have evidentiary support or, if specifically so identified, will
                  likely have evidentiary support after a reasonable opportunity for further
                  investigation or discovery.
                </p>

                <p>
                  You and Spandan agree that all materials and documents exchanged during the
                  arbitration proceedings shall be kept confidential and shall not be shared with
                  anyone except the parties&apos; attorneys, accountants, or authorized
                  representatives, and shall be subject to the condition that they agree to keep
                  all materials and documents exchanged during the arbitration proceedings
                  strictly confidential.
                </p>
              </div>

              <div className="terms-clause">
                <p>
                  <strong>(c) Governing Law.</strong> These Terms shall be governed by and construed in
                  accordance with the laws applicable at Spandan&apos;s place of establishment,
                  without regard to conflict-of-laws principles, except where mandatory local
                  consumer-protection or data-protection law requires otherwise. Any dispute
                  arising out of or relating to these Terms shall first be attempted to be
                  resolved through good-faith negotiation; if unresolved, the dispute shall be
                  subject to the exclusive jurisdiction of the competent courts, or an
                  alternative dispute resolution mechanism, as specified in your applicable order
                  form or, absent one, at Spandan&apos;s registered place of business, subject to any
                  rights you have under mandatory local law.
                </p>
              </div>
            </section>

            {/* 13. OUR INTELLECTUAL PROPERTY */}
            <section id="section-13" className="terms-section">
              <h2 className="terms-section-title">13. OUR INTELLECTUAL PROPERTY</h2>

              <div className="terms-clause">
                <p>
                  <strong>(a) Ownership.</strong> The Services, including the text, graphics, images, photographs,
                  videos, illustrations, and other content contained therein, and all
                  intellectual property rights therein and thereto, are owned by Spandan or our
                  licensors. Except as explicitly stated in these Terms, all rights in and to the
                  Services, including all intellectual property rights therein and thereto, are
                  reserved by us or our licensors.
                </p>
              </div>

              <div className="terms-clause">
                <p>
                  <strong>(b) Limited License.</strong> Subject to your compliance with these Terms, Spandan
                  hereby grants to you a limited, non-exclusive, non-transferable,
                  non-sublicensable, revocable license to access and use our Services. For
                  clarity, any use of the Services other than as specifically authorized herein,
                  without our prior written permission, is strictly prohibited and will terminate
                  the license granted herein.
                </p>
              </div>

              <div className="terms-clause">
                <p>
                  <strong>(c) Trademarks.</strong> The name &ldquo;Spandan&rdquo; and our logos, product or service names,
                  slogans, and the look and feel of the Services are trademarks of Spandan and
                  may not be copied, imitated or used, in whole or in part, without our prior
                  written permission. All other trademarks, registered trademarks, product names,
                  and company names or logos mentioned or in connection with the Services are the
                  property of their respective owners. Reference to any products, services,
                  processes, or other information by trade name, trademark, manufacturer,
                  supplier, or otherwise does not constitute or imply endorsement, sponsorship,
                  or recommendation by us.
                </p>
              </div>

              <div className="terms-clause">
                <p>
                  <strong>(d) Feedback.</strong> You may voluntarily post, submit, or otherwise communicate to us
                  any questions, comments, suggestions, ideas, original or creative materials, or
                  other information about Spandan or our Services (collectively, &ldquo;Feedback&rdquo;). You
                  understand that we may use such Feedback for any purpose, commercial or
                  otherwise, without acknowledgement or compensation to you, including to
                  develop, copy, publish, or improve the Feedback or Services, or to improve or
                  develop new products, services, or technologies in Spandan&apos;s sole discretion.
                  Spandan will exclusively own any improvements to, or new inventions based upon,
                  such Services, or Services based on the Feedback. You understand that Spandan
                  may treat any Feedback as nonconfidential.
                </p>
              </div>
            </section>

            {/* 14. MODIFYING AND TERMINATING OUR SERVICES */}
            <section id="section-14" className="terms-section">
              <h2 className="terms-section-title">14. MODIFYING AND TERMINATING OUR SERVICES</h2>
              <p>
                We may: (a) modify, impose limits on, replace, upgrade, update, suspend, or
                terminate providing all or part of our Services at any time; (b) charge,
                modify, or waive any fees required to use the Services; or (c) offer
                opportunities to some or all end users of the Services, each of (a) through (c)
                without any liability or additional notice to you. All modifications and
                additions to the Services will be governed by the Terms or Supplemental Terms,
                unless otherwise expressly stated by Spandan in writing. We are not responsible
                for any loss or harm related to your inability to access or use our Services.
              </p>
            </section>

            {/* 15. THIRD-PARTY SERVICES AND CONTENT */}
            <section id="section-15" className="terms-section">
              <h2 className="terms-section-title">15. THIRD-PARTY SERVICES AND CONTENT</h2>

              <div className="terms-clause">
                <p>
                  <strong>(a)</strong> Our Services rely on or interoperate with third-party products and
                  services, including data storage services, communications technologies,
                  third-party LLM, STT, and TTS providers, telecommunications providers
                  (including Twilio), payment processors (including Razorpay), and internet and
                  mobile operators (collectively, &ldquo;Third-Party Services&rdquo;). These Third-Party
                  Services are beyond our control, but their operation may impact, or be impacted
                  by, the use and reliability of our Services. Third-Party Services may include
                  but are not limited to:
                </p>
                <ul className="terms-list">
                  <li><strong>AI Providers:</strong> OpenAI, Google Gemini, Azure OpenAI, Groq, Sarvam, xAI, ElevenLabs, Deepgram, Fish Audio, Cartesia</li>
                  <li><strong>Telephony Providers:</strong> Twilio</li>
                  <li><strong>Payment Processors:</strong> Razorpay</li>
                  <li><strong>WhatsApp Providers:</strong> Meta WhatsApp Cloud API</li>
                </ul>
              </div>

              <div className="terms-clause">
                <p>
                  <strong>(b)</strong> We may further provide information about or links to third-party products,
                  services, activities, or events, or we may allow third parties to make their
                  content and information available on or through the Services (collectively,
                  &ldquo;Third-Party Content&rdquo;). Your dealings or correspondence with third parties and
                  your use of or interaction with any Third-Party Content are solely between you
                  and the third party.
                </p>
              </div>

              <div className="terms-clause">
                <p>
                  <strong>(c)</strong> We have no obligation to monitor Third-Party Services or Third-Party
                  Content, and we may block or disable access to any Third-Party Services or
                  Third-Party Content (in whole or part) through our Services at any time. Your
                  access to and use of such Third-Party Content or Third-Party Services may be
                  subject to additional terms, conditions, and policies applicable to such
                  Third-Party Content (including terms of service or privacy policies of the
                  providers of such Third-Party Services). You are responsible for obtaining and
                  maintaining any computer hardware, equipment, network services and
                  connectivity, telecommunications services, and other products and services
                  necessary to access and use the Services.
                </p>
              </div>
            </section>

            {/* 16. EXPORT CONTROL */}
            <section id="section-16" className="terms-section">
              <h2 className="terms-section-title">16. EXPORT CONTROL</h2>
              <p>
                You are responsible for compliance with applicable export controls and for any
                violation of such controls, including any embargoes or other federal rules and
                regulations restricting exports. You represent and warrant that you are not
                located in a country or territory that is subject to economic sanctions or
                trade embargoes imposed by your government, that you are not listed on any
                government list of sanctioned individuals, that you will comply fully with all
                relevant export laws and regulations applicable to your use of the Services.
              </p>
            </section>

            {/* 17. MISCELLANEOUS */}
            <section id="section-17" className="terms-section">
              <h2 className="terms-section-title">17. MISCELLANEOUS</h2>

              <div className="terms-clause">
                <p>
                  <strong>(a)</strong> Spandan&apos;s failure to exercise or enforce any right or provision of these
                  Terms will not operate as a waiver of such right or provision. These Terms
                  reflect the entire agreement between the parties relating to the subject matter
                  hereof and supersede all prior agreements, representations, statements, and
                  understandings of the parties. Except as otherwise provided herein, these Terms
                  are intended solely for the benefit of the parties and are not intended to
                  confer third-party beneficiary rights upon any other person or entity.
                  Communications and transactions between us may be conducted electronically.
                </p>
              </div>

              <div className="terms-clause">
                <p>
                  <strong>(b)</strong> The section titles in these Terms are for convenience only and have no
                  legal or contractual effect. Lists of examples following &ldquo;including&rdquo; or &ldquo;e.g.&rdquo;
                  or similar words are not exhaustive (that is, they are interpreted to include
                  &ldquo;without limitation&rdquo;). All monetary amounts are expressed in U.S. dollars or
                  the currency selected in your account. URLs are understood to also refer to
                  successor URLs, URLs for localized content, and information or resources linked
                  from within the websites at the specified URLs. The word &ldquo;or&rdquo; will be deemed an
                  inclusive &ldquo;or&rdquo;.
                </p>
              </div>

              <div className="terms-clause">
                <p>
                  <strong>(c)</strong> If any portion of these Terms is found to be unenforceable or unlawful for
                  any reason, including but not limited to because it is found to be
                  unconscionable, (a) the unenforceable or unlawful provision will be severed
                  from these Terms; (b) severance of the unenforceable or unlawful provision will
                  have no impact whatsoever on the remainder of these Terms; and (c) the
                  unenforceable or unlawful provision may be revised to the extent required to
                  render the Terms enforceable or valid, and the rights and responsibilities of
                  the parties will be interpreted and enforced accordingly, so as to preserve the
                  Terms and the intent of the Terms to the fullest possible extent.
                </p>
              </div>

              <div className="terms-clause">
                <p>
                  <strong>(d)</strong> If you have a question or complaint regarding the Services, please send an
                  email to <a href="mailto:Info@mannmate.com" className="terms-link">Info@mannmate.com</a>. You
                  may also contact us by writing to the address provided on our Website. Note that
                  email communications will not necessarily be secure; accordingly, you should
                  not include payment card information or other sensitive information in your
                  email correspondence with us.
                </p>
              </div>
            </section>

            {/* 18. CONTACT US */}
            <section id="section-18" className="terms-section">
              <h2 className="terms-section-title">18. CONTACT US</h2>
              <p>If you have questions about these Terms and Conditions, please contact:</p>
              
              <div className="terms-contact-card">
                <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--tx)', marginBottom: 8 }}>Spandan</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 15 }}>
                  <div>
                    <span style={{ color: 'var(--tx-3)', marginRight: 8 }}>Email:</span>
                    <a href="mailto:Info@mannmate.com" className="terms-link">Info@mannmate.com</a>
                  </div>
                  <div>
                    <span style={{ color: 'var(--tx-3)', marginRight: 8 }}>Website:</span>
                    <a href="https://spandan.mannmate.com" target="_blank" rel="noopener noreferrer" className="terms-link">
                      https://spandan.mannmate.com
                    </a>
                  </div>
                </div>
                <p style={{ marginTop: 14, marginBottom: 0, fontSize: 13.5, color: 'var(--tx-3)', lineHeight: 1.6 }}>
                  Business customers requiring a signed order form, Data Processing Agreement, or other contractual documentation may contact us using the information above.
                </p>
              </div>
            </section>
          </article>

          {/* Sticky Table of Contents on Wide Screens */}
          <aside className="terms-sidebar">
            <div className="terms-toc-card">
              <div className="terms-toc-heading">Quick Navigation</div>
              <nav className="terms-toc-nav" aria-label="Terms and Conditions Table of Contents">
                {SECTIONS.map((sec) => (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => scrollTo(sec.id)}
                    className="terms-toc-link"
                  >
                    <span className="terms-toc-num">{sec.num}</span>
                    <span className="terms-toc-title">{sec.title}</span>
                  </button>
                ))}
              </nav>
            </div>
          </aside>
        </div>
      </div>

      <style>{`
        .terms-page {
          min-height: 100vh;
        }

        .terms-header {
          max-width: 820px;
          padding: 56px 0 36px;
        }

        .terms-header .rz-h1 {
          margin: 16px 0 12px;
          font-size: clamp(34px, 5vw, 54px);
          line-height: 1.15;
          letter-spacing: -0.02em;
          color: var(--tx);
        }

        .terms-updated {
          color: var(--tx-3);
          font-family: var(--ff-m);
          font-size: 13px;
          margin: 18px 0 0;
        }

        .terms-layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 280px;
          gap: 48px;
          align-items: start;
          padding-bottom: 96px;
        }

        .terms-content {
          max-width: 800px;
          color: var(--tx-2);
          font-family: var(--ff-b);
          font-size: 15.5px;
          line-height: 1.75;
        }

        .terms-content p {
          margin: 0 0 20px;
        }

        .terms-intro-block {
          margin-bottom: 28px;
        }

        .terms-notice-card {
          background: var(--s1);
          border: 1px solid var(--line-2);
          border-left: 3px solid var(--cyan);
          border-radius: 12px;
          padding: 24px 22px;
          margin: 28px 0 32px;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .terms-notice-item {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .terms-notice-item p {
          margin: 0;
          font-size: 13.5px;
          line-height: 1.65;
          color: var(--tx);
          font-weight: 500;
          letter-spacing: 0.01em;
        }

        .terms-notice-badge {
          display: inline-flex;
          align-self: flex-start;
          font-family: var(--ff-m);
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          padding: 3px 8px;
          border-radius: 6px;
          background: rgba(14, 179, 158, 0.12);
          color: var(--cyan);
          border: 1px solid rgba(14, 179, 158, 0.25);
        }

        .terms-sub-block {
          margin: 28px 0 40px;
        }

        .terms-section {
          scroll-margin-top: 90px;
          padding-top: 32px;
          border-top: 1px solid var(--line);
          margin-top: 32px;
        }

        .terms-section-title {
          margin: 0 0 20px;
          color: var(--tx);
          font-family: var(--ff-d);
          font-weight: 700;
          font-size: 22px;
          line-height: 1.3;
          letter-spacing: -0.01em;
        }

        .terms-clause {
          margin-bottom: 22px;
        }

        .terms-clause strong {
          color: var(--tx);
          font-weight: 600;
        }

        .terms-subclause {
          margin-left: 20px;
          padding-left: 14px;
          border-left: 2px solid var(--line);
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-top: 12px;
          margin-bottom: 16px;
        }

        .terms-subclause p {
          margin: 0;
        }

        .terms-list {
          margin: 0 0 22px;
          padding-left: 24px;
          list-style-type: disc;
        }

        .terms-list li {
          margin-bottom: 8px;
          padding-left: 4px;
        }

        .terms-link {
          color: var(--cyan);
          text-decoration: underline;
          text-underline-offset: 3px;
          transition: opacity 0.15s ease;
        }

        .terms-link:hover {
          opacity: 0.82;
        }

        .terms-anchor-btn {
          background: none;
          border: none;
          padding: 0;
          color: var(--cyan);
          font: inherit;
          text-decoration: underline;
          text-underline-offset: 3px;
          cursor: pointer;
          font-weight: 600;
          display: inline;
        }

        .terms-anchor-btn:hover {
          opacity: 0.82;
        }

        .terms-contact-card {
          background: var(--s1);
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 22px;
          margin-top: 18px;
        }

        /* Sidebar Table of Contents */
        .terms-sidebar {
          position: sticky;
          top: 88px;
        }

        .terms-toc-card {
          background: var(--s1);
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 18px 16px;
          max-height: calc(100vh - 120px);
          overflow-y: auto;
        }

        .terms-toc-heading {
          font-family: var(--ff-m);
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--tx-3);
          margin-bottom: 12px;
          padding: 0 6px;
        }

        .terms-toc-nav {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .terms-toc-link {
          display: flex;
          align-items: center;
          gap: 9px;
          width: 100%;
          text-align: left;
          background: none;
          border: none;
          padding: 6px 8px;
          border-radius: 8px;
          color: var(--tx-2);
          font-family: var(--ff-b);
          font-size: 13px;
          line-height: 1.35;
          cursor: pointer;
          transition: background 0.12s ease, color 0.12s ease;
        }

        .terms-toc-link:hover {
          background: var(--s2);
          color: var(--tx);
        }

        .terms-toc-num {
          font-family: var(--ff-m);
          font-size: 11px;
          color: var(--cyan);
          min-width: 16px;
        }

        .terms-toc-title {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        @media (max-width: 980px) {
          .terms-layout {
            grid-template-columns: 1fr;
          }
          .terms-sidebar {
            display: none;
          }
        }

        @media (max-width: 640px) {
          .terms-header {
            padding: 40px 0 28px;
          }
          .terms-content {
            font-size: 14.5px;
            line-height: 1.7;
          }
          .terms-section-title {
            font-size: 19px;
          }
          .terms-subclause {
            margin-left: 10px;
            padding-left: 10px;
          }
        }
      `}</style>
    </main>
  );
}
