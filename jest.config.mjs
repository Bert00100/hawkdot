import nextJest from 'next/jest.js'

const createJestConfig = nextJest({ dir: './' })

const config = {
  // Todos os arquivos de teste compartilham o MESMO banco hawkdot_test, e
  // cleanDatabase() faz TRUNCATE global. Com workers em paralelo (processos
  // distintos), o TRUNCATE de um arquivo pode apagar dados que outro arquivo
  // acabou de inserir e ainda vai usar -- gera falhas intermitentes de FK/RLS
  // que nao tem nada a ver com o codigo sendo testado. maxWorkers: 1 elimina
  // a corrida (o suite inteiro roda em segundos mesmo assim).
  maxWorkers: 1,
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
