# Redunxt 🎓

A modern, fast, and unified client engine for the Edunext School ERP (v4).

## Overview
- **Authentication**: JWT Bearer token authentication via Edunext v4 REST microservice.
- **Data Ingestion**: Clean JSON parsing for Circulars (with direct CloudFront PDF download links), Mailbox Communications, Attendance, and Announcements.
- **State Store**: Deduplication and state tracking to prevent duplicate alerts.
- **Notification Engine**: Integrated dispatchers for Web Push (PWA) and Telegram Bot.

## Setup

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Configure your credentials in `.env`:
   ```env
   EDUNEXT_USER_ID=your_id
   EDUNEXT_PASSWORD=your_password
   EDUNEXT_SCHOOL_DOMAIN=dpsharni.edunext2.com
   ```
3. Install dependencies:
   ```bash
   npm install
   ```

## CLI Commands

- **Test Connectivity & Endpoints**:
  ```bash
  npm run test:api
  ```
- **Run Sync Cycle**:
  ```bash
  npm run sync
  ```
- **Start Poller (Every 5 Minutes)**:
  ```bash
  npx tsx src/cli.ts poll
  ```
- **Inspect Circulars**:
  ```bash
  npx tsx src/cli.ts circulars
  ```
- **Inspect Mailbox**:
  ```bash
  npx tsx src/cli.ts mailbox
  ```
