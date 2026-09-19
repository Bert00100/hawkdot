import nextJest from 'next/jest.js'

const createJestConfig = nextJest({ dir: './' })

const config = {
  testEnvironment: 'node',
  // O next/jest resolve o alias `@/` reescrevendo os imports no SWC, o que nao
  // alcanca o argumento de `jest.mock('@/...')` — ele e string comum, nao
  // especificador de import. O mapper abaixo cobre esse caso.
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  coverageProvider: 'v8',
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/generated/**',
    '!src/**/*.d.ts',
  ],
}

export default createJestConfig(config)
