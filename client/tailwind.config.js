/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Space Grotesk', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        /*
          Spandan "Resonance" scales. These read straight from the CSS custom
          properties in styles.css rather than repeating the hex here, so light
          mode keeps working: html.light redefines the variables and every
          utility built on them re-resolves with no `dark:` variant needed.

          Declared as `var(--x)` not `hsl(var(--x))` because these tokens are
          hex, unlike the shadcn triples below them.
        */
        surface: {
          1: "var(--s1)",
          2: "var(--s2)",
          3: "var(--s3)",
        },
        line: {
          DEFAULT: "var(--line)",
          2: "var(--line-2)",
        },
        ink: {
          DEFAULT: "var(--tx)",
          2: "var(--tx-2)",
          3: "var(--tx-3)",
        },
        /*
          The voice spectrum: one accent per conversation state. Namespaced
          under `voice-` deliberately — the design system calls these cyan,
          violet and lime, but three of those names are Tailwind's own default
          palettes and 29 existing usages of `text-cyan-400` and friends would
          have silently stopped resolving if we shadowed them with flat values.

          src/lib/voiceStates.ts is the single source of truth for which colour
          means what; these utilities exist so JSX can reach them directly.
        */
        voice: {
          idle:          "var(--tx-3)",
          listening:     "var(--cyan)",
          understanding: "#5cd6c6",
          thinking:      "var(--violet)",
          speaking:      "var(--coral)",
          acting:        "var(--lime)",
        },
        coral: "var(--coral)",
        warn: "var(--warn)",
        err: "var(--err)",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
        "float": { "0%, 100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-10px)" } },
        "pulse-glow": { "0%, 100%": { opacity: "0.4" }, "50%": { opacity: "1" } },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "float": "float 6s ease-in-out infinite",
        "pulse-glow": "pulse-glow 3s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
