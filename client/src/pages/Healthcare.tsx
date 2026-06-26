import { useState } from "react";
import { motion } from "framer-motion";
import {
  Stethoscope,
  Calendar,
  Phone,
  Shield,
  Activity,
  RefreshCcw,
  FileSearch,
  Heart,
  Bell,
  ChevronRight,
  ChevronDown,
  ClipboardCheck,
  MessageSquare,
} from "lucide-react";

export default function RealEstate() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

 const faqs = [
  {
    question: "How can OmniDimension help with appointment scheduling?",
    answer:
      "You can create a voice assistant that answers patient calls 24/7, checks your calendar in real time, suggests available time slots, and books appointments instantly - no staff needed.",
  },
  {
    question: "Can patients reschedule or cancel appointments?",
    answer:
      "Yes. You can enable rescheduling and cancellation options so patients can update their appointments anytime. The assistant syncs changes automatically and sends confirmations to both sides.",
  },
  {
    question: "Can it handle multiple doctors or clinic locations?",
    answer:
      "Yes. You can configure your assistant to manage calendars for multiple providers, departments, or branches - ensuring patients are booked with the right doctor at the right location.",
  },
  {
    question: "Does it send appointment reminders?",
    answer:
      "Yes. The assistant can send reminders through SMS, email, or automated calls at intervals you set - helping reduce no-shows and improving schedule adherence.",
  },
  {
    question: "Can it integrate with our existing calendar or EMR system?",
    answer:
      "Yes. OmniDimension connects with tools like Google Calendar, Outlook, and popular EMR systems so scheduling, updates, and patient records stay perfectly synced.",
  },
];

  return (
    <div className="min-h-screen bg-black text-white px-6 py-16 relative">
      {/* HERO SECTION */}
      <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-12 items-start">
        {/* Left Side */}
        <motion.div
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8 }}
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-cyan-500/10 border border-cyan-500/30 rounded-full text-xs md:text-sm text-cyan-400 mb-6">
            <Stethoscope  className="w-4 h-4" />
              Healthcare Voice AI Solutions
          </div>

          <h1 className="text-3xl md:text-4xl font-bold leading-tight mb-6">
            Transform  <span className="text-teal-400">Healthcare</span>
            <br />
             with Voice AI
          </h1>

          <p className="text-sm md:text-base text-gray-300 mb-8 max-w-lg">
            Never miss an appointment call again. AI-powered voice assistant that
  schedules, reschedules, and sends reminders 24/7 while maintaining
  HIPAA compliance.
          </p>

          <div className="space-y-5">
            {[
  "Appointment Scheduling – Schedule, reschedule, and manage appointments automatically with calendar integration",

  "Automated Reminders – Send appointment reminders via SMS, email, or voice to reduce no-shows",

  "HIPAA Compliance – Enterprise-grade security ensures patient data protection",

  "24/7 Availability – Answer calls and book appointments even after hours",
].map((text, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + i * 0.1 }}
                className="flex gap-4 group"
              >
                <div className="w-1 h-5 bg-teal-400 mt-1.5 rounded-full group-hover:h-6 transition-all duration-300" />
                <div className="text-sm md:text-base text-gray-300 leading-relaxed">{text}</div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Right Side */}
        <motion.div
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8 }}
          className="relative"
        >
          <div className="bg-[#071212] border border-teal-700 rounded-3xl p-7 shadow-2xl">
            <div className="flex items-center gap-3 mb-6">
              <span className="text-2xl">✨</span>
              <h2 className="text-xl md:text-2xl font-bold">Create your Free Voice AI Assistant</h2>
            </div>

            <textarea
              rows={5}
              className="w-full bg-black border border-gray-700 rounded-2xl p-4 text-sm text-gray-300 placeholder:text-gray-500 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all resize-none"
              placeholder="Example: Create a compassionate healthcare assistant that schedules patient appointments, sends medication reminders, and provides basic health information while maintaining HIPAA compliance..."
            />

            <div className="mt-7">
              <p className="text-xs text-gray-400 mb-3">Quick Start Templates:</p>
              <div className="grid grid-cols-2 gap-3">
               <TemplateButton
  icon={<Calendar className="w-5 h-5" />}
  label="Appointment Booking Agent"
/>

<TemplateButton
  icon={<RefreshCcw className="w-5 h-5" />}
  label="Prescription Refill Handler"
/>

<TemplateButton
  icon={<FileSearch className="w-5 h-5" />}
  label="Test Results Inquiry"
/>

<TemplateButton
  icon={<Shield className="w-5 h-5" />}
  label="Insurance Verification"
/>

<TemplateButton
  icon={<Bell className="w-5 h-5" />}
  label="Appointment Reminder Calls"
/>

<TemplateButton
  icon={<Heart className="w-5 h-5" />}
  label="Follow-Up Care Calls"
/>

<TemplateButton
  icon={<ClipboardCheck className="w-5 h-5" />}
  label="Preventive Care Reminders"
/>

<TemplateButton
  icon={<MessageSquare className="w-5 h-5" />}
  label="Patient Satisfaction Survey"
