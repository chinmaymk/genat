# Coding Conventions

This document defines the coding conventions for the agent-corp project. All contributors - human and AI - must follow these conventions. Consistency makes the codebase easier to read, review, and maintain.

## Language and Runtime

- **Language**: TypeScript (strict mode).
- **Runtime**: Bun. Use Bun APIs in preference to Node.js APIs where equivalents exist.
- **Package manager**: Bun (`bun install`, `bun add`, `bun remove`). Do not use npm or yarn.
- **Target**: ESNext. Do not transpile down to older JavaScript targets.

## TypeScript

### Strict Mode

TypeScript is configured with `strict: true`. This means:
- No implicit `any`.
- No implicit `this`.
- Strict null checks are enabled.
- All function parameters and return types should have explicit types unless inference is unambiguous.

```typescript
// Good
function greet(name: string): string {
  return `Hello, ${name}`;
}

// Bad - implicit return type, implicit parameter type
function greet(name) {
  return `Hello, ${name}`;
}
```

### Type Definitions

- Prefer `interface` for object shapes that may be extended.
- Prefer `type` for unions, intersections, and aliases.
- Export types alongside the code that uses them.
- Use `unknown` instead of `any` when the type is genuinely unknown. Narrow with type guards.

```typescript
// Good
interface User {
  id: string;
  email: string;
  createdAt: Date;
}

type UserRole = 'admin' | 'member' | 'viewer';

// Avoid
const user: any = getUser();
```

### Null Handling

- Never use `null` and `undefined` interchangeably. Prefer `undefined` for optional values.
- Use optional chaining (`?.`) and nullish coalescing (`??`) instead of manual null checks.

```typescript
// Good
const name = user?.profile?.displayName ?? 'Anonymous';

// Avoid
const name = user && user.profile && user.profile.displayName ? user.profile.displayName : 'Anonymous';
```

## File and Folder Structure

```
src/
  routes/       # HTTP route handlers
  services/     # Business logic layer
  models/       # Data models and types
  middleware/   # HTTP middleware
  lib/          # Shared utilities and helpers
  config.ts     # Application configuration
  app.ts        # App setup and middleware registration
  index.ts      # Entry point (starts the server)
tests/
  routes/       # Tests for route handlers
  services/     # Tests for services
  lib/          # Tests for utilities
org/            # Organization docs (roles, skills, teams, knowledge)
data/           # Static or seed data
```

### File Naming

- Use `kebab-case` for all file names: `user-service.ts`, `rate-limit.ts`.
- Test files are co-located by convention or placed in `tests/` mirroring `src/`. Use `.test.ts` suffix.
- Do not use `index.ts` barrel files except at the top-level entry point.

## Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Variables | camelCase | `userId`, `requestBody` |
| Functions | camelCase | `getUser()`, `validateEmail()` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_RETRIES`, `DEFAULT_TIMEOUT` |
| Classes | PascalCase | `UserService`, `HttpClient` |
| Interfaces | PascalCase | `User`, `RequestOptions` |
| Types | PascalCase | `UserRole`, `ApiResponse<T>` |
| Enums | PascalCase (members: PascalCase) | `Status.Active` |
| Files | kebab-case | `user-service.ts` |

## Formatting

- Formatting is enforced by Prettier. Run `bun run format` before committing.
- Do not manually format code. Let Prettier handle it.
- Line length: 100 characters (configured in `.prettierrc`).
- Indentation: 2 spaces.
- Quotes: single quotes for strings in TypeScript.
- Semicolons: always.
- Trailing commas: always in multi-line expressions.

## Imports

- Use ES module imports (`import`/`export`). Do not use CommonJS (`require`).
- Order imports: external packages first, then internal modules, then relative imports. Separate groups with a blank line.
- Use named exports. Avoid default exports except for the main entry of a module.

```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { UserService } from '../services/user-service';
import { validateEmail } from '../lib/validation';

import type { User } from './types';
```

## Error Handling

- All errors must be handled or explicitly propagated. Do not silently swallow errors.
- Use a consistent error response format across all API endpoints:

```typescript
// Standard error response
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email is required",
    "details": [...]  // optional
  }
}
```

- Use typed error classes for different categories of errors:

```typescript
export class ValidationError extends Error {
  constructor(public readonly field: string, message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
```

- In route handlers, catch errors and return appropriate HTTP status codes. Do not let unhandled exceptions reach users.

## Testing

- **Framework**: Bun's built-in test runner (`bun test`).
- **Test file naming**: `*.test.ts`.
- Every public function in `src/services/` and `src/lib/` must have unit tests.
- Route handlers must have integration tests that test the HTTP interface.
- Tests must be deterministic. Do not use `Math.random()`, `Date.now()`, or external services without mocking.
- Use `describe` blocks to group related tests. Use `it` (not `test`) for individual test cases.

```typescript
import { describe, it, expect, beforeEach } from 'bun:test';

describe('UserService', () => {
  describe('findByEmail', () => {
    it('returns the user when email exists', async () => {
      // arrange
      // act
      // assert
    });

    it('returns undefined when email does not exist', async () => {
      // ...
    });
  });
});
```

## Git Conventions

### Commit Messages

Follow the Conventional Commits specification:

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `chore`, `refactor`, `test`, `docs`, `perf`, `ci`.

Examples:
- `feat(auth): add JWT token refresh endpoint`
- `fix(users): handle null email in lookup`
- `chore: upgrade bun to 1.2.0`

### Branches

- Branch naming: `<type>/<short-description>` (e.g., `feat/add-auth`, `fix/null-email-lookup`).
- Branch from `main`. Keep branches short-lived.
- Delete branches after merging.

## Documentation

- All exported functions, classes, and types must have JSDoc comments.
- JSDoc should describe what the function does, not how it does it.
- Keep comments up to date. Stale comments are worse than no comments.

```typescript
/**
 * Finds a user by their email address. Returns undefined if no user exists
 * with the given email.
 */
export async function findUserByEmail(email: string): Promise<User | undefined> {
  // ...
}
```

## Markdown

- All markdown files must be well-formed and pass a Markdown linter.
- Use ATX-style headers (`#`, `##`, `###`), not Setext style.
- Use fenced code blocks with language identifiers.
- Wrap lines at 120 characters in prose; leave code blocks unwrapped.
