# Mirai Frontend

React/Next.js frontend for the Mirai learning platform.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **State Management**: Redux Toolkit
- **Styling**: Tailwind CSS
- **Icons**: Lucide React

## Getting Started

### Install Dependencies
```bash
npm install
```

### Run Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

### Build for Production
```bash
npm run build
npm start
```

## Project Structure
```
frontend/
├── src/
│   ├── app/              # Next.js pages (App Router)
│   ├── components/       # React components
│   ├── store/           # Redux store and slices
│   ├── lib/             # Utilities and mock data
│   └── types/           # TypeScript type definitions
├── public/              # Static assets
└── k8s/                # Kubernetes manifests
```

## Available Routes

- `/` - Redirects to dashboard
- `/dashboard` - Main dashboard with course creation options
- `/course-builder` - Multi-step course creation wizard
- `/content-library` - Browse and manage content

## Docker

### Build Image
```bash
docker build -t mirai-frontend:latest .
```

### Run Container
```bash
docker run -p 3000:3000 mirai-frontend:latest
```

## Kubernetes Deployment

The app is configured to deploy to your Talos Kubernetes cluster via ArgoCD.

### Manual Deploy
```bash
kubectl apply -k k8s/frontend/
```

### Check Status
```bash
kubectl get pods -l app=mirai-frontend
kubectl logs -l app=mirai-frontend -f
```

## Features

### Implemented

- ✅ Dashboard with course creation cards
- ✅ Multi-step course builder wizard
- ✅ Persona management
- ✅ Content library with folder navigation
- ✅ Redux state management
- ✅ Responsive sidebar
- ✅ Mock data for development

### Coming Soon

- 🔄 Backend API integration
- 🔄 AI course generation
- 🔄 User authentication
- 🔄 Real-time collaboration
- 🔄 Content import (PDF, DOCX, MP4)

## Environment Variables

Create a `.env.local` file:
```
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## Development Notes

- Uses Redux Toolkit for state management
- All forms use controlled components
- Mock data in `src/lib/mockData.ts`
- Security contexts match production requirements
