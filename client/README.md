# OmniDimension React + TypeScript Clone

This project is a pixel-accurate **frontend clone** of [OmniDimension](https://omnidim.io), built with **React, TypeScript, and Vite**. The user asked to migrate the previous HTML/Vanilla JS structural elements into proper `.tsx` files.

## 🚀 Getting Started

To run this project, make sure you have Node.js and npm installed.

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the Vite development server:
   ```bash
   npm run dev
   ```

## 📁 Project Structure

```
client/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── index.html
├── src/
│   ├── main.tsx             # React Entry Point
│   ├── App.tsx              # React Router & Layout Wrapper
│   ├── styles.css           # Global Design System (Dark Theme, Teal Accents)
│   ├── components/
│   │   ├── Navbar.tsx       
│   │   ├── Footer.tsx       
│   │   └── AnnouncementBar.tsx 
│   ├── pages/
│   │   ├── Home.tsx            # Landing Page
│   │   ├── Dashboard.tsx       # AI Agent Builder
│   │   ├── Pricing.tsx         # Pricing Plans
│   │   ├── Documentation.tsx   # SDK Docs
│   │   ├── BookAppointment.tsx # Booking Form
│   │   └── Contact.tsx         # Contact Form
```

## ✨ Features Implemented in React

The previous Vanilla JavaScript logic has been fully ported to React state (`useState`, `useEffect`):

- **React Router Dom:** Client-side routing across all 6 pages.
- **Announcement Bar:** Dismissible with CSS transitions.
- **Accordion FAQ:** Controlled state mapping.
- **Use Case Chips:** Updates state of a connected textarea in the Hero section.
- **Forms:** Simulated loading/success states on submitting endpoints (`Contact.tsx` & `BookAppointment.tsx`).
- **Dashboard Builder State:** Disables buttons and shows success validation UI when creating an agent.
- **Scroll Animations:** `IntersectionObserver` implemented via `useEffect` hooks across pages.
