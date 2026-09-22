# FounderFit Candidate Assessment

FounderFit is a two-sided founder-asset matching platform. Rather than asking if someone is a good founder in general, it evaluates whether a candidate is the right founder for a specific, validated technology asset.

The assessment measures candidates across three primary dimensions:
- Disposition: Stable traits designed around (e.g., ambiguity tolerance).
- Capability: Learnable competencies that close in 90 to 180 days (e.g., market translation).
- Adjacency: Asset-relative position (e.g., domain credibility, buyer-market access).

## Technology Stack

- Next.js 14 (App Router)
- React
- Tailwind CSS
- Prisma ORM
- SQLite (Local Development)

## Features

- Interactive Assessment Flow: Step-by-step evaluation covering forced-choice scenarios, situational judgment, and assessor calibration.
- Report Generation: Automatically generates a detailed fit report including strengths, structural considerations, and development priorities.
- PDF Export: Built-in print styles optimize the final report for clean, organized PDF exports.
- Local Persistence: Assessments and generated reports are saved locally using Prisma and SQLite.

## Getting Started

### Prerequisites

Ensure you have Node.js and npm installed on your local machine.

### Installation

1. Install the project dependencies:
```bash
npm install
```

2. Initialize the database and sync the schema:
```bash
npx prisma db push
```

3. Generate the Prisma Client:
```bash
npx prisma generate
```

### Running the Development Server

Start the Next.js development server:
```bash
npm run dev
```
Navigate to http://localhost:3000 in your browser to interact with the application.

## Deployment

This project is configured for deployment on Vercel. 

Important Note on Databases: 
The local development environment uses SQLite, which does not persist data on serverless functions. Before deploying to Vercel, you should provision a Vercel Postgres database:
1. Create a Vercel Postgres store in your Vercel project dashboard.
2. Update the `provider` in `prisma/schema.prisma` from `"sqlite"` to `"postgresql"`.
3. Set your `DATABASE_URL` environment variable in Vercel to your Postgres connection string.
4. Deploy the application. The `postinstall` script in package.json will automatically generate the Prisma client during the build process.
