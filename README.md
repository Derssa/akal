# TOROLLO — Backend Systems Lab

> **A local-first educational platform for backend engineering and system design, inspired by Packet Tracer.**

TOROLLO is designed to help students visually learn backend architecture, Docker, microservices, databases, message brokers, scaling, failures, and distributed systems through an interactive, graph-based visual canvas.

---

## 🚀 Core Philosophy

### 1. Local-First & Docker-Powered
Everything runs locally on the student's machine. 
- The application directly controls and orchestrates Docker containers on the host machine.
- **No Cloud integrations** (No AWS, Azure, or GCP).
- **No remote infrastructure** is created or managed. 
- All nodes in the workspace correspond to actual, live-running Docker containers on the user's system.

### 2. Interactive Learning
Instead of reading passive, theory-heavy documentation, students learn by *doing*:
- **Create Systems:** Drag and drop real components to build architectures.
- **Run & Connect:** Turn services on/off, connect them together, and see how they interact.
- **Observe Traffic:** Send requests and watch mock traffic flow through the system.
- **Simulate Failures:** Take down database replicas, overload load balancers, kill message brokers, and observe how the system recovers (or fails).
  - Practical Learning Cards: Each infrastructure node is paired with a short, beginner-friendly learning card focusing on practical understanding.

---

## ⚡ Quick Start

Run the lab instantly from your terminal without needing to install anything permanently:

```bash
npx torollo start
```
*(Ensure Docker Desktop is running before starting)*

---

## 🎨 Core Vision & The Canvas

When a user opens TOROLLO, they are presented with an interactive visual canvas where they can design, run, and experiment with backend systems.

### Supported Infrastructure Nodes
You can drag and drop a wide range of infrastructure components:
*   **Operating Systems:** Ubuntu Server
*   **Databases:** PostgreSQL, Redis
*   **Message Brokers:** RabbitMQ, Kafka
*   **Web Servers & Proxies:** Nginx, Load Balancer
*   **Application Services:** API Service, Microservices Host, Serverless Function
*   **Observability:** Monitoring Components

---

## 🛠️ Getting Started / Architecture Overview

### Backend
The backend controls the local Docker daemon, manages system state, and coordinates container creation, teardown, and terminal streaming.
*   **Technology:** Node.js, Express, TypeScript, Dockerode (Docker API client).

### Frontend
The frontend renders the interactive visual grid, node inspector panels, learning cards, and coordinates node dragging/wiring.
*   **Technology:** React, TypeScript, React Flow (for node orchestration and canvas routing), CSS Modules.

---

*Note: This project is strictly educational. It is not an AWS clone or a production infrastructure management tool—it is a sandboxed simulator designed to make system design tangible, visual, and fun.*
