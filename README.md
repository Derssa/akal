![cover-torollo](https://unpkg.com/torollo/assets/cover-torollo.png)

# TOROLLO — Backend Systems Lab

[![torollo version](https://img.shields.io/npm/v/torollo.svg?label=version&style=flat-square)](https://www.npmjs.com/package/torollo)
[![license](https://img.shields.io/npm/l/torollo.svg?style=flat-square)](https://github.com/Derssa/torollo/blob/main/LICENSE)
[![node-current](https://img.shields.io/node/v/torollo.svg?style=flat-square)](https://nodejs.org)

> **A local-first visual simulator and educational playground for backend engineering and system design, inspired by Packet Tracer.**

TOROLLO is an interactive, visual sandbox designed to help students and developers learn backend architecture, Docker, networking, databases, and system design by actually building and running systems on their local machines.

## 🛠️ Technology Stack
*   **Frontend:** React, TypeScript, Vite, React Flow, xterm.js
*   **Backend:** Node.js, Express, TypeScript, Socket.io
*   **Orchestration:** Docker, Dockerode (Interacts directly with your local Docker Daemon)

---

## ⚡ Quick Start

Run the lab instantly from your terminal without needing to clone the repo or install anything permanently:

```bash
npx torollo start
```
*(Note: Ensure Docker Desktop is running before starting, as Torollo orchestrates real local containers)*

---

## 🏗️ Supported Infrastructure Nodes

You can drag and drop a wide range of infrastructure components onto the canvas. Everything is backed by **real Docker containers** running locally on your machine.

*   **Computing**
    *   **Ubuntu Server:** A basic Linux container. Includes a fully functional, native web-terminal integrated directly into your browser via WebSockets.
    *   **Auto Scaling Group (ASG):** Define a template and scale replicas up or down instantly.
*   **Databases**
    *   **PostgreSQL:** Relational database node. Features a built-in interactive Explorer to view schemas, tables, and execute SQL queries directly from the UI.
    *   **MongoDB (NoSQL):** Document database node. Features an interactive Explorer to view collections and run JSON queries without needing external GUI clients.
*   **Networking & Security**
    *   **VPC & Subnets:** Isolated network boundaries backed by custom Docker bridge networks.
    *   **Security Groups:** Drag-and-drop visual firewall rules (Inbound/Outbound). Rules are converted and enforced using actual `iptables` injected securely into the containers.
    *   **Load Balancer (Nginx):** Automatically generates upstream `nginx.conf` configurations based on the nodes you wire to it.
    *   **NAT Gateway:** Provides outbound internet access for private subnets using true Linux `ip_forward=1` and `MASQUERADE` routing.

---

## 🚀 Coming Very Soon

*   **Terraform Generation:** Automatic Infrastructure-as-Code (IaC) generation for your visual architectures, supporting every major cloud provider (AWS, Azure, GCP).
*   **Databases:** Redis In-Memory Cache
*   **Message Brokers:** RabbitMQ, Kafka
*   **Application Services:** API Service, Microservices Host, Serverless Functions
*   **Observability:** Live Metrics, Logs, & Monitoring Components

---

## 🎨 Core Features & Architecture

### Interactive Learning by Doing
Instead of reading passive, theory-heavy documentation, you learn by *doing*:
- **Create Systems:** Drag and drop real components to build architectures.
- **Run & Connect:** Wire services together and see how they interact.
- **Simulate Traffic:** Use the built-in Network Simulator to send pings and watch mock traffic flow through the system.
- **Web Terminals:** Instantly open a root shell into any Ubuntu or Database container straight from the browser.

### Architecture Overview
*   **Backend:** Node.js, Express, TypeScript, and Dockerode. The backend acts as the supervisor—it manipulates the local Docker daemon, compiles your visual network topology into real `iptables` rules, and manages persistent state in `~/.torollo/projects.json`.
*   **Frontend:** React, TypeScript, Vite, and React Flow. Renders the interactive visual grid, node inspector modals, database explorers, and `xterm.js` terminals.

---

## 🛡️ Core Philosophy

Everything runs **locally** on your machine. 
- **No Cloud integrations** (No AWS credentials needed).
- **No remote infrastructure** is created, billed, or managed. 
- All nodes in the workspace correspond exactly to live Docker containers on your local system.

*Note: This project is strictly educational. It is not an AWS clone or a production infrastructure management tool—it is a sandboxed simulator designed to make system design tangible, visual, and fun.*
