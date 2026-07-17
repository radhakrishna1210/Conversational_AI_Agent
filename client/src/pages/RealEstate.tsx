import { useState } from "react";
import { motion } from "framer-motion";
import {
  Building2,
  Calendar,
  Phone,
  Bell,
  ChevronRight,
  ChevronDown,
  Users,
  Database,
} from "lucide-react";

export default function RealEstate() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const faqs = [
    {
      question: "How can OmniDimension help with property inquiries?",
      answer:
        "You can create a voice assistant that answers questions about listings, pricing, availability, and nearby amenities — instantly qualifying leads based on budget and preferences.",
    },
    {
      question: "Can my assistant schedule property visits automatically?",
      answer:
        "Yes. You can enable calendar integration so your assistant checks available slots, confirms appointments, and sends reminders to both agents and clients.",
    },
    {
      question: "How does the assistant qualify leads?",
      answer:
        "You define how it asks about budget, location, and timeline. It filters serious buyers automatically and syncs qualified leads directly to your CRM.",
    },
    {
      question: "Can it integrate with our CRM or lead systems?",
      answer:
        "Yes. OmniDimension connects with Salesforce, HubSpot, Zoho CRM, and many other platforms.",
    },
    {
      question: "Can I customize the assistant for different property types?",
      answer:
        "Yes. You can create assistants for residential, commercial, rental, and luxury real estate businesses.",
    },
    {
      question: "Does it support multiple languages for clients?",
      answer:
        "Yes. The assistant supports more than 50 languages and can automatically adapt to customer preferences.",
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
            <Building2 className="w-4 h-4" />
            Real Estate Voice AI Solutions
          </div>

          <h1 className="text-3xl md:text-4xl font-bold leading-tight mb-6">
            Transform Your <span className="text-teal-400">Real Estate</span>
            <br />
            Business with Voice AI
          </h1>

          <p className="text-sm md:text-base text-gray-300 mb-8 max-w-lg">
            Never miss a lead again. Our AI agents handle property inquiries,
            schedule site visits, and qualify buyers 24/7 while you focus on
            closing deals.
          </p>

          <div className="space-y-5">
            {[
              "Property Inquiries – Handle property questions, schedule viewings, and qualify buyers instantly",
              "Site Visit Booking – Automatically schedule property tours and manage availability",
              "Lead Qualification – Pre-qualify buyers based on budget, timeline, and requirements",
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
              placeholder="Example: Create a friendly real estate assistant that handles property inquiries, schedules site visits, and qualifies buyers based on their budget and timeline..."
            />

            <div className="mt-7">
              <p className="text-xs text-gray-400 mb-3">Quick Start Templates:</p>
              <div className="grid grid-cols-2 gap-3">
                <TemplateButton icon={<Building2 className="w-5 h-5" />} label="Property Inquiry Handler" />
                <TemplateButton icon={<Calendar className="w-5 h-5" />} label="Site Visit Booking Agent" />
                <TemplateButton icon={<Phone className="w-5 h-5" />} label="Lead Follow-Up Agent" />
                <TemplateButton icon={<Bell className="w-5 h-5" />} label="Listing Update Calls" />
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
          <h2 className="text-4xl font-bold mb-3">Real Estate Voice Solution</h2>
          <p className="text-gray-400 text-lg">
            Handle inquiries, qualify leads, and schedule property viewings
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Card 1 */}
          <FeatureCard
            icon={<Building2 className="w-6 h-6" />}
            title="Property Information on Demand"
            description="Your assistant answers detailed questions about any listing instantly. Price, square footage, bedrooms, amenities - prospects get answers immediately."
            tags={["Listing details", "Neighborhood info", "Price updates", "Amenity details"]}
          />

          {/* Card 2 */}
          <FeatureCard
            icon={<Calendar className="w-6 h-6" />}
            title="Automatic Scheduling"
            description="Let prospects book property viewings directly. No back-and-forth emails or phone tag."
            tags={["Self-service booking", "Calendar integration", "Automatic reminders", "Easy rescheduling"]}
          />

          {/* Card 3 */}
          <FeatureCard
            icon={<Users className="w-6 h-6" />}
            title="Finds Serious Buyers"
            description="Your assistant asks the right questions to identify qualified buyers before they reach you."
            tags={["Budget matching", "Timeline filtering", "Need assessment"]}
          />

          {/* Card 4 */}
          <FeatureCard
            icon={<Database className="w-6 h-6" />}
            title="CRM Integration"
            description="Every call automatically logs to your CRM. No manual data entry required."
            tags={["Automatic logging", "Lead tracking", "Activity history", "Data sync"]}
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
          Common questions about the real estate voice solution
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