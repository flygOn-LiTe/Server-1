# 2004scape Development Guidelines

## Commands
- `npm run dev` - Start the development server with watch mode
- `npm run build` - Build the cache files
- `npm run lint` - Run ESLint on source code
- `npm test` - Run all tests
- `npm test -- src/path/to/file.test.ts` - Run specific test file
- `npm run precommit` - Format code and fix linting issues

## Code Style
- **Indentation**: 4 spaces
- **Quotes**: Single quotes, avoid escape when possible
- **Imports**: Order - builtin, external, internal; grouped with newlines
- **Types**: TypeScript strict mode, minimize use of `any`
- **Naming**: Use underscores for unused vars (`_unusedVar`)
- **Error Handling**: Use try/catch with type checking (`if (err instanceof Error)`)
- **Commits**: Follow conventional commits format (feat/fix/chore/docs/etc)

## Project Structure
- Use module imports with `#/` prefix for src files
- Tests should be named `*.test.ts` next to implementation files
- Benchmark files should be named `*.bench.ts`