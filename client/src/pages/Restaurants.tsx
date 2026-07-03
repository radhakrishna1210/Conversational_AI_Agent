import { useState } from "react";
import { motion } from "framer-motion";
import {
  UtensilsCrossed,
  Clock3,
  MapPin,
  Star,
  Users,
  Calendar,
  Package,
  Sparkles,
  ChevronRight,
  ChevronDown,
} from "lucide-react";

export default function RealEstate() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

const faqs = [
  {
    question: "How can OmniDimension help restaurants manage calls and orders?",
    answer:
      "You can create a voice assistant that answers calls, takes orders, handles reservations, and routes updates directly to your POS or kitchen system - all without staff intervention.",
  },
  {
    question: "Does it integrate with our POS system?",
    answer:
      "Yes. OmniDimension connects with major restaurant POS systems like Square, Clover, and Toast. Orders placed through your assistant are instantly sent to your kitchen display or printer.",
  },
  {
    question: "Can my assistant handle allergies and special requests?",
    answer:
      "Yes. You can configure it to recognize and respond to dietary restrictions, allergies, and cooking preferences, ensuring accurate communication with your kitchen.",
  },
  {
    question: "What happens during peak hours?",
    answer:
      "Your assistant can handle multiple simultaneous calls, confirm orders instantly, and reduce wait times - letting your staff focus on in-person service and fulfillment.",
  },
  {
    question: "How quickly can we set it up?",
    answer:
      "Setup takes less than 20 seconds. You create your assistant, upload your menu, define delivery zones and policies, test a few sample orders, and go live - no coding required.",
  },
  {
    question: "Can it manage reservations or delivery inquiries?",
    answer:
      "Yes. You can enable features for table reservations, delivery updates, or pickup scheduling, and the assistant automatically syncs all details with your POS or CRM.",
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
           <UtensilsCrossed className="w-4 h-4" />
              Restaurant Voice AI Solutions
          </div>

          <h1 className="text-3xl md:text-4xl font-bold leading-tight mb-6">
            Never Miss an  <span className="text-teal-400">Order Again </span>
            <br />
             with Voice AI
          </h1>

          <p className="text-sm md:text-base text-gray-300 mb-8 max-w-lg">
         Automate order taking, reservations, and customer service with voice AI. Handle peak hours effortlessly while increasing average order value.
          </p>

          <div className="space-y-5">
            {[
  "Take More Orders - Never busy signal, handle peak hours effortlessly",
  "Zero Errors - Perfect orders with accurate upselling and modifications",
  "Increase Revenue - Smart upselling suggestions and higher average order value",
  "24/7 Service - Handle reservations and inquiries around the clock",
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
              placeholder="Example: Create a friendly restaurant assistant that handles phone orders, takes reservations, answers menu questions, and coordinates deliveries while maintaining an enthusiastic, welcoming tone..."
            />

            <div className="mt-7">
              <p className="text-xs text-gray-400 mb-3">Quick Start Templates:</p>
              <div className="grid grid-cols-2 gap-3">
               <TemplateButton
  icon={<Calendar className="w-5 h-5" />}
  label="Appointment Booking Agent"
/>

<TemplateButton
  icon={<Calendar className="w-5 h-5" />}
  label="Table Reservation Agent"
/>

<TemplateButton
  icon={<Package className="w-5 h-5" />}
  label="Takeout Order Handler"
/>

<TemplateButton
  icon={<Users className="w-5 h-5" />}
  label="Catering Inquiry Assistant"
/>

<TemplateButton
  icon={<Sparkles className="w-5 h-5" />}
  label="Special Event Promotions"
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
          <h2 className="text-4xl font-bold mb-3">   Restaurant Voice Solution</h2>
          <p className="text-gray-400 text-lg">
             Handle orders, reservations, and customer inquiries
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Card 1 */}
        <FeatureCard
  icon={<UtensilsCrossed />}
  title="Smart Order Taking"
  description="Handle phone orders with natural conversation, order confirmation, and special requests."
  tags={[
    "Natural conversation",
    "Order confirmation",
    "Special requests",
    "Allergy handling",
  ]}
/>

          {/* Card 2 */}
       <FeatureCard
  icon={<Clock3 />}
  title="Reservation Management"
  description="Manage table reservations, check availability in real-time, and handle waitlists."
  tags={[
    "Real-time availability",
    "Guest preferences",
    "Waitlist management",
    "Confirmations",
  ]}
/>

          {/* Card 3 */}
       <FeatureCard
  icon={<MapPin />}
  title="Delivery Coordination"
  description="Coordinate delivery orders and provide status updates throughout the process."
  tags={[
    "Order tracking",
    "Status updates",
    "Address verification",
    "Delivery timing",
  ]}
/>

          {/* Card 4 */}
        <FeatureCard
  icon={<Star />}
  title="Menu Information"
  description="Answer menu related questions."
  tags={[
    "Allergy information",
    "Dish recommendations",
    "Dietary restrictions",
    "Daily specials",
  ]}
/>

<FeatureCard
  icon={<Users />}
  title="Customer Service"
  description="Handle customer inquiries, complaints, and feedback professionally."
  tags={[
    "Complaint resolution",
    "Feedback collection",
    "Order modifications",
    "General support",
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
          Common questions about the restaurant voice solution
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