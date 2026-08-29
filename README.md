# 🚩 VariMitra (वारकरी मित्र)

> **Offline-First Peer-to-Peer Mesh Network & Disaster-Management PWA for Pandharpur Wari**

[![React](https://img.shields.io/badge/React-19.0-61DAFB?style=for-the-badge&logo=react)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6.0-646CFF?style=for-the-badge&logo=vite)](https://vitejs.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![PWA](https://img.shields.io/badge/PWA-Offline--First-5A0FC8?style=for-the-badge&logo=pwa)](https://web.dev/progressive-web-apps/)
[![Supabase](https://img.shields.io/badge/Supabase-Database%20%26%20Realtime-3FCF8E?style=for-the-badge&logo=supabase)](https://supabase.com/)
[![Flutter](https://img.shields.io/badge/Flutter-Android%20APK-02569B?style=for-the-badge&logo=flutter)](https://flutter.dev/)

---

## 📌 Overview

During the annual **Pandharpur Ashadhi Wari**, over **3 million pilgrims (Varkaris)** walk more than **250+ kilometers** from Dehu and Alandi to Pandharpur. Due to extreme crowd density, cellular tower networks choke, fail, or become complete dead zones.

**VariMitra (वारकरी मित्र)** is an offline-first disaster-management Progressive Web Application (PWA) and native Android app designed to protect pilgrims during emergency situations:
- **Offline P2P Mesh Network**: Turns smartphones into a multi-hop relay network that passes SOS emergency signals, chat messages, and resource requests phone-to-phone until reaching a connected gateway device.
- **ML Spatial Centroid Matching Engine**: Intelligently predicts optimal meeting locations between pilgrims offering and requesting critical supplies (`Water`, `Medicine`, `First Aid`, `Torch`, `Food`).
- **Live Crowd Density & Traffic Tracking**: Monitored route checkpoints (`Dehu`, `Pune Halt`, `Saswad`, `Lonand`, `Mukkam - Wakhri`, `Pandharpur`).
- **High-Contrast Direct Sunlight Solar Theme**: Optimized for extreme outdoor visibility under harsh sunlight.
- **Bilingual Accessibility**: Instant 1-tap **English** / **मराठी (Marathi)** interface switching.

---

## ✨ Key Features

### 1. 🤝 P2P Resource Exchange & ML Spatial Engine
- **Broadcasting Feed**: Real-time peer-to-peer item request feed for critical items (`Water`, `Food`, `Torch`, `Medicine`, `Blanket`, `First Aid`).
- **Spatial Centroid Algorithm**: Calculates exact geographic midpoints $(midLat, midLng)$ using spherical **Haversine Great-Circle distance metrics**:
  \[
  d = 2R \arcsin\left( \sqrt{\sin^2\left(\frac{\Delta \phi}{2}\right) + \cos(\phi_A)\cos(\phi_B)\sin^2\left(\frac{\Delta \lambda}{2}\right)} \right)
  \]
- **Optimal Meeting Spot Selection**:
  - **Station Node Selection**: Picks nearest official route station if within threshold distance ($< 2.5\text{ km}$).
  - **Dynamic Trail Checkpoint**: Computes continuous spatial trail checkpoints when pilgrims are in open terrain.
- **Smart Handshake Pass**: Renders walking distance estimates (`~350m`) for both pilgrims and features a 1-tap **`🗺️ Show Meeting Spot on Map`** button that focuses Leaflet map view directly onto the meeting marker.

### 2. 🚨 Multi-Hop Mesh SOS Emergency Network
- **High-Contrast Emergency Launcher**: Fixed high-priority SOS trigger for instant emergency dispatch.
- **Category-Based SOS Alerts**: `Medical Emergency`, `Lost Pilgrim`, `Accident`, `Stampede / Crowd Risk`, `Water & Food Supply`, `General`.
- **Relay Path & Loop Elimination**: Tracks hop count (`Hops: 3`), relay node history (`Phone A → Phone B → Gateway`), and packet IDs to eliminate looping transmissions.

### 3. 🗺️ Offline Leaflet Map & Service Worker Caching
- Pre-caches OpenStreetMap map tiles via custom Workbox service worker (`sw.ts`) for continuous offline navigation.
- Plots live route stations, crowd density badges, traffic status indicators, and group member locations.

### 4. 🔎 Lost & Found Group Check-Ins
- **Group Code Coordination**: Pilgrims generate or join unique 8-character group codes (e.g. `WARI-6F65BFAB`).
- **Member Location Radar**: Private live location sharing exclusively visible to members of the same group.

### 5. ☀️ Direct Sunlight Solar Theme & Bilingual Support
- **Outdoor High-Contrast Mode**: Built-in solar contrast toggle for direct sunlight readability.
- **Bilingual Interface**: Seamless 1-tap language switcher for English and Marathi.

---

## 🛠️ Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Core Frontend** | React 19, TypeScript, Vite 6 |
| **Styling & Design** | Tailwind CSS v4, Custom Glassmorphism, Solar Theme Tokens |
| **Mapping & GIS** | Leaflet.js, OpenStreetMap, Spatial Haversine Geometry |
| **Offline Storage** | IndexedDB (`idb`), Service Worker (`vite-plugin-pwa`, Workbox) |
| **Backend & Realtime** | Supabase Postgres, Realtime WebSockets, Row-Level Security (RLS) |
| **Native Mobile** | Flutter 3.8, Android WebView Wrapper, Gradle |

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: `v18+`
- **npm**: `v9+`
- **Flutter SDK**: `v3.8+` *(Optional: only needed for native Android APK builds)*

### 1. Installation
```bash
git clone https://github.com/Vishwesh-Bhilare/for-vari.git
cd for-vari
npm install
```

### 2. Run Web Development Server
```bash
npm run dev
```
Open **[http://localhost:5173/](http://localhost:5173/)** in your browser.

To run dual instances for multi-device testing:
```bash
npx vite --port 5174
```

### 3. Build Production Web Bundle
```bash
npm run build
```

---

## 📱 Native Android APK Build

The repository includes a Flutter native WebView wrapper for standalone Android deployment.

### Build Debug APK
```bash
flutter build apk --debug
```
Output location: [`build/app/outputs/flutter-apk/app-debug.apk`](file:///Users/anuragpatil/for-vari/build/app/outputs/flutter-apk/app-debug.apk)

### Build Release APK
```bash
flutter build apk --release
```

---

## 🔒 Supabase & Database Schema Setup

1. **Anonymous Sign-In**: Enable **Anonymous Sign-ins** under Supabase Auth → Providers. This allows pilgrims to submit crowd reports, item requests, and SOS alerts anonymously without mandatory initial authentication.
2. **Database Migration**: Run `supabase/schema.sql` and `supabase/seed.sql` in the Supabase SQL Editor.
3. **Bootstrap Admin Account**: Run the following query in Supabase SQL editor:
   ```sql
   UPDATE profiles SET role = 'admin', approved = true WHERE id = '<YOUR_USER_AUTH_ID>';
   ```

---

## 📄 License

Distributed under the MIT License. See [`LICENSE`](file:///Users/anuragpatil/for-vari/LICENSE) for more details.

---

<p center>
  🚩 <b>पंढरपूर आषाढी वारी सोहळा — वारकरी मित्रासोबत सुरक्षित प्रवास</b> 🚩
</p>