/>
              </div>
            </div>

            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="w-full mt-8 bg-teal-500 hover:bg-teal-400 text-black font-semibold py-3.5 rounded-2xl text-base flex items-center justify-center gap-2 shadow-lg shadow-teal-500/30 transition-all"
            >
               Create My Agent
              <ChevronRight className="w-5 h-5" />
            </motion.button>
          </div>
        </motion.div>
      </div>

      {/* FEATURES SECTION - MATCHING NEW SCREENSHOT */}
      <div className="max-w-7xl mx-auto mt-24">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold mb-3">  Healthcare Voice Solution</h2>
          <p className="text-gray-400 text-lg">
             Schedule appointments, handle prescription refills, and patient support
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Card 1 */}
         <FeatureCard
  icon={<Calendar className="w-6 h-6" />}
  title="Easy Appointment Booking"
  description="Patients can book, reschedule, or cancel appointments by phone anytime, automatically."
  tags={[
    "Real-time availability",
    "Self-service booking",
    "Calendar sync",
    "Instant confirmation",
  ]}
/>

          {/* Card 2 */}
         <FeatureCard
  icon={<Phone className="w-6 h-6" />}
  title="Automatic Reminders"
  description="Reduce no-shows with automatic appointment reminders sent before each visit."
  tags={[
    "Call reminders",
    "Text reminders",
    "Customizable timing",
    "Reduces no-shows",
  ]}
/>

          {/* Card 3 */}
         <FeatureCard
  icon={<Shield className="w-6 h-6" />}
  title="HIPAA Secure"
  description="All patient conversations are encrypted and compliant with healthcare privacy laws."
  tags={[
    "Encrypted calls",
    "Audit trails",
    "Access controls",
    "Compliance ready",
  ]}
/>

          {/* Card 4 */}
          <FeatureCard
  icon={<Activity className="w-6 h-6" />}
  title="Patient Support"
  description="Answer common questions, prescription refills, and follow-up scheduling automatically."
  tags={[
    "Common questions",
    "Prescription refills",
    "Follow-up calls",
    "24/7 support",
  ]}
/>
        </div>
      </div>

      {/* FAQ SECTION */}
      <div className="max-w-5xl mx-auto mt-24">
        <motion.h2
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          className="text-3xl md:text-4xl font-bold text-center mb-4"
        >
          Frequently Asked{" "}
          <span className="text-cyan-400">Questions</span>
        </motion.h2>

        <p className="text-center text-gray-400 mb-12 text-sm">
           Common questions about healthcare voice AI
        </p>

        <div className="space-y-6">
          {faqs.map((faq, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.05 }}
            >
              <div className="border border-teal-900/30 rounded-2xl overflow-hidden bg-black hover:border-teal-700 transition-colors duration-300">
                <button
                  onClick={() => setOpenFaq(openFaq === index ? null : index)}
                  className="w-full p-5 md:p-6 flex justify-between items-center text-left hover:bg-teal-950/30 transition-all"
                >
                  <span className="text-base md:text-lg font-semibold">{faq.question}</span>
                  <ChevronDown className={`text-cyan-400 transition-transform duration-300 ${openFaq === index ? "rotate-180" : ""}`} />
                </button>

                <motion.div
                  initial={false}
                  animate={{ height: openFaq === index ? "auto" : 0, opacity: openFaq === index ? 1 : 0 }}
                  transition={{ duration: 0.4 }}
                  className="overflow-hidden"
                >
                  <div className="px-6 pb-6 text-gray-400 text-sm">{faq.answer}</div>
                </motion.div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* FIXED ASK KEVIN BUTTON */}
      <motion.button
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={{ scale: 1.08 }}
        className="fixed bottom-8 right-8 z-50 bg-[#0a1f1f] border border-cyan-500/70 hover:border-cyan-400 text-cyan-400 px-6 py-3 rounded-full flex items-center gap-2 text-sm font-medium shadow-2xl shadow-black/80 transition-all"
      >
        <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
        Ask Kevin
      </motion.button>
    </div>
  );
}

/* Template Button */
function TemplateButton({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <motion.button
      whileHover={{ scale: 1.04, borderColor: "#14b8a6", color: "#67e8f9" }}
      className="border border-teal-700 hover:border-teal-500 bg-black/70 hover:bg-black rounded-2xl p-4 text-left transition-all duration-300 flex items-center gap-3 group text-sm"
    >
      <div className="text-teal-400 group-hover:text-cyan-400 transition-colors">{icon}</div>
      <span className="font-medium leading-tight">{label}</span>
    </motion.button>
  );
}

/* Updated FeatureCard - Icon stays fixed */
function FeatureCard({
  icon,
  title,
  description,
  tags,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  tags: string[];
}) {
  return (
    <motion.div
      whileHover={{
        y: -6,
        borderColor: "#14b8a6",
        boxShadow: "0 0 35px rgba(20, 184, 166, 0.25)",
      }}
      className="border border-teal-900/30 rounded-3xl p-7 bg-[#071212] transition-all duration-300 group h-full flex flex-col"
    >
      <div className="mb-5 text-cyan-400 transition-transform duration-300">
        {icon}
      </div>

      <h3 className="text-xl font-bold mb-3">{title}</h3>
      <p className="text-sm text-gray-400 mb-6 flex-1">{description}</p>

      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="px-3 py-1 text-xs rounded-full border border-cyan-900 text-cyan-400 hover:bg-cyan-950 hover:border-cyan-500 transition-all"
          >
            {tag}
          </span>
        ))}
      </div>
    </motion.div>
  );
}