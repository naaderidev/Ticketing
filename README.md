# Ticketing System 🎫

A Persian (RTL) ticketing and support system built with Next.js. It provides a complete helpdesk solution with ticket management, department organization, FAQ management, and real-time notifications for both admin and user interfaces.

## Features

- **Dual Interface** — separate admin and user dashboards with role-based access
- **Ticket Management** — create, reply, close, transfer, and rate tickets
- **Department System** — organize support with departments and sub-departments
- **FAQ Management** — create and manage frequently asked questions per department
- **Predefined Messages** — quick reply templates with short codes
- **Real-time Notifications** — instant notifications for new replies and updates
- **File Attachments** — attach files to tickets and replies
- **User Authentication** — mobile-based login and registration system
- **Dark / Light Theme** toggle
- **Fully RTL, Persian-language UI**

## Tech Stack

- [Next.js 16](https://nextjs.org/) (App Router) + React 19 + TypeScript
- [Tailwind CSS 4](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)
- [Prisma](https://www.prisma.io/) ORM + SQLite
- [TanStack React Query](https://tanstack.com/query/latest) for server state management
- [React Hook Form](https://react-hook-form.com/) + [Zod](https://zod.dev/) for form validation
- [React Multi Date Picker](https://github.com/majidhassan/react-multi-date-picker) for Persian date handling

## Getting Started

### Prerequisites

- Node.js 20+
- npm (or yarn/pnpm)

### Installation

```bash
git clone <this-repo-url>
cd ticketing-system
npm install
```

### Environment Variables

Create a `.env` file in the project root:

```env
DATABASE_URL="file:./dev.db"
```

### Database Setup

This project uses Prisma with SQLite. Initialize the database:

```bash
npx prisma db push
npx prisma db seed
```

### Run Locally

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to access the application.

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the development server |
| `npm run build` | Build for production |
| `npm run start` | Start the production server |
| `npm run lint` | Run ESLint |
| `npm run test` | Run tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |

## Project Structure

```
src/
  app/
    admin/          # Admin dashboard pages
    api/            # API route handlers
    user/           # User dashboard pages
  components/
    shared/         # Shared components (departments, notifications, etc.)
    ticket/         # Ticket-related components
    ui/             # shadcn/ui primitives
  contexts/         # React contexts (UserContext)
  hooks/            # Custom hooks (tickets, departments, FAQs, etc.)
  lib/              # Utilities, validations, services
    services/       # Business logic layer
  types/            # TypeScript type definitions
prisma/
  schema.prisma     # Database schema
```

## Architecture

The project follows Clean Code principles with a well-organized architecture:

- **Service Layer** — business logic separated into dedicated service files
- **API Routes** — RESTful API endpoints with proper error handling
- **Custom Hooks** — React Query hooks for data fetching and mutations
- **Shared Components** — reusable UI components across admin and user interfaces
- **Type Safety** — comprehensive TypeScript types throughout the codebase

## License

No license specified yet — add one (e.g. MIT) before treating this as open source.

## Acknowledgments

Built with ❤️ by **Bahareh Naderi** and **Mimo V2.5** .
