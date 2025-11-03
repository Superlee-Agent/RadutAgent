# RadutVerse

A production-ready web-based portal for managing, visualizing, and monetizing tokenized intellectual property (IP), integrated with blockchain infrastructure and IP SDKs such as the Story Protocol SDK.

## 📋 Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Development](#development)
- [Building & Deployment](#building--deployment)
- [Environment Variables](#environment-variables)
- [API Endpoints](#api-endpoints)
- [Features Detail](#features-detail)
- [Troubleshooting](#troubleshooting)
- [Security](#security)
- [Support](#support)

## Overview

RadutVerse is a comprehensive platform for IP (Intellectual Property) asset management and monetization on the blockchain. It enables users to register their IP, connect to the Web3 ecosystem through wallet integration, and participate in an NFT marketplace. The platform leverages the Story Protocol SDK for IP management and supports EVM-compatible wallets for authentication and transactions.

## Key Features

### 🎯 Core Functionality

- **IP Assistant**: Intelligent assistant for IP analysis and management with image attachment capabilities
- **IP Registration & Creation**: Submit metadata for IP assets and link social accounts (Twitter, Discord)
- **User Dashboard**: View and manage IP token ownership with detailed metadata
- **Wallet Integration**: EVM-compatible wallet support for authentication and blockchain transactions
- **Search & Explore**: Discover and browse IP tokens within the platform
- **IP Status Tracking**: Monitor ownership, activity, and transaction history
- **Chat History**: Access previous conversations with the IP Assistant
- **Portfolio Management**: Track and manage your IP asset portfolio

### 🌐 Additional Features

- **IP Fi Assistant**: Financial tools for IP monetization and analysis
- **NFT Marketplace**: Browse and trade IP-based NFTs
- **Settings Management**: Configure account preferences and integrations
- **Responsive Design**: Fully responsive UI optimized for desktop and mobile devices
- **Real-time Updates**: Live status and activity tracking

## Tech Stack

### Frontend

- **React 18** - UI framework
- **TypeScript** - Type-safe development
- **React Router 6** - Client-side routing (SPA mode)
- **Vite** - Next-generation bundler and dev server
- **TailwindCSS 3** - Utility-first CSS framework
- **Radix UI** - Accessible component library
- **Lucide React** - Icon library
- **Framer Motion** - Animation library
- **TanStack React Query** - Data fetching and caching
- **React Hook Form** - Form state management
- **Zod** - Runtime type validation

### Backend

- **Express.js 5.x** - HTTP server framework
- **Node.js** - JavaScript runtime
- **Multer** - File upload middleware
- **CORS** - Cross-origin resource sharing

### Blockchain & Web3

- **@story-protocol/core-sdk** - Story Protocol integration
- **@privy-io/react-auth** - Wallet authentication
- **Viem** - Ethereum library

### Development Tools

- **Vitest** - Unit testing framework
- **TypeScript** - Static type checking
- **Prettier** - Code formatter
- **SWC** - Fast JavaScript compiler

### External APIs

- **OpenAI API** - AI-powered image analysis and IP verification
- **Pinata IPFS** - Decentralized file storage
- **Story Protocol API** - IP asset information and management

## Project Structure

```
RadutVerse/
├── client/                          # React SPA Frontend
│   ├── pages/                       # Route components
│   │   ├── Index.tsx               # Home page (IP Assistant)
│   │   ├── IpAssistant.tsx         # Main IP Assistant interface
│   │   ├── IpfiAssistant.tsx       # Financial assistance features
│   │   ├── MyPortfolio.tsx         # Portfolio management
│   │   ├── NftMarketplace.tsx      # Marketplace interface
│   │   ├── History.tsx             # Chat history
│   │   ├── Settings.tsx            # User settings
│   │   └── NotFound.tsx            # 404 page
│   ├── components/
│   │   ├── layout/                 # Layout components
│   │   │   └── DashboardLayout.tsx # Main layout with sidebar
│   │   ├── ip-assistant/           # IP Assistant specific components
│   │   │   ├── ChatInput.tsx       # Input field and file upload
│   │   │   ├── ChatHeaderActions.tsx # Header controls
│   │   │   ├── SidebarExtras.tsx   # Sidebar extensions
│   │   │   └── ...                 # Other assistant components
│   │   └── ui/                     # Pre-built UI components
│   │       ├── button.tsx
│   │       ├── dialog.tsx
│   │       ├── input.tsx
│   │       └── ...                 # Other UI components
│   ├── hooks/                      # Custom React hooks
│   │   ├── use-mobile.tsx          # Mobile detection
│   │   └── useIPRegistrationAgent.ts # IP registration logic
│   ├── lib/                        # Utility libraries
│   │   ├── ip-assistant/           # IP Assistant utilities
│   │   ├── license/                # License utilities
│   │   └── utils/                  # General utilities
│   ├── config/                     # Configuration files
│   │   └── navigation.ts           # Navigation structure
│   ├── App.tsx                     # Root component with routing
│   ├── global.css                  # Global styles and theme
│   └── vite-env.d.ts               # Vite environment types
│
├── server/                         # Express Backend
│   ├── routes/                     # API route handlers
│   │   ├── check-ip-assets.ts
│   │   ├── analyze-image-vision.ts
│   │   ├── capture-asset-vision.ts
│   │   └── ...                     # Other API routes
│   ├── data/                       # Data files
│   │   └── remix-hashes.json      # Remix hash whitelist
│   ├── utils/                      # Server utilities
│   │   └── remix-hash-whitelist.ts
│   ├── index.ts                    # Express server setup
│   └── node-build.ts               # Node build configuration
│
├── api/                            # API endpoints
│   └── index.ts                    # Lambda/Serverless function entry
│
├── netlify/                        # Netlify serverless functions
│   └── functions/
│       └── api.ts                  # Netlify function handler
│
├── public/                         # Static assets
│   ├── placeholder.svg
│   └── robots.txt
│
├── Configuration Files
│   ├── vite.config.ts              # Vite bundler config
│   ├── vite.config.server.ts       # Server build config
│   ├── tailwind.config.ts          # TailwindCSS theme config
│   ├── tsconfig.json               # TypeScript config
│   ├── postcss.config.js           # PostCSS config
│   ├── components.json             # UI components index
│   ├── .env.example                # Example environment variables
│   ├── package.json                # Dependencies and scripts
│   └── pnpm-lock.yaml              # Dependency lock file
│
└── Documentation
    ├── README.md                   # This file
    ├── DEPLOYMENT_GUIDE.md         # Deployment instructions
    └── AGENTS.md                   # Architecture overview
```

## Prerequisites

Before getting started, ensure you have the following installed:

- **Node.js**: v18.0.0 or higher
- **pnpm**: v10.14.0 or higher (recommended package manager)
  - Install globally: `npm install -g pnpm`
- **Git**: For version control
- **Vercel Account**: For deployment (optional)
- **Story Protocol Account**: For IP asset access

### Required API Keys

- **OpenAI API Key**: For image analysis and AI features
- **Pinata API Key & Gateway**: For IPFS file storage
- **Story Protocol API Key**: For IP asset management
- **Story RPC Endpoint**: For blockchain interaction

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/radutverse.git
cd radutverse
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Configure Environment Variables

Create a `.env.local` file in the root directory:

```env
# Story Protocol
VITE_PUBLIC_STORY_RPC=https://aeneid.storyrpc.io
VITE_PUBLIC_SPG_COLLECTION=0xc32A8a0FF3beDDDa58393d022aF433e78739FAbc

# API Keys
STORY_API_KEY=your_story_api_key
OPENAI_API_KEY=your_openai_api_key
OPENAI_VERIFIER_MODEL=gpt-4o

# Pinata IPFS
PINATA_JWT=your_pinata_jwt
PINATA_GATEWAY=your_pinata_gateway

# Authentication
VITE_GUEST_PRIVATE_KEY=your_guest_private_key
```

**⚠️ Security Note**: Never commit `.env` files. Use `.env.local` for local development only.

### 4. Verify Installation

```bash
pnpm typecheck
```

## Development

### Start Development Server

```bash
pnpm dev
```

This command:

- Starts the Vite dev server on `http://localhost:5173`
- Launches the Express backend on the same port
- Enables hot module replacement (HMR) for instant updates

### Development Commands

```bash
# Type checking
pnpm typecheck

# Run tests
pnpm test

# Format code
pnpm format.fix

# Build for production
pnpm build

# Start production server
pnpm start
```

### Key Development Features

- **Hot Reload**: Both frontend and backend code reload automatically on changes
- **Type Safety**: Full TypeScript support with real-time type checking
- **Component Library**: Pre-built Radix UI components with TailwindCSS styling
- **API Integration**: Express API endpoints prefixed with `/api/`

## Building & Deployment

### Production Build

```bash
pnpm build
```

This generates:

- `dist/spa/` - Optimized React frontend
- `dist/server/` - Compiled Node.js backend

### Deployment Options

#### Vercel (Recommended)

1. **Connect Repository**:
   - Push code to GitHub
   - Connect repository to Vercel

2. **Configure Environment Variables**:
   - Go to Vercel Dashboard → Settings → Environment Variables
   - Add all required environment variables
   - Select appropriate environments (Production, Preview, Development)

3. **Deploy**:

   ```bash
   vercel
   # Or push to main branch for automatic deployment
   git push origin main
   ```

4. **Verify Deployment**:
   - Check Vercel dashboard for successful build
   - Verify environment variables are set
   - Test API endpoints

See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for detailed instructions.

#### Netlify

1. Connect repository to Netlify
2. Set environment variables in Netlify settings
3. Configure build command: `pnpm build`
4. Configure publish directory: `dist/spa`
5. Deploy

#### Self-Hosted (Docker)

```bash
# Build Docker image
docker build -t radutverse .

# Run container
docker run -p 8080:8080 \
  -e STORY_API_KEY=your_key \
  -e OPENAI_API_KEY=your_key \
  radutverse
```

## Environment Variables

### Frontend Variables (Prefixed with `VITE_PUBLIC_`)

These are exposed to the browser:

| Variable                     | Purpose                         | Example                      |
| ---------------------------- | ------------------------------- | ---------------------------- |
| `VITE_PUBLIC_STORY_RPC`      | Story Protocol RPC endpoint     | `https://aeneid.storyrpc.io` |
| `VITE_PUBLIC_SPG_COLLECTION` | Story Protocol contract address | `0xc32A8a0FF...`             |
| `VITE_GUEST_PRIVATE_KEY`     | Guest authentication key        | `bb628c194f...`              |

### Server Variables (Private)

Only available on the server:

| Variable                | Purpose                           | Required |
| ----------------------- | --------------------------------- | -------- |
| `STORY_API_KEY`         | Story Protocol API authentication | ✅ Yes   |
| `OPENAI_API_KEY`        | OpenAI API for image analysis     | ✅ Yes   |
| `OPENAI_VERIFIER_MODEL` | Model for verification            | ✅ Yes   |
| `PINATA_JWT`            | Pinata IPFS authentication        | ✅ Yes   |
| `PINATA_GATEWAY`        | Pinata gateway domain             | ✅ Yes   |

## API Endpoints

### IP Assets

**Check IP Assets**

```
POST /api/check-ip-assets
Content-Type: application/json

{
  "address": "0x1234567890123456789012345678901234567890"
}

Response:
{
  "address": "0x1234567890123456789012345678901234567890",
  "totalCount": 10,
  "originalCount": 5,
  "remixCount": 5
}
```

### Image Analysis

**Analyze Image with Vision**

```
POST /api/analyze-image-vision
Content-Type: multipart/form-data

- file: <image_file>
- address: 0x...

Response:
{
  "analysis": "...",
  "metadata": {...},
  "suggestions": [...]
}
```

**Capture Asset Vision**

```
POST /api/capture-asset-vision
Content-Type: application/json

{
  "description": "Asset description",
  "address": "0x..."
}

Response:
{
  "ipfsCid": "Qm...",
  "metadata": {...}
}
```

## Features Detail

### IP Assistant

The main feature allowing users to:

- Upload and analyze IP-related images
- Get AI-powered insights about IP assets
- Query IP information by wallet address
- Track IP registration and ownership

**Key Components**:

- `ChatInput.tsx` - Text and image input
- `ChatHeaderActions.tsx` - Header controls
- `AddRemixImageModal.tsx` - Remix image management
- AI-powered image analysis using OpenAI Vision

### Portfolio Management

Track and visualize your IP asset portfolio:

- View owned IP tokens
- Monitor value and ownership changes
- Transaction history
- Asset metadata

### Marketplace

Browse and discover IP-based NFTs:

- Search filters
- Asset details
- Price comparison
- Quick purchase/bidding interface

### Settings

Manage account preferences:

- Wallet connection settings
- Account preferences
- Privacy settings
- API integrations

## Troubleshooting

### Common Issues

#### 1. Build Errors

```
Error: Cannot find module 'viem'
```

**Solution**: Ensure all dependencies are installed

```bash
pnpm install
```

#### 2. API Key Errors

```
Error: STORY_API_KEY not set
```

**Solution**: Verify environment variables are set correctly

```bash
# Check if file exists
cat .env.local

# For Vercel deployment
vercel env ls
```

#### 3. Wallet Connection Issues

```
Error: Invalid Ethereum address format
```

**Solution**: Ensure wallet address format is correct

- Must start with `0x`
- Followed by exactly 40 hexadecimal characters
- Example: `0x1234567890123456789012345678901234567890`

#### 4. Development Server Not Starting

```bash
# Kill process on port 5173
lsof -ti:5173 | xargs kill -9

# Restart dev server
pnpm dev
```

#### 5. Type Errors

```bash
# Run type checking
pnpm typecheck

# Check for TypeScript errors
```

### Debug Mode

Enable detailed logging:

```typescript
// In your component
console.log("Debug:", {
  address,
  assets,
  error,
});
```

Check browser DevTools Console for detailed error messages.

## Security

### Best Practices

1. **Never Commit Secrets**:
   - Use `.env.local` for local development
   - Use Vercel/Netlify environment variable management for production

2. **API Key Protection**:
   - Server-side API calls only
   - API keys never exposed to browser
   - Use environment variables, never hardcode

3. **Input Validation**:
   - Validate all user inputs on the server
   - Use Zod for runtime type checking
   - Sanitize file uploads

4. **CORS Configuration**:
   - Whitelist trusted origins
   - Validate request sources

5. **Wallet Security**:
   - Only connect legitimate wallets
   - Verify contract addresses before transactions
   - Never share private keys

### Security Headers

The server includes security headers:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`

## Support

### Documentation

- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) - Detailed deployment instructions
- [AGENTS.md](./AGENTS.md) - Architecture and design patterns
- [TypeScript Documentation](https://www.typescriptlang.org/docs)
- [React Documentation](https://react.dev)
- [Story Protocol Docs](https://docs.storyprotocol.xyz)

### Getting Help

1. **Check Documentation**: Review DEPLOYMENT_GUIDE.md and AGENTS.md
2. **Browser Console**: Look for error messages in DevTools
3. **Server Logs**: Check terminal output for backend errors
4. **Vercel Logs**: `vercel logs` for production issues

### Reporting Issues

When reporting issues, include:

- Error message (full text)
- Steps to reproduce
- Environment details (Node version, OS)
- Browser/console logs
- Environment variables set (sanitized)

### Community Support

- Story Protocol: https://discord.gg/storyprotocol
- Vercel: https://vercel.com/support
- OpenAI: https://platform.openai.com/docs

## Contributing

Contributions are welcome! Please follow these guidelines:

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/amazing-feature`
3. **Commit** changes: `git commit -m 'Add amazing feature'`
4. **Push** to branch: `git push origin feature/amazing-feature`
5. **Open** a Pull Request

### Code Style

- Use TypeScript for type safety
- Follow existing code patterns
- Run `pnpm format.fix` before committing
- Ensure `pnpm typecheck` passes
- Write tests for new features

### Commit Messages

Use clear, descriptive commit messages:

```
feat: add IP asset search filter
fix: resolve wallet connection issue
docs: update deployment guide
refactor: simplify portfolio component
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- **Story Protocol** - IP asset management infrastructure
- **Privy** - Wallet authentication
- **OpenAI** - Image analysis and AI capabilities
- **Pinata** - IPFS storage
- **Radix UI** - Accessible component library
- **TailwindCSS** - Styling framework

---

**RadutVerse** - Tokenizing Intellectual Property for the Blockchain Era

For more information, visit our [documentation](./DEPLOYMENT_GUIDE.md) or contact support.
