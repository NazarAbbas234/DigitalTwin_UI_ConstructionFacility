# Smart Construction Facility Digital Twin - 3D Web Viewer 🏠📡

A responsive, full-stack Digital Twin frontend application built using **React** and **TypeScript**. This platform integrates with the **Bentley iTwin platform** to visualize real-time IoT telemetry data mapped directly onto a 3D structural model of a residential asset.

## 🚀 Live Demonstration
Due to enterprise-grade authentication structures tied to the Bentley developer ecosystem, accessing the live deployment requires registered organizational credentials. 

To view the end-to-end telemetry pipeline, interactive mapping, and 3D viewport control in action, please check out the video walkthrough linked below:
👉 **[https://www.loom.com/share/ebed98f424264821a05297088fd80192]**

---

## 🛠️ Architecture & Tech Stack
* **Frontend Framework:** React (Functional Components & Hooks)
* **Language:** TypeScript (Strictly typed interfaces for IoT payloads)
* **3D Engine:** Bentley iTwin.js SDK / WebGL Canvas Viewport
* **Hosting Platform:** Vercel (Continuous Integration / Continuous Deployment pipeline)

---

## ⚙️ Core Engineering Highlights

### 1. Dynamic 3D Element Mapping
Engineered custom frontend logic that parses incoming relational database IDs from the REST API and matches them to unique physical 3D element handles inside the iTwin spatial viewport. Clicking an asset highlights the element and surfaces localized telemetry analytics.

### 2. Decoupled Cross-Origin Streaming
The application functions as an autonomous client completely decoupled from the data layer. It securely handles data communication across separate cloud environments using strict middleware token verification and optimized browser fetch states.

---

## 🛠️ Local Development Setup

1. Clone the repository:
2  Install dependencies:
3  Configure the Environment:
     Review the environment flags inside src/api/DeviceStatusAPI.ts to ensure it targets your local environment or active production backend:
4  Run the local development server:
