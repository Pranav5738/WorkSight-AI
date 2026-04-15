# 🧠 WorkSight AI – Employee Monitoring & Attendance Platform

> 🚀 AI-powered workforce intelligence platform with face recognition, real-time monitoring, and productivity analytics.

![GitHub stars](https://img.shields.io/github/stars/Pranav5738/WorkSight-AI?style=for-the-badge)
![GitHub forks](https://img.shields.io/github/forks/Pranav5738/WorkSight-AI?style=for-the-badge)
![GitHub license](https://img.shields.io/github/license/Pranav5738/WorkSight-AI?style=for-the-badge)
![Issues](https://img.shields.io/github/issues/Pranav5738/WorkSight-AI?style=for-the-badge)

![React](https://img.shields.io/badge/Frontend-React-blue?style=for-the-badge&logo=react)
![FastAPI](https://img.shields.io/badge/Backend-FastAPI-green?style=for-the-badge&logo=fastapi)
![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL-blue?style=for-the-badge&logo=postgresql)
![Docker](https://img.shields.io/badge/Deployment-Docker-blue?style=for-the-badge&logo=docker)
![OpenCV](https://img.shields.io/badge/AI-OpenCV-red?style=for-the-badge&logo=opencv)

---

## 🚀 Features

- Face Recognition-based Attendance  
- Real-time Employee Monitoring  
- Admin & Manager Dashboard  
- Productivity Analytics  
- Secure Authentication (JWT)  
- Supabase / PostgreSQL Support  
- Docker-ready Deployment  

---

## 🧩 Problem It Solves

Traditional systems typically focus on either attendance tracking or activity monitoring — not both.

**WorkSight AI bridges this gap by combining:**

- Identity-based attendance (Face Recognition)  
- AI-driven monitoring insights  
- Centralized workforce management  

---

## 🏗️ Tech Stack

| Layer        | Technologies |
|-------------|-------------|
| **Frontend** | React.js, TypeScript, Vite, Tailwind CSS |
| **Backend**  | FastAPI, SQLAlchemy |
| **AI Layer** | OpenCV, ONNX Runtime |
| **Database** | PostgreSQL / Supabase |
| **Deployment** | Docker, Render, Vercel / Netlify |

---

## 📊 Core Modules

- Dashboard  
- Attendance System  
- Employee Enrollment  
- User Management  
- Monitoring & Analytics  
- System Logs  

---

## 📂 Core Models

- **Employee** – User identity & profile  
- **AttendanceRecord** – Daily attendance  
- **Embedding** – Face recognition vectors  
- **SystemLog** – Logs & diagnostics  
- **ProductivityDaily** – Productivity metrics  

---

## 📊 System Architecture

```mermaid
flowchart LR

A[User / Admin] --> B[Frontend - React + Vite]

B --> C[Backend API - FastAPI]

C --> D[Database - PostgreSQL / Supabase]

C --> E[AI Engine]
E --> F[Face Recognition - OpenCV]
E --> G[Inference - ONNX Runtime]

C --> H[Authentication - JWT]

C --> I[Monitoring & Analytics Engine]

I --> D

style A fill:#f9f,stroke:#333,stroke-width:1px
style B fill:#bbf,stroke:#333
style C fill:#bfb,stroke:#333
style D fill:#fbb,stroke:#333
style E fill:#ffb,stroke:#333
```

---

## 🧪 Local Setup

```bash
# Clone repository
git clone https://github.com/Pranav5738/WorkSight-AI.git

# Navigate into project
cd WorkSight-AI

# Install frontend dependencies
npm install

# Run frontend
npm run dev

# Start backend server
uvicorn main:app --reload
```

---

## 🐳 Deployment

- **Backend:** Docker (Render)  
- **Frontend:** Vercel / Netlify / Render  
- **Database:** Supabase / PostgreSQL  

---

## 🛣️ Roadmap

- Role-Based Access Control (RBAC)  
- Async AI processing  
- Advanced analytics dashboard  
- Multi-tenant architecture  

---

## 🤝 Contributing

1. Fork the repository  
2. Create a feature branch  
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. Commit changes  
   ```bash
   git commit -m "Add your message"
   ```
4. Push to GitHub  
   ```bash
   git push origin feature/your-feature-name
   ```
5. Open a Pull Request 🚀  

---

## 📜 License

This project is licensed under the **MIT License**.

---

## 👨‍💻 Author

**Pranav Shah**
