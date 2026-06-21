# AKAL — Backend Systems Lab

> **A local-first visual simulator and educational playground for backend engineering and system design, inspired by Packet Tracer.**

AKAL allows students, developers, and system architects to visually design, run, and experiment with real backend architectures. Every component you place on the interactive canvas is backed by an actual, live-running Docker container on your local machine, allowing you to trace traffic, inspect logs, open shell terminals, and simulate failures in real time.

---

## 🚀 Core Architectural Pillars

### 1. Local-First & Docker-Orchestrated
*   **Real Containers:** AKAL communicates directly with your local Docker daemon using `Dockerode`. Nodes on the canvas correspond to actual Docker containers.
*   **Zero-Cloud Footprint:** No AWS/GCP bills, credentials, or remote connections are required. Everything compiles and executes entirely on your host machine.
*   **Host-Level Forwarding:** Automatically configures local bridging, IPTables forwarding, and NAT translation policies on your local environment to enable isolated subnet communication.

### 2. Interactive Visual Canvas
*   **VPC & Subnet Segmentation:** Draw and organize your network topology with public and private subnets, custom CIDR blocks, and Internet Gateways.
*   **Router Tables:** Configure routing rules within subnets to route traffic locally (`local`), outwards via Internet Gateways (`igw`), or through private NAT Gateways (`nat`).
*   **Interactive Terminal Shell:** Stream real-time bash shells into active nodes directly from the web interface.

### 3. Application Load Balancing & Routing
*   **ALB Listener Rules:** Set up Path-Based Routing Rules (e.g. `/api/*`, `/static/*`) using dynamic Nginx proxy routing.
*   **Load Balancing Algorithms:** Switch between `Round Robin` and `Least Connections` to see how traffic distributes across backends.
*   **Path Prefix Stripping:** Automatically rewrites request paths before forwarding to backend targets, enabling seamless service routing to simple backend web servers.

### 4. Auto Scaling & Self-Healing
*   **Launch Templates:** Define a blueprint by choosing any configured Ubuntu node. The ASG commits its filesystem state to a local Docker image and uses it to deploy replicas.
*   **Dynamic Scaling Policies:** Set numeric capacity bounds (`Min`, `Max`, `Desired`). Simulate traffic spikes (up to 1,000 req/sec) to watch the ASG scale out or scale in dynamically based on CPU load.
*   **Self-Healing Health Checks:** Simulate node failures. Degraded or "crashed" replica nodes are automatically caught by the ASG's health monitor and replaced instantly without affecting system availability.
*   **Security Group Inheritance:** Replica instances automatically inherit the security group and firewall rules of the parent template node.

---

## 🎨 Supported Nodes

*   **Operating Systems:** Ubuntu Server (General Purpose Linux node)
*   **Databases:** PostgreSQL, MySQL (Fully active database containers)
*   **Networking:** NAT Gateways, Internet Gateways (IGW), Subnets
*   **Scaling & Delivery:** Application Load Balancers, Auto Scaling Groups

---

## 🛠️ Installation & Local Setup

### Prerequisites
*   [Node.js](https://nodejs.org/) (v20+ recommended)
*   [Docker Desktop](https://www.docker.com/products/docker-desktop/) running and active on your host system.

### 📂 Repository Structure
```text
akal-system-lab/
├── backend/       # Express + Socket.io Server (Docker orchestration & IPTables rules compiler)
├── frontend/      # React + Vite Client (Visual Canvas, React Flow UI, Simulators)
└── README.md
```

### 1. Setup & Start Backend
1. Navigate to the `backend/` directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file (if needed, copying from `.env.example`).
4. Start the server in development mode:
   ```bash
   npm run dev
   ```
   *The backend will boot up, establish a connection to your local Docker socket, and listen on port `5000`.*

### 2. Setup & Start Frontend
1. Navigate to the `frontend/` directory:
   ```bash
   cd ../frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```
   *Open [http://localhost:5173](http://localhost:5173) in your browser to access the AKAL visual playground.*

### 3. Running Tests & Linting
*   **Backend Tests:** Run `npm run test` inside the `/backend` directory.
*   **Frontend & Backend Linting:** Run `npm run lint` in their respective directories.

---

## 🎓 Educational Focus
AKAL is designed as an interactive sandbox. If you crash a database container or block outbound traffic using security group firewalls, you can immediately open terminals to debug why connections are failing, inspect Nginx configuration files, and understand the foundational networking concepts (routing, gateways, NAT, firewalls) that power modern cloud architecture.
