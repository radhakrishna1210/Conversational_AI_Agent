

import { useState } from "react";
import { motion } from "framer-motion";
import {
    Building2,
    Calendar,
    Phone,
    Bell,
    ChevronRight,
    ChevronDown,
    Shield,
    Database,
    Users,
    FileText,
} from "lucide-react";

export default function InsuranceVoice() {
    const [openFaq, setOpenFaq] = useState<number | null>(0);

    const faqs = [
        {
            question: "How can Conversational AI Agent help my insurance business?",
            answer: "You can create a voice assistant that answers policyholder questions, processes claims, collects documents, and routes calls to agents - reducing manual workload while improving response time.",
        },
        {
            question: "Can my assistant handle multiple policy types?",
            answer: "Yes. You can configure it to manage auto, health, home, life, or any other policy types. Each assistant can be customized with unique scripts and workflows.",
        },
        {
            question: "Can it process insurance claims?",
            answer: "Yes. The assistant can collect claim details, verify policyholder information, and escalate to adjusters or agents when required.",
        },
        {
            question: "Does it integrate with our CRM or policy management system?",
            answer: "Yes. Conversational AI Agent integrates with tools like Salesforce, HubSpot, and Zoho, syncing every interaction automatically.",
        },
        {
            question: "How quickly can we set it up?",
            answer: "Setup takes about 20 seconds. You define your policy types, claims process, and CRM connections.",
        },
        {
            question: "Can it remind customers about renewals or payments?",
            answer: "Yes. You can enable automated renewal reminders, premium payment follow-ups, and personalized retention messages.",
        },
    ];

    return (
  <div className="min-h-screen bg-white text-black dark:bg-black dark:text-white px-6 py-16 relative transition-colors duration-300">
    {/* HERO SECTION */}
    <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-12 items-start">
      {/* Left Side */}
      <motion.div
        initial={{ opacity: 0, x: -50 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.8 }}
      >
        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-cyan-500/10 border border-cyan-500/30 rounded-full text-xs md:text-sm text-cyan-400 mb-6">
          <Building2 className="w-4 h-4" />
          Insurance Voice AI Solutions
        </div>

        <h1 className="text-3xl md:text-4xl font-bold leading-tight mb-6">
          Revolutionize <span className="text-teal-400">Insurance</span>
          <br />
          with Voice AI
        </h1>

        <p className="text-sm md:text-base text-gray-700 dark:text-gray-300 mb-8 max-w-lg">
          Streamline policy management, accelerate claims processing, and enhance customer experience with AI-powered insurance solutions that work around the clock.
        </p>

        <div className="space-y-5">
          {[
            "Policy Management - Handle policy inquiries, renewals, and coverage questions",
            "Claims Processing - Streamline claims submission and status updates",
            "Risk Assessment - Evaluate risks and provide coverage recommendations",
          ].map((text, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 + i * 0.1 }}
              className="flex gap-4 group"
            >
              <div className="w-1 h-5 bg-teal-400 mt-1.5 rounded-full group-hover:h-6 transition-all duration-300" />
              <div className="text-sm md:text-base text-gray-700 dark:text-gray-300 leading-relaxed">
                {text}
              </div>
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
        <div className="bg-white dark:bg-[#071212] border border-gray-200 dark:border-teal-700 rounded-3xl p-7 shadow-2xl transition-colors duration-300">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-2xl">✨</span>
            <h2 className="text-xl md:text-2xl font-bold">
              Create your Free Voice AI Assistant
            </h2>
          </div>

          <textarea
            rows={5}
            className="w-full bg-white text-black dark:bg-black dark:text-white border border-gray-300 dark:border-gray-700 rounded-2xl p-4 text-sm placeholder:text-gray-500 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all resize-none"
            placeholder="Example: Create a professional insurance assistant that handles policy inquiries, processes claims, sends renewal reminders, and provides coverage information to customers..."
          />

          <div className="mt-7">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Quick Start Templates:
            </p>

            <div className="grid grid-cols-2 gap-3">
              <TemplateButton icon={<Phone className="w-5 h-5" />} label="24/7 Support Agent" />
              <TemplateButton icon={<Shield className="w-5 h-5" />} label="Policy Renewal Agent" />
              <TemplateButton icon={<FileText className="w-5 h-5" />} label="Claims Intake Agent" />
              <TemplateButton icon={<Bell className="w-5 h-5" />} label="Renewal Reminder Agent" />
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

    {/* FEATURES SECTION */}
    <div className="max-w-7xl mx-auto mt-24">
      <div className="text-center mb-12">
        <h2 className="text-4xl font-bold mb-3">Insurance Voice Solution</h2>
        <p className="text-gray-600 dark:text-gray-400 text-lg">
          Handle policy renewals, claims intake, and customer support
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <FeatureCard
          icon={<Phone className="w-6 h-6" />}
          title="24/7 Customer Support"
          description="Handle policy questions and claims anytime. Your customers get instant help, day or night."
          tags={["Always available", "Policy lookups", "Claims guidance", "Instant answers"]}
        />

        <FeatureCard
          icon={<Shield className="w-6 h-6" />}
          title="Policy Renewals"
          description="Automatically remind customers about upcoming renewals and collect updated information."
          tags={["Renewal reminders", "Update collection", "Payment processing", "Easy renewals"]}
        />

        <FeatureCard
          icon={<FileText className="w-6 h-6" />}
          title="Claims Intake"
          description="Guide customers through claims step-by-step and collect all necessary information upfront."
          tags={["Guided process", "Document collection", "Status updates", "Fast routing"]}
        />

        <FeatureCard
          icon={<FileText className="w-6 h-6" />}
          title="Policy Information"
          description="Instantly answer questions about coverage, premiums, deductibles, and policy details."
          tags={["Coverage details", "Premium quotes", "Policy lookups", "Plan comparison"]}
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
        Frequently Asked <span className="text-cyan-400">Questions</span>
      </motion.h2>

      <p className="text-center text-gray-600 dark:text-gray-400 mb-12 text-sm">
        Common questions about the insurance voice solution
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
            <div className="border border-gray-200 dark:border-teal-900/30 rounded-2xl overflow-hidden bg-white dark:bg-[#071212] hover:border-teal-700 transition-colors duration-300">
              <button
                onClick={() => setOpenFaq(openFaq === index ? null : index)}
                className="w-full p-5 md:p-6 flex justify-between items-center text-left hover:bg-gray-100 dark:hover:bg-teal-950/30 transition-all"
              >
                <span className="text-base md:text-lg font-semibold">
                  {faq.question}
                </span>

                <ChevronDown
                  className={`text-cyan-400 transition-transform duration-300 ${
                    openFaq === index ? "rotate-180" : ""
                  }`}
                />
              </button>

              <motion.div
                initial={false}
                animate={{
                  height: openFaq === index ? "auto" : 0,
                  opacity: openFaq === index ? 1 : 0,
                }}
                transition={{ duration: 0.4 }}
                className="overflow-hidden"
              >
                <div className="px-6 pb-6 text-gray-700 dark:text-gray-400 text-sm">
                  {faq.answer}
                </div>
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
      className="fixed bottom-8 right-8 z-50 bg-white dark:bg-[#0a1f1f] border border-cyan-500/70 hover:border-cyan-400 text-cyan-400 px-6 py-3 rounded-full flex items-center gap-2 text-sm font-medium shadow-2xl shadow-black/20 dark:shadow-black/80 transition-all"
    >
      <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
      Ask Kevin
    </motion.button>
  </div>
);
}
function TemplateButton({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.04 }}
      className="border border-gray-300 dark:border-teal-700 hover:border-teal-500 bg-white dark:bg-black/70 rounded-2xl p-4 text-left transition-all duration-300 flex items-center gap-3 group text-sm"
    >
      <div className="text-teal-400 group-hover:text-cyan-400 transition-colors">
        {icon}
      </div>
      <span className="font-medium leading-tight text-black dark:text-white">
        {label}
      </span>
    </motion.button>
  );
}

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
      className="border border-gray-200 dark:border-teal-900/30 rounded-3xl p-7 bg-white dark:bg-[#071212] transition-all duration-300 group h-full flex flex-col"
    >
      <div className="mb-5 text-cyan-400">{icon}</div>

      <h3 className="text-xl font-bold mb-3 text-black dark:text-white">
        {title}
      </h3>

      <p className="text-sm text-gray-700 dark:text-gray-400 mb-6 flex-1">
        {description}
      </p>

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